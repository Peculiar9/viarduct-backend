// eslint-disable-next-line @typescript-eslint/no-var-requires
const { Queue } = require('bullmq');
import { getRedisConnection } from './redisConnection';

export const SYSTEM_ANNOUNCEMENTS_QUEUE_NAME = 'system-announcements';

export type PublishAnnouncementJobData = {
    announcementId: string;
};

export type DeliverAnnouncementJobData = {
    deliveryId: string;
};

export function getSystemAnnouncementsQueue(): any {
    return new Queue(SYSTEM_ANNOUNCEMENTS_QUEUE_NAME, {
        connection: getRedisConnection()
    });
}

