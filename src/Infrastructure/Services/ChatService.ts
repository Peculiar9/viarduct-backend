import { inject, injectable } from 'inversify';
import { TYPES } from '../../Core/Types/Constants';
import { IChatService, ChatListResult, AdminSummaryDTO } from '../../Core/Application/Interface/Services/IChatService';
import { ChatRepository } from '../Repository/SQL/chat/ChatRepository';
import { ChatMessageRepository } from '../Repository/SQL/chat/ChatMessageRepository';
import { RoleRepository } from '../Repository/SQL/roles/RoleRepository';
import { UserRepository } from '../Repository/SQL/users/UserRepository';
import { ValidationError, NotFoundError } from '../../Core/Application/Error/AppError';
import { ChatStatus } from '../../Core/Application/Enums/ChatStatus';
import { ChatSenderRole } from '../../Core/Application/Enums/ChatSenderRole';
import { IChat } from '../../Core/Application/Interface/Entities/chat/IChat';
import { IChatMessage } from '../../Core/Application/Interface/Entities/chat/IChatMessage';
import { INotificationService } from '../../Core/Application/Interface/Services/INotificationService';
import { NotificationType } from '../../Core/Application/Enums/NotificationType';
import { UserRole } from '../../Core/Application/Enums/UserRole';
import { TableNames } from '../../Core/Application/Enums/TableNames';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

@injectable()
export class ChatService implements IChatService {
    constructor(
        @inject(TYPES.ChatRepository) private readonly chatRepository: ChatRepository,
        @inject(TYPES.ChatMessageRepository) private readonly chatMessageRepository: ChatMessageRepository,
        @inject(TYPES.RoleRepository) private readonly roleRepository: RoleRepository,
        @inject(TYPES.UserRepository) private readonly userRepository: UserRepository,
        @inject(TYPES.NotificationService) private readonly notificationService: INotificationService
    ) {}

    async listAdmins(): Promise<AdminSummaryDTO[]> {
        // Fetch role IDs for ADMIN and SUPERADMIN, then list users assigned via user_roles
        const [adminRole, superAdminRole] = await Promise.all([
            this.roleRepository.findByName(UserRole.ADMIN),
            this.roleRepository.findByName(UserRole.SUPERADMIN)
        ]);

        const roleIds = [adminRole?._id, superAdminRole?._id].filter(Boolean) as string[];
        if (roleIds.length === 0) return [];

        const rows = await this.roleRepository.executeRawQuery(
            `SELECT DISTINCT u.*
             FROM "${TableNames.USERS}" u
             INNER JOIN "${TableNames.USER_ROLES}" ur ON u._id = ur.user_id
             WHERE ur.role_id = ANY($1::uuid[])
             ORDER BY u.created_at DESC`,
            [roleIds]
        );

        return (rows || []).map((u: any) => ({
            id: u._id,
            first_name: u.first_name,
            last_name: u.last_name,
            profile_image: u.profile_image || ''
        }));
    }

    async createChat(userId: string, adminId: string, initialMessage: { content: string; url?: string | null }): Promise<{ chat: IChat; message: IChatMessage }> {
        if (!userId) throw new ValidationError('userId is required');
        if (!adminId) throw new ValidationError('adminId is required');
        if (!initialMessage?.content || String(initialMessage.content).trim() === '') {
            throw new ValidationError('content is required');
        }

        // Ensure admin exists
        const admin = await this.userRepository.findById(adminId);
        if (!admin) throw new ValidationError('Selected admin not found');

        const now = new Date().toISOString();
        const chat = await this.chatRepository.create({
            user_id: userId,
            admin_id: adminId,
            status: ChatStatus.OPEN,
            last_message_at: now
        } as any);

        const message = await this.chatMessageRepository.create({
            chat_id: chat._id!,
            sender_user_id: userId,
            sender_role: ChatSenderRole.USER,
            content: String(initialMessage.content).trim(),
            url: initialMessage.url ?? null
        } as any);

        // Notify the admin (non-blocking) that a new chat started
        try {
            const snippet = String(initialMessage.content).trim().slice(0, 120);
            await this.notificationService.create({
                user_id: adminId,
                type: NotificationType.MESSAGES,
                title: 'New chat started',
                content: snippet ? `Initial message: ${snippet}` : 'A user started a new chat with you.',
                url: `/admin/chats/${chat._id}`
            });
        } catch {
            // ignore
        }

        return { chat, message };
    }

    async listChatsForUser(userId: string, options: { status?: ChatStatus | string; limit?: number; offset?: number }): Promise<ChatListResult<IChat>> {
        if (!userId) throw new ValidationError('userId is required');
        const limit = Math.min(Math.max(1, Number(options.limit ?? DEFAULT_LIMIT)), MAX_LIMIT);
        const offset = Math.max(0, Number(options.offset ?? 0));
        const status = options.status ? String(options.status) : undefined;

        const [items, total] = await Promise.all([
            this.chatRepository.findForUser(userId, { status, limit, offset }),
            this.chatRepository.countForUser(userId, { status })
        ]);
        return { items, total, limit, offset };
    }

    async getChatForUser(userId: string, chatId: string): Promise<IChat> {
        if (!userId) throw new ValidationError('userId is required');
        if (!chatId) throw new ValidationError('chatId is required');
        const chat = await this.chatRepository.findById(chatId);
        if (!chat || chat.user_id !== userId) throw new NotFoundError('Chat not found');
        return chat;
    }

    async listChatsForAdmin(adminId: string, options: { status?: ChatStatus | string; userId?: string; limit?: number; offset?: number }): Promise<ChatListResult<IChat>> {
        if (!adminId) throw new ValidationError('adminId is required');
        const limit = Math.min(Math.max(1, Number(options.limit ?? DEFAULT_LIMIT)), MAX_LIMIT);
        const offset = Math.max(0, Number(options.offset ?? 0));
        const status = options.status ? String(options.status) : undefined;
        const userId = options.userId ? String(options.userId) : undefined;

        const [items, total] = await Promise.all([
            this.chatRepository.findForAdmin(adminId, { status, userId, limit, offset }),
            this.chatRepository.countForAdmin(adminId, { status, userId })
        ]);
        return { items, total, limit, offset };
    }

    async getChatForAdmin(adminId: string, chatId: string): Promise<IChat> {
        if (!adminId) throw new ValidationError('adminId is required');
        if (!chatId) throw new ValidationError('chatId is required');
        const chat = await this.chatRepository.findById(chatId);
        if (!chat || chat.admin_id !== adminId) throw new NotFoundError('Chat not found');
        return chat;
    }

    private ensureOpen(chat: IChat) {
        if (String(chat.status) === ChatStatus.CLOSED) {
            throw new ValidationError('Chat is closed');
        }
    }

    async sendMessageAsUser(userId: string, chatId: string, content: string, url?: string | null): Promise<IChatMessage> {
        const chat = await this.getChatForUser(userId, chatId);
        this.ensureOpen(chat);
        if (!content || String(content).trim() === '') throw new ValidationError('content is required');

        const message = await this.chatMessageRepository.create({
            chat_id: chatId,
            sender_user_id: userId,
            sender_role: ChatSenderRole.USER,
            content: String(content).trim(),
            url: url ?? null
        } as any);

        const now = new Date().toISOString();
        await this.chatRepository.update(chatId, { last_message_at: now } as any);

        // Notify admin (non-blocking)
        try {
            await this.notificationService.create({
                user_id: chat.admin_id,
                type: NotificationType.MESSAGES,
                title: 'New message',
                content: 'You received a new chat message.',
                url: `/admin/chats/${chatId}`
            });
        } catch {
            // ignore
        }

        return message;
    }

    async sendMessageAsAdmin(adminId: string, chatId: string, content: string, url?: string | null): Promise<IChatMessage> {
        const chat = await this.getChatForAdmin(adminId, chatId);
        this.ensureOpen(chat);
        if (!content || String(content).trim() === '') throw new ValidationError('content is required');

        const message = await this.chatMessageRepository.create({
            chat_id: chatId,
            sender_user_id: adminId,
            sender_role: ChatSenderRole.ADMIN,
            content: String(content).trim(),
            url: url ?? null
        } as any);

        const now = new Date().toISOString();
        await this.chatRepository.update(chatId, { last_message_at: now } as any);

        // Notify user (non-blocking)
        try {
            await this.notificationService.create({
                user_id: chat.user_id,
                type: NotificationType.MESSAGES,
                title: 'New message',
                content: 'You received a new message from support.',
                url: `/chats/${chatId}`
            });
        } catch {
            // ignore
        }

        return message;
    }

    async listMessagesForUser(userId: string, chatId: string, options: { limit?: number; offset?: number }): Promise<ChatListResult<IChatMessage>> {
        await this.getChatForUser(userId, chatId);
        const limit = Math.min(Math.max(1, Number(options.limit ?? DEFAULT_LIMIT)), MAX_LIMIT);
        const offset = Math.max(0, Number(options.offset ?? 0));
        const [items, total] = await Promise.all([
            this.chatMessageRepository.listForChat(chatId, { limit, offset }),
            this.chatMessageRepository.countForChat(chatId)
        ]);
        return { items, total, limit, offset };
    }

    async listMessagesForAdmin(adminId: string, chatId: string, options: { limit?: number; offset?: number }): Promise<ChatListResult<IChatMessage>> {
        await this.getChatForAdmin(adminId, chatId);
        const limit = Math.min(Math.max(1, Number(options.limit ?? DEFAULT_LIMIT)), MAX_LIMIT);
        const offset = Math.max(0, Number(options.offset ?? 0));
        const [items, total] = await Promise.all([
            this.chatMessageRepository.listForChat(chatId, { limit, offset }),
            this.chatMessageRepository.countForChat(chatId)
        ]);
        return { items, total, limit, offset };
    }

    async closeChat(adminId: string, chatId: string): Promise<IChat> {
        const chat = await this.getChatForAdmin(adminId, chatId);
        const updated = await this.chatRepository.update(chatId, { status: ChatStatus.CLOSED } as any);
        if (!updated) throw new NotFoundError('Chat not found');

        // Notify user (non-blocking)
        try {
            await this.notificationService.create({
                user_id: chat.user_id,
                type: NotificationType.MESSAGES,
                title: 'Chat closed',
                content: 'Your chat has been closed by support.',
                url: `/chats/${chatId}`
            });
        } catch {}

        return updated;
    }

    async reassignChat(adminId: string, chatId: string, newAdminId: string): Promise<IChat> {
        const chat = await this.getChatForAdmin(adminId, chatId);
        if (!newAdminId) throw new ValidationError('newAdminId is required');
        if (newAdminId === chat.admin_id) throw new ValidationError('Chat is already assigned to this admin');

        // Ensure new admin exists
        const newAdmin = await this.userRepository.findById(newAdminId);
        if (!newAdmin) throw new ValidationError('New admin not found');

        const updated = await this.chatRepository.update(chatId, { admin_id: newAdminId } as any);
        if (!updated) throw new NotFoundError('Chat not found');

        // Notify user + new admin (non-blocking)
        try {
            await this.notificationService.create({
                user_id: chat.user_id,
                type: NotificationType.MESSAGES,
                title: 'Chat reassigned',
                content: 'Your chat has been reassigned to another support agent.',
                url: `/chats/${chatId}`
            });
        } catch {}

        try {
            await this.notificationService.create({
                user_id: newAdminId,
                type: NotificationType.MESSAGES,
                title: 'New chat assigned',
                content: 'A chat has been reassigned to you.',
                url: `/admin/chats/${chatId}`
            });
        } catch {}

        return updated;
    }
}

