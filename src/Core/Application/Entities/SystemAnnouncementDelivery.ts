import { Column, ForeignKey, Index } from '../../../extensions/decorators';
import { TableNames } from '../Enums/TableNames';
import { SystemAnnouncementDeliveryStatus } from '../Enums/SystemAnnouncementDeliveryStatus';
import { SystemAnnouncementChannel } from '../Enums/SystemAnnouncementChannel';
import { ISystemAnnouncementDelivery } from '../Interface/Entities/system-announcements/ISystemAnnouncementDelivery';

export class SystemAnnouncementDelivery implements ISystemAnnouncementDelivery {
    @Column('UUID PRIMARY KEY DEFAULT gen_random_uuid()')
    public _id?: string;

    @Index({ unique: false })
    @ForeignKey({ table: TableNames.SYSTEM_ANNOUNCEMENTS, field: '_id', constraint: 'fk_system_announcement_delivery_announcement_id' })
    @Column('UUID NOT NULL')
    public announcement_id: string;

    @Index({ unique: false })
    @ForeignKey({ table: TableNames.USERS, field: '_id', constraint: 'fk_system_announcement_delivery_user_id' })
    @Column('UUID NOT NULL')
    public user_id: string;

    @Index({ unique: false })
    @Column('VARCHAR(64) NOT NULL')
    public channel: SystemAnnouncementChannel | string;

    @Index({ unique: false })
    @Column('VARCHAR(32) NOT NULL DEFAULT \'pending\'')
    public status: SystemAnnouncementDeliveryStatus | string;

    @Column('INTEGER NOT NULL DEFAULT 0')
    public attempts: number;

    @Column('TEXT DEFAULT NULL')
    public last_error?: string | null;

    @Index({ unique: false })
    @Column('TIMESTAMP WITH TIME ZONE DEFAULT NULL')
    public sent_at?: string | null;

    @Index({ unique: false })
    @Column('TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP')
    public created_at?: string;

    @Index({ unique: false })
    @Column('TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP')
    public updated_at?: string;
}

