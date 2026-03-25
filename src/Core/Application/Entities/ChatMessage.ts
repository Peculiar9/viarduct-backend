import { Column, ForeignKey, Index } from '../../../extensions/decorators';
import { TableNames } from '../Enums/TableNames';
import { ChatSenderRole } from '../Enums/ChatSenderRole';
import { IChatMessage } from '../Interface/Entities/chat/IChatMessage';

export class ChatMessage implements IChatMessage {
    @Column('UUID PRIMARY KEY DEFAULT gen_random_uuid()')
    public _id?: string;

    @Index({ unique: false })
    @ForeignKey({ table: TableNames.CHATS, field: '_id', constraint: 'fk_chat_message_chat_id' })
    @Column('UUID NOT NULL')
    public chat_id: string;

    @Index({ unique: false })
    @ForeignKey({ table: TableNames.USERS, field: '_id', constraint: 'fk_chat_message_sender_user_id' })
    @Column('UUID NOT NULL')
    public sender_user_id: string;

    @Index({ unique: false })
    @Column('VARCHAR(16) NOT NULL')
    public sender_role: ChatSenderRole | string;

    @Column('TEXT NOT NULL')
    public content: string;

    @Column('TEXT DEFAULT NULL')
    public url?: string | null;

    @Index({ unique: false })
    @Column('TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP')
    public created_at?: string;
}

