import { Column, ForeignKey, Index } from '../../../extensions/decorators';
import { TableNames } from '../Enums/TableNames';
import {
    AdminPayoutConsentStatus,
    IAdminPayoutConsent
} from '../Interface/Entities/trading/IAdminPayoutConsent';

export class AdminPayoutConsent implements IAdminPayoutConsent {
    @Column('UUID PRIMARY KEY DEFAULT gen_random_uuid()')
    public _id?: string;

    @Index({ unique: true })
    @Column('VARCHAR(100) NOT NULL')
    public consent_code: string;

    @Index({ unique: false })
    @ForeignKey({
        table: TableNames.USERS,
        field: '_id',
        constraint: 'fk_admin_payout_consent_admin_id'
    })
    @Column('UUID NOT NULL')
    public admin_id: string;

    @Index({ unique: false })
    @Column('VARCHAR(20) NOT NULL DEFAULT \'unused\'')
    public status: AdminPayoutConsentStatus;

    @ForeignKey({
        table: TableNames.TRADE_INTENTS,
        field: '_id',
        constraint: 'fk_admin_payout_consent_intent_id'
    })
    @Column('UUID DEFAULT NULL')
    public intent_id?: string | null;

    @Column('TIMESTAMP WITH TIME ZONE NOT NULL')
    public expires_at: string;

    @Column('TIMESTAMP WITH TIME ZONE DEFAULT NULL')
    public used_at?: string | null;

    @ForeignKey({
        table: TableNames.TRADE_INTENTS,
        field: '_id',
        constraint: 'fk_admin_payout_consent_used_for_intent_id'
    })
    @Column('UUID DEFAULT NULL')
    public used_for_intent_id?: string | null;

    @Index({ unique: false })
    @Column('TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP')
    public created_at: string;

    @Index({ unique: false })
    @Column('TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP')
    public updated_at: string;
}
