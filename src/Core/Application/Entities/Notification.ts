import { Column, ForeignKey, Index } from '../../../extensions/decorators';
import { TableNames } from '../Enums/TableNames';
import { INotification } from '../Interface/Entities/notifications/INotification';
import { NotificationType } from '../Enums/NotificationType';

export class Notification implements INotification {
    @Column('UUID PRIMARY KEY DEFAULT gen_random_uuid()')
    public _id?: string;

    @Index({ unique: false })
    @ForeignKey({
        table: TableNames.USERS,
        field: '_id',
        constraint: 'fk_notification_user_id'
    })
    @Column('UUID NOT NULL')
    public user_id: string;

    @Column('VARCHAR(255) NOT NULL')
    public title: string;

    @Column('TEXT NOT NULL')
    public content: string;

    @Column('TEXT DEFAULT NULL')
    public url?: string | null;

    @Index({ unique: false })
    @Column('VARCHAR(50) NOT NULL')
    public type: NotificationType | string;

    @Index({ unique: false })
    @Column('BOOLEAN DEFAULT false')
    public has_been_read_by_user: boolean;

    @Index({ unique: false })
    @Column('BOOLEAN DEFAULT false')
    public has_been_read_by_admin: boolean;

    @Index({ unique: false })
    @Column('TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP')
    public created_at?: string;

    @Index({ unique: false })
    @Column('TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP')
    public updated_at?: string;
}

