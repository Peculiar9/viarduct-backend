import { Column, ForeignKey, Index } from '../../../extensions/decorators';
import { TableNames } from '../Enums/TableNames';
import { DisputeStatus } from '../Enums/DisputeStatus';
import { IDispute } from '../Interface/Entities/disputes/IDispute';

export class Dispute implements IDispute {
    @Column('UUID PRIMARY KEY DEFAULT gen_random_uuid()')
    public _id?: string;

    @Index({ unique: false })
    @ForeignKey({
        table: TableNames.USERS,
        field: '_id',
        constraint: 'fk_dispute_user_id'
    })
    @Column('UUID NOT NULL')
    public user_id: string;

    @Index({ unique: false })
    @Column('VARCHAR(255) NOT NULL')
    public title: string;

    @Column('TEXT NOT NULL')
    public content: string;

    @Column('JSONB NOT NULL DEFAULT \'[]\'::jsonb')
    public evidence: any[];

    @Index({ unique: false })
    @Column('VARCHAR(32) NOT NULL DEFAULT \'pending\'')
    public status: DisputeStatus | string;

    @Column('TEXT DEFAULT NULL')
    public resolve_note?: string | null;

    @Column('JSONB DEFAULT \'[]\'::jsonb')
    public resolve_evidence?: any[] | null;

    @Index({ unique: false })
    @Column('TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP')
    public created_at?: string;

    @Index({ unique: false })
    @Column('TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP')
    public updated_at?: string;
}

