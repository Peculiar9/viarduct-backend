import { Column, ForeignKey, Index } from '../../../extensions/decorators';
import { TableNames } from '../Enums/TableNames';
import { SystemAnnouncementStatus } from '../Enums/SystemAnnouncementStatus';
import { SystemAnnouncementChannel } from '../Enums/SystemAnnouncementChannel';
import { ISystemAnnouncement } from '../Interface/Entities/system-announcements/ISystemAnnouncement';

export class SystemAnnouncement implements ISystemAnnouncement {
    @Column('UUID PRIMARY KEY DEFAULT gen_random_uuid()')
    public _id?: string;

    @Index({ unique: false })
    @Column('VARCHAR(255) NOT NULL')
    public title: string;

    @Column('TEXT DEFAULT NULL')
    public description?: string | null;

    @Column('TEXT NOT NULL')
    public content: string;

    @Column('TEXT DEFAULT NULL')
    public url?: string | null;

    @Column('JSONB NOT NULL DEFAULT \'[]\'::jsonb')
    public broadcast_channels: SystemAnnouncementChannel[] | string[];

    @Index({ unique: false })
    @Column('VARCHAR(32) NOT NULL DEFAULT \'draft\'')
    public status: SystemAnnouncementStatus | string;

    @Index({ unique: false })
    @Column('TIMESTAMP WITH TIME ZONE DEFAULT NULL')
    public scheduled_at?: string | null;

    @Index({ unique: false })
    @Column('TIMESTAMP WITH TIME ZONE DEFAULT NULL')
    public published_at?: string | null;

    @Index({ unique: false })
    @Column('TIMESTAMP WITH TIME ZONE DEFAULT NULL')
    public completed_at?: string | null;

    @Column('INTEGER NOT NULL DEFAULT 0')
    public total_recipients?: number;

    @Column('INTEGER NOT NULL DEFAULT 0')
    public sent_count?: number;

    @Column('INTEGER NOT NULL DEFAULT 0')
    public failed_count?: number;

    @Index({ unique: false })
    @ForeignKey({ table: TableNames.USERS, field: '_id', constraint: 'fk_system_announcement_created_by_admin_id' })
    @Column('UUID NOT NULL')
    public created_by_admin_id: string;

    @Index({ unique: false })
    @Column('TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP')
    public created_at?: string;

    @Index({ unique: false })
    @Column('TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP')
    public updated_at?: string;
}

