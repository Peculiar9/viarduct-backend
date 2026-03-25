import { ChatSenderRole } from '../../../Enums/ChatSenderRole';

export interface IChatMessage {
    _id?: string;

    chat_id: string;
    sender_user_id: string;
    sender_role: ChatSenderRole | string;

    content: string;
    url?: string | null;

    created_at?: string;
}

