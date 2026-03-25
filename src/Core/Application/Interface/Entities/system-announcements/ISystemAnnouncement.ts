import { SystemAnnouncementChannel } from '../../../Enums/SystemAnnouncementChannel';
import { SystemAnnouncementStatus } from '../../../Enums/SystemAnnouncementStatus';

export interface ISystemAnnouncement {
    _id?: string;

    title: string;
    description?: string | null;
    content: string;
    url?: string | null;

    broadcast_channels: SystemAnnouncementChannel[] | string[];

    status: SystemAnnouncementStatus | string;

    scheduled_at?: string | null;
    published_at?: string | null;
    completed_at?: string | null;

    total_recipients?: number;
    sent_count?: number;
    failed_count?: number;

    created_by_admin_id: string;

    created_at?: string;
    updated_at?: string;
}

