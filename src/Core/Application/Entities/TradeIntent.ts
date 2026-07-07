import { Column, CompositeIndex, ForeignKey, Index } from '../../../extensions/decorators';
import { TableNames } from '../Enums/TableNames';
import {
    CustodyProviderName,
    ITradeIntent,
    TradeIntentSettlementMode,
    TradeIntentStatus,
    TradeIntentType
} from '../Interface/Entities/trading/ITradeIntent';
import { ITradeIntentProofOfPayment } from '../Interface/Entities/trading/ITradeIntentProofOfPayment';

@CompositeIndex(['user_id', 'status'])
@CompositeIndex(['status', 'type'])
@CompositeIndex(['deposit_address'])
export class TradeIntent implements ITradeIntent {
    @Column('UUID PRIMARY KEY DEFAULT gen_random_uuid()')
    public _id?: string;

    @Index({ unique: false })
    @ForeignKey({
        table: TableNames.USERS,
        field: '_id',
        constraint: 'fk_trade_intent_user_id'
    })
    @Column('UUID NOT NULL')
    public user_id: string;

    @Index({ unique: false })
    @Column('VARCHAR(10) NOT NULL')
    public type: TradeIntentType;

    @Index({ unique: false })
    @Column('VARCHAR(30) DEFAULT \'pending\'')
    public status: TradeIntentStatus;

    @Index({ unique: false })
    @Column('VARCHAR(10) NOT NULL')
    public crypto_type: string;

    @Column('VARCHAR(20) DEFAULT \'controlled_p2p\'')
    public settlement_mode: TradeIntentSettlementMode;

    @Column('DECIMAL(20, 2) NOT NULL')
    public spot_price_ngn: number;

    @Column('DECIMAL(20, 2) NOT NULL')
    public buy_rate: number;

    @Column('DECIMAL(20, 2) NOT NULL')
    public sell_rate: number;

    @Column('DECIMAL(20, 2) NOT NULL')
    public rate_used: number;

    @Column('DECIMAL(18, 8) NOT NULL')
    public quoted_crypto_amount: number;

    @Column('DECIMAL(20, 2) NOT NULL')
    public quoted_fiat_amount: number;

    @Column('DECIMAL(18, 8) DEFAULT 0')
    public quoted_gas_crypto: number;

    @Column('DECIMAL(20, 2) DEFAULT 0')
    public quoted_gas_ngn: number;

    @Column('DECIMAL(18, 8) NOT NULL')
    public net_crypto_amount: number;

    @Column('DECIMAL(20, 2) DEFAULT NULL')
    public net_fiat_payout?: number | null;

    @Column('TIMESTAMP WITH TIME ZONE NOT NULL')
    public quote_expires_at: string;

    @Column('VARCHAR(20) DEFAULT NULL')
    public recipient_bank_code?: string | null;

    @Column('VARCHAR(100) DEFAULT NULL')
    public recipient_bank_name?: string | null;

    @Column('VARCHAR(20) DEFAULT NULL')
    public recipient_account_number?: string | null;

    @Column('VARCHAR(255) DEFAULT NULL')
    public recipient_account_name?: string | null;

    @Index({ unique: false })
    @Column('VARCHAR(255) DEFAULT NULL')
    public deposit_address?: string | null;

    @Column('VARCHAR(100) DEFAULT NULL')
    public deposit_derivation_path?: string | null;

    @Column('VARCHAR(20) DEFAULT \'inhouse\'')
    public custody_provider: CustodyProviderName;

    @Index({ unique: false })
    @Column('VARCHAR(255) DEFAULT NULL')
    public incoming_tx_hash?: string | null;

    @Column('DECIMAL(18, 8) DEFAULT NULL')
    public incoming_crypto_amount?: number | null;

    @Column('TIMESTAMP WITH TIME ZONE DEFAULT NULL')
    public crypto_detected_at?: string | null;

    @Column('VARCHAR(255) DEFAULT NULL')
    public external_destination_address?: string | null;

    @Column('DECIMAL(20, 2) DEFAULT NULL')
    public fiat_amount_expected?: number | null;

    @Column('VARCHAR(255) DEFAULT NULL')
    public fiat_payment_reference?: string | null;

    @ForeignKey({
        table: TableNames.USER_BANK_ACCOUNTS,
        field: '_id',
        constraint: 'fk_trade_intent_corporate_bank_account_id'
    })
    @Column('UUID DEFAULT NULL')
    public corporate_bank_account_id?: string | null;

    @Column('VARCHAR(20) DEFAULT NULL')
    public fiat_destination_bank_code?: string | null;

    @Column('VARCHAR(100) DEFAULT NULL')
    public fiat_destination_bank_name?: string | null;

    @Column('VARCHAR(20) DEFAULT NULL')
    public fiat_destination_account_number?: string | null;

    @Column('VARCHAR(255) DEFAULT NULL')
    public fiat_destination_account_name?: string | null;

    @Column('TIMESTAMP WITH TIME ZONE DEFAULT NULL')
    public fiat_verified_at?: string | null;

    @ForeignKey({
        table: TableNames.USERS,
        field: '_id',
        constraint: 'fk_trade_intent_fiat_verified_by'
    })
    @Column('UUID DEFAULT NULL')
    public fiat_verified_by?: string | null;

    @Index({ unique: false })
    @Column('VARCHAR(255) DEFAULT NULL')
    public outgoing_tx_hash?: string | null;

    @Column('DECIMAL(18, 8) DEFAULT NULL')
    public actual_gas_crypto?: number | null;

    @Column('DECIMAL(20, 2) DEFAULT NULL')
    public actual_gas_ngn?: number | null;

    @Column('TIMESTAMP WITH TIME ZONE DEFAULT NULL')
    public settled_at?: string | null;

    @ForeignKey({
        table: TableNames.USERS,
        field: '_id',
        constraint: 'fk_trade_intent_settled_by'
    })
    @Column('UUID DEFAULT NULL')
    public settled_by?: string | null;

    @Column('TEXT DEFAULT NULL')
    public admin_notes?: string | null;

    @Column('TEXT DEFAULT NULL')
    public confirmation_note?: string | null;

    @Column('DECIMAL(20, 2) DEFAULT NULL')
    public total_amount_confirmed?: number | null;

    @Column('DECIMAL(18, 8) DEFAULT NULL')
    public total_crypto_amount_confirmed?: number | null;

    @Column('VARCHAR(255) DEFAULT NULL')
    public confirmation_tx_reference?: string | null;

    @Column('TIMESTAMP WITH TIME ZONE DEFAULT NULL')
    public admin_confirmed_at?: string | null;

    @ForeignKey({
        table: TableNames.USERS,
        field: '_id',
        constraint: 'fk_trade_intent_admin_confirmed_by'
    })
    @Column('UUID DEFAULT NULL')
    public admin_confirmed_by?: string | null;

    @Column('TIMESTAMP WITH TIME ZONE DEFAULT NULL')
    public swept_at?: string | null;

    @Column('TEXT DEFAULT NULL')
    public failure_reason?: string | null;

    @Column('JSONB DEFAULT \'[]\'::jsonb')
    public proof_of_payment?: ITradeIntentProofOfPayment[] | null;

    @Column('JSONB DEFAULT \'[]\'::jsonb')
    public admin_payout_proof?: ITradeIntentProofOfPayment[] | null;

    @Column('UUID DEFAULT NULL')
    public payout_consent_id?: string | null;

    @Column('DATE DEFAULT NULL')
    public payout_date?: string | null;

    @Column('TIMESTAMP WITH TIME ZONE DEFAULT NULL')
    public payout_at?: string | null;

    @ForeignKey({
        table: TableNames.USERS,
        field: '_id',
        constraint: 'fk_trade_intent_payout_by'
    })
    @Column('UUID DEFAULT NULL')
    public payout_by?: string | null;

    @Column('JSONB DEFAULT NULL')
    public metadata?: Record<string, unknown> | null;

    @Index({ unique: false })
    @Column('TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP')
    public created_at: string;

    @Index({ unique: false })
    @Column('TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP')
    public updated_at: string;
}
