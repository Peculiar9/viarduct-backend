import 'reflect-metadata';
import 'dotenv/config';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { Worker, QueueScheduler } = require('bullmq');

import { DIContainer } from '../Core/DIContainer';
import { TYPES } from '../Core/Types/Constants';
import { getRedisConnection } from '../Infrastructure/Queues/redisConnection';
import { SYSTEM_ANNOUNCEMENTS_QUEUE_NAME } from '../Infrastructure/Queues/systemAnnouncementsQueue';
import { SystemAnnouncementRepository } from '../Infrastructure/Repository/SQL/system-announcements/SystemAnnouncementRepository';
import { SystemAnnouncementDeliveryRepository } from '../Infrastructure/Repository/SQL/system-announcements/SystemAnnouncementDeliveryRepository';
import { UserRepository } from '../Infrastructure/Repository/SQL/users/UserRepository';
import { SystemAnnouncementStatus } from '../Core/Application/Enums/SystemAnnouncementStatus';
import { SystemAnnouncementDeliveryStatus } from '../Core/Application/Enums/SystemAnnouncementDeliveryStatus';
import { SystemAnnouncementChannel } from '../Core/Application/Enums/SystemAnnouncementChannel';
import { INotificationService } from '../Core/Application/Interface/Services/INotificationService';
import { NotificationType } from '../Core/Application/Enums/NotificationType';
import { ITwilioEmailService } from '../Core/Application/Interface/Services/ITwilioEmailService';

const FANOUT_BATCH_SIZE = Number(process.env.SYSTEM_ANNOUNCEMENTS_FANOUT_BATCH || 500);
const DELIVER_CONCURRENCY = Number(process.env.SYSTEM_ANNOUNCEMENTS_DELIVER_CONCURRENCY || 20);

function normalizeChannels(raw: any): string[] {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw.map(String);
    // Some pg clients return TEXT[] as string like "{a,b}"
    if (typeof raw === 'string' && raw.startsWith('{') && raw.endsWith('}')) {
        const inner = raw.slice(1, -1);
        if (!inner) return [];
        return inner.split(',').map(s => s.trim()).filter(Boolean);
    }
    return [];
}

async function run() {
    const container = DIContainer.getInstance();

    const announcementRepo = container.get<SystemAnnouncementRepository>(TYPES.SystemAnnouncementRepository);
    const deliveryRepo = container.get<SystemAnnouncementDeliveryRepository>(TYPES.SystemAnnouncementDeliveryRepository);
    const userRepo = container.get<UserRepository>(TYPES.UserRepository);
    const notificationService = container.get<INotificationService>(TYPES.NotificationService);
    const emailService = container.get<ITwilioEmailService>(TYPES.TwilioEmailService);

    const connection = getRedisConnection();

    // Needed for delayed jobs reliability
    // eslint-disable-next-line no-new
    new QueueScheduler(SYSTEM_ANNOUNCEMENTS_QUEUE_NAME, { connection });

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Queue } = require('bullmq');
    const q = new Queue(SYSTEM_ANNOUNCEMENTS_QUEUE_NAME, { connection });

    const publishWorker = new Worker(
        SYSTEM_ANNOUNCEMENTS_QUEUE_NAME,
        async (job: any) => {
            if (job.name !== 'publish') return;
            const announcementId = job.data?.announcementId;
            if (!announcementId) return;

            const announcement = await announcementRepo.findById(announcementId);
            if (!announcement) return;

            // If already completed/cancelled, do nothing
            const currentStatus = String(announcement.status);
            if ([SystemAnnouncementStatus.COMPLETED, SystemAnnouncementStatus.CANCELLED].includes(currentStatus as any)) {
                return;
            }

            // Mark as publishing + published_at
            await announcementRepo.update(announcementId, {
                status: SystemAnnouncementStatus.PUBLISHING,
                published_at: new Date().toISOString()
            } as any);

            const channels = normalizeChannels((announcement as any).broadcast_channels);
            if (channels.length === 0) {
                await announcementRepo.update(announcementId, { status: SystemAnnouncementStatus.FAILED } as any);
                return;
            }

            let offset = 0;
            let totalDeliveries = 0;

            while (true) {
                const users = await userRepo.listEligibleForSystemAnnouncements({ limit: FANOUT_BATCH_SIZE, offset });
                if (!users || users.length === 0) break;

                const deliveries: any[] = [];
                for (const u of users) {
                    for (const ch of channels) {
                        deliveries.push({
                            announcement_id: announcementId,
                            user_id: u._id,
                            channel: ch,
                            status: SystemAnnouncementDeliveryStatus.PENDING,
                            attempts: 0,
                            last_error: null,
                            sent_at: null
                        });
                    }
                }

                // Insert in chunks to avoid huge statements
                const chunkSize = 1000;
                for (let i = 0; i < deliveries.length; i += chunkSize) {
                    const chunk = deliveries.slice(i, i + chunkSize);
                    const created = await deliveryRepo.bulkCreate(chunk as any);
                    totalDeliveries += created.length;

                    // Enqueue delivery jobs in bulk
                    const deliverJobs = created.map((d: any) => ({
                        name: 'deliver',
                        data: { deliveryId: d._id },
                        opts: {
                            attempts: 3,
                            backoff: { type: 'exponential', delay: 5000 },
                            removeOnComplete: 2000,
                            removeOnFail: 5000
                        }
                    }));

                    await q.addBulk(deliverJobs);
                }

                offset += users.length;
            }

            await announcementRepo.setTotals({ id: announcementId, total: totalDeliveries });
        },
        { connection, concurrency: 2 }
    );

    const deliverWorker = new Worker(
        SYSTEM_ANNOUNCEMENTS_QUEUE_NAME,
        async (job: any) => {
            if (job.name !== 'deliver') return;
            const deliveryId = job.data?.deliveryId;
            if (!deliveryId) return;

            const locked = await deliveryRepo.tryMarkProcessing(deliveryId);
            if (!locked) return; // already processed by another worker

            const announcement = await announcementRepo.findById(locked.announcement_id);
            if (!announcement) {
                await deliveryRepo.markFailed(deliveryId, (locked.attempts || 0) + 1, 'Announcement not found');
                return;
            }

            const channel = String(locked.channel);
            const userId = locked.user_id;

            try {
                if (channel === SystemAnnouncementChannel.IN_APP_NOTIFICATION) {
                    const created = await notificationService.create({
                        user_id: userId,
                        type: NotificationType.SYSTEM_ANNOUNCEMENTS,
                        title: announcement.title,
                        content: announcement.content,
                        url: announcement.url ?? null
                    } as any);
                    if (!created) {
                        await deliveryRepo.markSkipped(deliveryId);
                        await announcementRepo.incrementCounters({ id: announcement._id!, sentDelta: 1 });
                        return;
                    }
                } else if (channel === SystemAnnouncementChannel.EMAIL) {
                    const user = await userRepo.findById(userId);
                    if (!user?.email) {
                        await deliveryRepo.markFailed(deliveryId, (locked.attempts || 0) + 1, 'User email missing');
                        await announcementRepo.incrementCounters({ id: announcement._id!, failedDelta: 1 });
                        return;
                    }

                    const subject = announcement.title;
                    const htmlContent = `
                        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111;">
                          <h2>${announcement.title}</h2>
                          <p>${String(announcement.content).replace(/\n/g, '<br/>')}</p>
                          ${announcement.url ? `<p><a href="${announcement.url}">Open</a></p>` : ''}
                        </div>
                    `;
                    const textContent = `${announcement.title}\n\n${announcement.content}\n\n${announcement.url ? announcement.url : ''}`;

                    await emailService.sendEmail({
                        to: user.email,
                        subject,
                        htmlContent,
                        textContent
                    });
                } else {
                    // Not implemented yet (sms/push)
                    await deliveryRepo.markFailed(deliveryId, (locked.attempts || 0) + 1, `Unsupported channel: ${channel}`);
                    await announcementRepo.incrementCounters({ id: announcement._id!, failedDelta: 1 });
                    return;
                }

                await deliveryRepo.markSent(deliveryId);
                await announcementRepo.incrementCounters({ id: announcement._id!, sentDelta: 1 });
            } catch (err: any) {
                const attempts = (locked.attempts || 0) + 1;
                await deliveryRepo.markFailed(deliveryId, attempts, err?.message || 'Failed');
                await announcementRepo.incrementCounters({ id: announcement._id!, failedDelta: 1 });
            }

            // If finished, mark completed
            try {
                const stats = await deliveryRepo.countsForAnnouncement(locked.announcement_id);
                if (stats.total > 0 && stats.sent + stats.failed >= stats.total) {
                    await announcementRepo.update(locked.announcement_id, {
                        status: SystemAnnouncementStatus.COMPLETED,
                        completed_at: new Date().toISOString()
                    } as any);
                }
            } catch {
                // ignore
            }
        },
        { connection, concurrency: DELIVER_CONCURRENCY }
    );

    publishWorker.on('failed', (job: any, err: any) => {
        // eslint-disable-next-line no-console
        console.error('Publish worker failed', { jobId: job?.id, err: err?.message });
    });
    deliverWorker.on('failed', (job: any, err: any) => {
        // eslint-disable-next-line no-console
        console.error('Deliver worker failed', { jobId: job?.id, err: err?.message });
    });

    // eslint-disable-next-line no-console
    console.log('✅ System announcements worker running', {
        fanoutBatch: FANOUT_BATCH_SIZE,
        deliverConcurrency: DELIVER_CONCURRENCY
    });
}

run().catch((e) => {
    // eslint-disable-next-line no-console
    console.error('❌ Failed to start system announcements worker', e);
    process.exit(1);
});

