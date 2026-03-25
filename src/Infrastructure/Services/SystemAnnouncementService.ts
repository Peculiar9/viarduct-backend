import { inject, injectable } from 'inversify';
import { TYPES } from '../../Core/Types/Constants';
import { ISystemAnnouncementService, CreateSystemAnnouncementInput, UpdateSystemAnnouncementInput, SystemAnnouncementListResult } from '../../Core/Application/Interface/Services/ISystemAnnouncementService';
import { SystemAnnouncementRepository } from '../Repository/SQL/system-announcements/SystemAnnouncementRepository';
import { SystemAnnouncementDeliveryRepository } from '../Repository/SQL/system-announcements/SystemAnnouncementDeliveryRepository';
import { NotFoundError, ValidationError } from '../../Core/Application/Error/AppError';
import { SystemAnnouncementStatus } from '../../Core/Application/Enums/SystemAnnouncementStatus';
import { getSystemAnnouncementsQueue } from '../Queues/systemAnnouncementsQueue';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

@injectable()
export class SystemAnnouncementService implements ISystemAnnouncementService {
    constructor(
        @inject(TYPES.SystemAnnouncementRepository) private readonly announcementRepo: SystemAnnouncementRepository,
        @inject(TYPES.SystemAnnouncementDeliveryRepository) private readonly deliveryRepo: SystemAnnouncementDeliveryRepository
    ) {}

    async createDraft(input: CreateSystemAnnouncementInput) {
        if (!input.created_by_admin_id) throw new ValidationError('created_by_admin_id is required');
        if (!input.title || String(input.title).trim() === '') throw new ValidationError('title is required');
        if (!input.content || String(input.content).trim() === '') throw new ValidationError('content is required');
        if (!Array.isArray(input.broadcast_channels) || input.broadcast_channels.length === 0) {
            throw new ValidationError('broadcast_channels is required');
        }

        const channelsJson = JSON.stringify(input.broadcast_channels);

        return await this.announcementRepo.create({
            title: String(input.title).trim(),
            description: input.description ?? null,
            content: String(input.content).trim(),
            url: input.url ?? null,
            broadcast_channels: channelsJson as any,
            status: SystemAnnouncementStatus.DRAFT,
            scheduled_at: null,
            published_at: null,
            completed_at: null,
            total_recipients: 0,
            sent_count: 0,
            failed_count: 0,
            created_by_admin_id: input.created_by_admin_id
        } as any);
    }

    async updateDraft(id: string, adminId: string, input: UpdateSystemAnnouncementInput) {
        const existing = await this.announcementRepo.findById(id);
        if (!existing) throw new NotFoundError('Announcement not found');
        if (existing.created_by_admin_id !== adminId) {
            throw new ValidationError('You cannot update this announcement');
        }
        if (String(existing.status) !== SystemAnnouncementStatus.DRAFT) {
            throw new ValidationError('Only draft announcements can be updated');
        }

        const patch: any = {};
        if (input.title !== undefined) patch.title = String(input.title).trim();
        if (input.description !== undefined) patch.description = input.description ?? null;
        if (input.content !== undefined) patch.content = String(input.content).trim();
        if (input.url !== undefined) patch.url = input.url ?? null;
        if (input.broadcast_channels !== undefined) {
            if (!Array.isArray(input.broadcast_channels) || input.broadcast_channels.length === 0) {
                throw new ValidationError('broadcast_channels must be a non-empty array');
            }
            patch.broadcast_channels = JSON.stringify(input.broadcast_channels) as any;
        }

        const updated = await this.announcementRepo.update(id, patch);
        if (!updated) throw new NotFoundError('Announcement not found');
        return updated;
    }

    async listForAdmin(options: { status?: SystemAnnouncementStatus | string; limit?: number; offset?: number }): Promise<SystemAnnouncementListResult> {
        const limit = Math.min(Math.max(1, Number(options.limit ?? DEFAULT_LIMIT)), MAX_LIMIT);
        const offset = Math.max(0, Number(options.offset ?? 0));
        const status = options.status ? String(options.status) : undefined;

        const [items, total] = await Promise.all([
            this.announcementRepo.findForAdmin({ status, limit, offset }),
            this.announcementRepo.countForAdmin({ status })
        ]);

        return { items, total, limit, offset };
    }

    async getByIdForAdmin(id: string) {
        const ann = await this.announcementRepo.findById(id);
        if (!ann) throw new NotFoundError('Announcement not found');
        const stats = await this.deliveryRepo.countsForAnnouncement(id);
        return { ...(ann as any), delivery_stats: stats };
    }

    async publish(id: string, adminId: string, options?: { scheduled_at?: string | null }) {
        const existing = await this.announcementRepo.findById(id);
        if (!existing) throw new NotFoundError('Announcement not found');
        if (existing.created_by_admin_id !== adminId) {
            throw new ValidationError('You cannot publish this announcement');
        }
        if (String(existing.status) !== SystemAnnouncementStatus.DRAFT) {
            throw new ValidationError('Only draft announcements can be published');
        }

        const scheduledAt = options?.scheduled_at ? String(options.scheduled_at) : null;
        const nextStatus = scheduledAt ? SystemAnnouncementStatus.SCHEDULED : SystemAnnouncementStatus.PUBLISHING;

        const updated = await this.announcementRepo.update(id, {
            status: nextStatus,
            scheduled_at: scheduledAt,
            published_at: scheduledAt ? null : new Date().toISOString()
        } as any);
        if (!updated) throw new NotFoundError('Announcement not found');

        const queue = getSystemAnnouncementsQueue();
        const delayMs = scheduledAt ? Math.max(0, new Date(scheduledAt).getTime() - Date.now()) : 0;

        await queue.add(
            'publish',
            { announcementId: id },
            {
                delay: delayMs,
                attempts: 3,
                backoff: { type: 'exponential', delay: 5000 },
                removeOnComplete: 1000,
                removeOnFail: 5000
            }
        );

        return updated;
    }
}

