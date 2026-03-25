import { INotification } from '../Entities/notifications/INotification';
import { NotificationType } from '../../Enums/NotificationType';

export interface CreateNotificationInput {
    user_id: string;
    title: string;
    content: string;
    url?: string | null;
    type: NotificationType | string;
}

export interface ListNotificationsResult {
    items: INotification[];
    total: number;
    limit: number;
    offset: number;
}

export interface INotificationService {
    /**
     * Returns created notification, or null if user has disabled this type.
     * Admin recipients are not subject to preferences.
     */
    create(input: CreateNotificationInput): Promise<INotification | null>;

    listForUser(
        userId: string,
        options: { unreadOnly?: boolean; limit?: number; offset?: number; title?: string; type?: NotificationType | string }
    ): Promise<ListNotificationsResult>;

    listForAdmin(options: {
        userId?: string;
        unreadOnly?: boolean;
        limit?: number;
        offset?: number;
        title?: string;
        type?: NotificationType | string;
    }): Promise<ListNotificationsResult>;

    markReadByUser(userId: string, notificationId: string): Promise<INotification>;

    markReadByAdmin(notificationId: string): Promise<INotification>;

    /**
     * Bulk mark-read. If ids is empty/undefined => mark all for scope.
     */
    markReadByUserBulk(userId: string, ids?: string[]): Promise<number>;

    /**
     * Bulk mark-read. If ids is empty/undefined => mark all (optionally scoped to a user).
     */
    markReadByAdminBulk(ids?: string[], userId?: string): Promise<number>;
}

