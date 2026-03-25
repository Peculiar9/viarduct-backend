import { NotificationType } from '../../../Enums/NotificationType';

export interface INotification {
    _id?: string;

    user_id: string;

    title: string;
    content: string;
    url?: string | null;

    type: NotificationType | string;

    has_been_read_by_user: boolean;
    has_been_read_by_admin: boolean;

    created_at?: string;
    updated_at?: string;
}

