import { SystemAnnouncementChannel } from '../../../Enums/SystemAnnouncementChannel';
import { SystemAnnouncementDeliveryStatus } from '../../../Enums/SystemAnnouncementDeliveryStatus';

export interface ISystemAnnouncementDelivery {
    _id?: string;

    announcement_id: string;
    user_id: string;
    channel: SystemAnnouncementChannel | string;

    status: SystemAnnouncementDeliveryStatus | string;
    attempts: number;
    last_error?: string | null;

    sent_at?: string | null;

    created_at?: string;
    updated_at?: string;
}

