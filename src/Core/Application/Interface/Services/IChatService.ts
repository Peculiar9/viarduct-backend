import { ChatStatus } from '../../Enums/ChatStatus';
import { IChat } from '../Entities/chat/IChat';
import { IChatMessage } from '../Entities/chat/IChatMessage';

export interface ChatListResult<T> {
    items: T[];
    total: number;
    limit: number;
    offset: number;
}

export interface AdminSummaryDTO {
    id: string;
    first_name: string;
    last_name: string;
    profile_image?: string;
}

export interface IChatService {
    listAdmins(): Promise<AdminSummaryDTO[]>;

    createChat(userId: string, adminId: string, initialMessage: { content: string; url?: string | null }): Promise<{ chat: IChat; message: IChatMessage }>;

    listChatsForUser(userId: string, options: { status?: ChatStatus | string; limit?: number; offset?: number }): Promise<ChatListResult<IChat>>;
    getChatForUser(userId: string, chatId: string): Promise<IChat>;

    listChatsForAdmin(adminId: string, options: { status?: ChatStatus | string; userId?: string; limit?: number; offset?: number }): Promise<ChatListResult<IChat>>;
    getChatForAdmin(adminId: string, chatId: string): Promise<IChat>;

    sendMessageAsUser(userId: string, chatId: string, content: string, url?: string | null): Promise<IChatMessage>;
    sendMessageAsAdmin(adminId: string, chatId: string, content: string, url?: string | null): Promise<IChatMessage>;

    listMessagesForUser(userId: string, chatId: string, options: { limit?: number; offset?: number }): Promise<ChatListResult<IChatMessage>>;
    listMessagesForAdmin(adminId: string, chatId: string, options: { limit?: number; offset?: number }): Promise<ChatListResult<IChatMessage>>;

    closeChat(adminId: string, chatId: string): Promise<IChat>;
    reassignChat(adminId: string, chatId: string, newAdminId: string): Promise<IChat>;
}

