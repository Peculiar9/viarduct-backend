import { inject, injectable } from 'inversify';
import { INotificationService, CreateNotificationInput, ListNotificationsResult } from '../../Core/Application/Interface/Services/INotificationService';
import { IPushNotificationService } from '../../Core/Application/Interface/Services/IPushNotificationService';
import { TYPES } from '../../Core/Types/Constants';
import { NotificationRepository } from '../Repository/SQL/notifications/NotificationRepository';
import { INotification } from '../../Core/Application/Interface/Entities/notifications/INotification';
import { NotFoundError, ValidationError } from '../../Core/Application/Error/AppError';
import { UserRepository } from '../Repository/SQL/users/UserRepository';
import { RoleRepository } from '../Repository/SQL/roles/RoleRepository';
import { UserRole } from '../../Core/Application/Enums/UserRole';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

const DEFAULT_PREFS: Record<string, boolean> = {
    transaction: true,
    verification: true,
    message: true,
    order: true,
    dispute: true,
    system_announcements: true
};

function preferenceKeyFromType(type: string): string {
    const t = String(type || '').toLowerCase();
    if (t === 'messages') return 'message';
    return t;
}

@injectable()
export class NotificationService implements INotificationService {
    constructor(
        @inject(TYPES.NotificationRepository) private readonly notificationRepository: NotificationRepository,
        @inject(TYPES.UserRepository) private readonly userRepository: UserRepository,
        @inject(TYPES.RoleRepository) private readonly roleRepository: RoleRepository,
        @inject(TYPES.PushNotificationService) private readonly pushService: IPushNotificationService
    ) {}

    async create(input: CreateNotificationInput): Promise<INotification | null> {
        if (!input.user_id) throw new ValidationError('user_id is required');
        if (!input.title || String(input.title).trim() === '') throw new ValidationError('title is required');
        if (!input.content || String(input.content).trim() === '') throw new ValidationError('content is required');
        if (!input.type || String(input.type).trim() === '') throw new ValidationError('type is required');

        // Respect preferences only for normal users (not admins/superadmins)
        const recipient = await this.userRepository.findById(input.user_id);
        if (recipient) {
            const roleRows = await this.roleRepository.getUserRoles(input.user_id);
            const roleNames = (roleRows || []).map((r: any) => r?.name).filter(Boolean);
            const isAdminRecipient = roleNames.some((r: string) => r === UserRole.ADMIN || r === UserRole.SUPERADMIN);
            if (!isAdminRecipient) {
                const prefs = { ...DEFAULT_PREFS, ...(recipient.notification_preferences as any) };
                const key = preferenceKeyFromType(String(input.type));
                const enabled = prefs[key];
                if (enabled === false) {
                    return null;
                }
            }
        }

        const entity: INotification = {
            user_id: input.user_id,
            title: String(input.title).trim(),
            content: String(input.content).trim(),
            url: input.url ?? null,
            type: input.type,
            has_been_read_by_user: false,
            has_been_read_by_admin: false
        };

        const created = await this.notificationRepository.create(entity);

        // Fire-and-forget push (never block / fail the in-app notification path)
        if (created?._id) {
            void this.pushService.sendToUser(input.user_id, {
                title: created.title,
                body: created.content,
                data: {
                    type: String(created.type),
                    url: created.url || '',
                    notification_id: created._id
                }
            });
        }

        return created;
    }

    async listForUser(
        userId: string,
        options: { unreadOnly?: boolean; limit?: number; offset?: number; title?: string; type?: string }
    ): Promise<ListNotificationsResult> {
        if (!userId) throw new ValidationError('userId is required');

        const limit = Math.min(
            Math.max(1, Number(options.limit ?? DEFAULT_LIMIT)),
            MAX_LIMIT
        );
        const offset = Math.max(0, Number(options.offset ?? 0));
        const unreadOnly = options.unreadOnly === true;
        const title = options.title ? String(options.title) : undefined;
        const type = options.type ? String(options.type) : undefined;

        const [items, total] = await Promise.all([
            this.notificationRepository.findForUser(userId, { unreadOnly, title, type, limit, offset }),
            this.notificationRepository.countForUser(userId, { unreadOnly, title, type })
        ]);

        return { items, total, limit, offset };
    }

    async listForAdmin(options: { userId?: string; unreadOnly?: boolean; limit?: number; offset?: number; title?: string; type?: string }): Promise<ListNotificationsResult> {
        const limit = Math.min(
            Math.max(1, Number(options.limit ?? DEFAULT_LIMIT)),
            MAX_LIMIT
        );
        const offset = Math.max(0, Number(options.offset ?? 0));
        const unreadOnly = options.unreadOnly === true;
        const title = options.title ? String(options.title) : undefined;
        const type = options.type ? String(options.type) : undefined;

        const [items, total] = await Promise.all([
            this.notificationRepository.findForAdmin({ userId: options.userId, unreadOnly, title, type, limit, offset }),
            this.notificationRepository.countForAdmin({ userId: options.userId, unreadOnly, title, type })
        ]);

        return { items, total, limit, offset };
    }

    async markReadByUser(userId: string, notificationId: string): Promise<INotification> {
        if (!userId) throw new ValidationError('userId is required');
        if (!notificationId) throw new ValidationError('notificationId is required');

        const updated = await this.notificationRepository.markReadByUser(userId, notificationId);
        if (!updated) throw new NotFoundError('Notification not found');
        return updated;
    }

    async markReadByAdmin(notificationId: string): Promise<INotification> {
        if (!notificationId) throw new ValidationError('notificationId is required');
        const updated = await this.notificationRepository.markReadByAdmin(notificationId);
        if (!updated) throw new NotFoundError('Notification not found');
        return updated;
    }

    async markReadByUserBulk(userId: string, ids?: string[]): Promise<number> {
        if (!userId) throw new ValidationError('userId is required');
        return await this.notificationRepository.markReadByUserMany(userId, ids);
    }

    async markReadByAdminBulk(ids?: string[], userId?: string): Promise<number> {
        return await this.notificationRepository.markReadByAdminMany(ids, userId);
    }
}

