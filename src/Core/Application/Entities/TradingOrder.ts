import { Column, CompositeIndex, ForeignKey, Index } from '../../../extensions/decorators';
import { TableNames } from '../Enums/TableNames';
import { ITradingOrder, TradingOrderType, TradingOrderStatus } from '../Interface/Entities/trading/ITradingOrder';

@CompositeIndex(['user_id', 'status'])
@CompositeIndex(['status', 'type'])
export class TradingOrder implements ITradingOrder {
    @Column('UUID PRIMARY KEY DEFAULT gen_random_uuid()')
    public _id?: string;

    @Index({ unique: false })
    @ForeignKey({
        table: TableNames.USERS,
        field: '_id',
        constraint: 'fk_trading_order_user_id'
    })
    @Column('UUID NOT NULL')
    public user_id: string;

    @Index({ unique: false })
    @Column('VARCHAR(10) NOT NULL')
    public type: TradingOrderType;

    @Index({ unique: false })
    @Column('VARCHAR(10) NOT NULL')
    public crypto_type: string;

    @Column('DECIMAL(18,8) NOT NULL')
    public crypto_amount: number;

    @Column('DECIMAL(20,2) NOT NULL')
    public fiat_amount: number;

    @Column('DECIMAL(20,2) NOT NULL')
    public rate_used: number;

    @Column('DECIMAL(18,8) DEFAULT NULL')
    public network_fee?: number;

    @Index({ unique: false })
    @Column('VARCHAR(50) DEFAULT \'pending\'')
    public status: TradingOrderStatus;

    @Index({ unique: false })
    @Column('VARCHAR(255) DEFAULT NULL')
    public payment_reference?: string;

    @Index({ unique: false })
    @Column('VARCHAR(255) DEFAULT NULL')
    public bitcoin_tx_hash?: string;

    @Index({ unique: false })
    @Column('VARCHAR(255) DEFAULT NULL')
    public bitcoin_tx_hash_outgoing?: string;

    @Index({ unique: false })
    @ForeignKey({
        table: TableNames.WALLET_ACCOUNTS,
        field: '_id',
        constraint: 'fk_trading_order_wallet_account_id'
    })
    @Column('UUID DEFAULT NULL')
    public wallet_account_id?: string;

    @Column('UUID[] DEFAULT NULL')
    public utxo_ids?: string[];

    @Column('UUID DEFAULT NULL')
    public change_utxo_id?: string;

    @Column('TEXT DEFAULT NULL')
    public failure_reason?: string;

    @Column('JSONB DEFAULT NULL')
    public metadata?: Record<string, any>;

    @Index({ unique: false })
    @Column('TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP')
    public created_at: string;

    @Index({ unique: false })
    @Column('TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP')
    public updated_at: string;

    @Column('TIMESTAMP WITH TIME ZONE DEFAULT NULL')
    public completed_at?: string;
}

