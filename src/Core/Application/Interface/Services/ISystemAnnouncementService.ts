import { ISystemAnnouncement } from '../Entities/system-announcements/ISystemAnnouncement';
import { SystemAnnouncementStatus } from '../../Enums/SystemAnnouncementStatus';
import { SystemAnnouncementChannel } from '../../Enums/SystemAnnouncementChannel';

export interface SystemAnnouncementListResult {
    items: ISystemAnnouncement[];
    total: number;
    limit: number;
    offset: number;
}

export interface CreateSystemAnnouncementInput {
    title: string;
    description?: string | null;
    content: string;
    url?: string | null;
    broadcast_channels: SystemAnnouncementChannel[] | string[];
    created_by_admin_id: string;
}

export interface UpdateSystemAnnouncementInput {
    title?: string;
    description?: string | null;
    content?: string;
    url?: string | null;
    broadcast_channels?: SystemAnnouncementChannel[] | string[];
}

export interface ISystemAnnouncementService {
    createDraft(input: CreateSystemAnnouncementInput): Promise<ISystemAnnouncement>;
    updateDraft(id: string, adminId: string, input: UpdateSystemAnnouncementInput): Promise<ISystemAnnouncement>;
    listForAdmin(options: { status?: SystemAnnouncementStatus | string; limit?: number; offset?: number }): Promise<SystemAnnouncementListResult>;
    getByIdForAdmin(id: string): Promise<ISystemAnnouncement & { delivery_stats?: any }>;
    publish(id: string, adminId: string, options?: { scheduled_at?: string | null }): Promise<ISystemAnnouncement>;
}

