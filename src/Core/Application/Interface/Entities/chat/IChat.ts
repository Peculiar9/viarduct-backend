import { ChatStatus } from '../../../Enums/ChatStatus';

export interface IChat {
    _id?: string;

    user_id: string;
    admin_id: string;

    status: ChatStatus | string;

    last_message_at?: string | null;

    created_at?: string;
    updated_at?: string;
}

