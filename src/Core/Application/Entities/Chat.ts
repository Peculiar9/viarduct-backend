import { Column, ForeignKey, Index } from '../../../extensions/decorators';
import { TableNames } from '../Enums/TableNames';
import { ChatStatus } from '../Enums/ChatStatus';
import { IChat } from '../Interface/Entities/chat/IChat';

export class Chat implements IChat {
    @Column('UUID PRIMARY KEY DEFAULT gen_random_uuid()')
    public _id?: string;

    @Index({ unique: false })
    @ForeignKey({ table: TableNames.USERS, field: '_id', constraint: 'fk_chat_user_id' })
    @Column('UUID NOT NULL')
    public user_id: string;

    @Index({ unique: false })
    @ForeignKey({ table: TableNames.USERS, field: '_id', constraint: 'fk_chat_admin_id' })
    @Column('UUID NOT NULL')
    public admin_id: string;

    @Index({ unique: false })
    @Column('VARCHAR(16) NOT NULL DEFAULT \'open\'')
    public status: ChatStatus | string;

    @Index({ unique: false })
    @Column('TIMESTAMP WITH TIME ZONE DEFAULT NULL')
    public last_message_at?: string | null;

    @Index({ unique: false })
    @Column('TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP')
    public created_at?: string;

    @Index({ unique: false })
    @Column('TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP')
    public updated_at?: string;
}

