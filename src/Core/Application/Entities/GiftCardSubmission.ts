import { Column, ForeignKey, Index } from '../../../extensions/decorators';
import { TableNames } from '../Enums/TableNames';
import { IGiftCardSubmission } from '../Interface/Entities/giftcard/IGiftCardSubmission';

export class GiftCardSubmission implements IGiftCardSubmission {
    @Column('UUID PRIMARY KEY DEFAULT gen_random_uuid()')
    public _id?: string;

    @Index({ unique: false })
    @ForeignKey({
        table: TableNames.USERS,
        field: '_id',
        constraint: 'fk_gift_card_submission_user_id'
    })
    @Column('UUID NOT NULL')
    public user_id: string;

    @Column('VARCHAR(100) NOT NULL')
    public card_type: string;

    @Column('DECIMAL(20, 2) NOT NULL')
    public amount_ngn: number;

    @Column('JSONB DEFAULT \'[]\'')
    public image_urls: string[];

    @Index({ unique: false })
    @Column('VARCHAR(30) NOT NULL DEFAULT \'pending_validation\'')
    public status: IGiftCardSubmission['status'];

    @Column('TEXT DEFAULT NULL')
    public admin_notes?: string | null;

    @Column('UUID DEFAULT NULL')
    public validated_by?: string | null;

    @Column('TIMESTAMP WITH TIME ZONE DEFAULT NULL')
    public validated_at?: string | null;

    @Column('TEXT DEFAULT NULL')
    public rejection_reason?: string | null;

    @Column('VARCHAR(255) DEFAULT NULL')
    public transaction_id?: string | null;

    @Index({ unique: false })
    @Column('TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP')
    public created_at: string;

    @Index({ unique: false })
    @Column('TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP')
    public updated_at: string;
}
