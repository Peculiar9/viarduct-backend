import { Column, ForeignKey, Index } from '../../../extensions/decorators';
import { TableNames } from '../Enums/TableNames';
import { ISweepAudit } from '../Interface/Entities/bitcoin/ISweepAudit';

export class SweepAudit implements ISweepAudit {
    @Column('UUID PRIMARY KEY DEFAULT gen_random_uuid()')
    public _id?: string;

    @Index({ unique: false })
    @ForeignKey({
        table: TableNames.WALLET_ACCOUNTS,
        field: '_id',
        constraint: 'fk_sweep_audit_wallet_account_id'
    })
    @Column('UUID DEFAULT NULL')
    public wallet_account_id?: string | null;

    @Index({ unique: false })
    @ForeignKey({
        table: TableNames.TRADE_INTENTS,
        field: '_id',
        constraint: 'fk_sweep_audit_trade_intent_id'
    })
    @Column('UUID DEFAULT NULL')
    public trade_intent_id?: string | null;

    @Index({ unique: false })
    @Column('VARCHAR(255) NOT NULL')
    public from_address: string;

    @Index({ unique: false })
    @Column('VARCHAR(255) NOT NULL')
    public to_address: string;

    @Index({ unique: false })
    @Column('VARCHAR(255) NOT NULL')
    public tx_hash: string;

    @Column('DECIMAL(20, 8) NOT NULL')
    public amount_moved: number;

    @Column('DECIMAL(20, 8) NOT NULL')
    public fee_paid: number;

    @Column('DECIMAL(20, 8) NOT NULL')
    public amount_debited: number;

    @Column('INTEGER DEFAULT NULL')
    public fee_rate_sats_vbyte?: number | null;

    @Column('VARCHAR(10) NOT NULL DEFAULT \'BTC\'')
    public asset?: 'BTC' | 'ETH';

    @Column('VARCHAR(20) NOT NULL DEFAULT \'broadcasted\'')
    public status: 'broadcasted' | 'failed';

    @Column('TEXT DEFAULT NULL')
    public failure_reason?: string | null;

    @Index({ unique: false })
    @Column('TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP')
    public created_at: string;

    @Index({ unique: false })
    @Column('TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP')
    public updated_at: string;
}

