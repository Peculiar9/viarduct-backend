import { Column, CompositeIndex, ForeignKey, Index } from '../../../extensions/decorators';
import { TableNames } from '../Enums/TableNames';
import { IWalletTransaction } from '../Interface/Entities/wallet/IWalletTransaction';

@CompositeIndex(['user_id', 'created_at'])
export class WalletTransaction implements IWalletTransaction {
    @Column('UUID PRIMARY KEY DEFAULT gen_random_uuid()')
    public _id?: string;

    @Index({ unique: false })
    @ForeignKey({
        table: TableNames.USERS,
        field: '_id',
        constraint: 'fk_wallet_transaction_user_id'
    })
    @Column('UUID NOT NULL')
    public user_id: string;

    @ForeignKey({
        table: TableNames.WALLET_ACCOUNTS,
        field: '_id',
        constraint: 'fk_wallet_transaction_wallet_account_id'
    })
    @Column('UUID DEFAULT NULL')
    public wallet_account_id?: string | null;

    @Column('VARCHAR(10) NOT NULL')
    public crypto_type: IWalletTransaction['crypto_type'];

    @Column('VARCHAR(20) NOT NULL DEFAULT \'DEPOSIT\'')
    public type: IWalletTransaction['type'];

    @Column('VARCHAR(20) NOT NULL DEFAULT \'COMPLETED\'')
    public status: IWalletTransaction['status'];

    @Column('DECIMAL(20, 8) NOT NULL')
    public amount: number;

    @Column('DECIMAL(20, 8) NOT NULL DEFAULT 0')
    public network_fee?: number;

    @Column('DECIMAL(20, 8) NOT NULL DEFAULT 0')
    public estimated_onchain_gas?: number;

    @Column('DECIMAL(20, 8) NOT NULL DEFAULT 0')
    public platform_profit?: number;

    @Index({ unique: true })
    @Column('VARCHAR(255) DEFAULT NULL')
    public incoming_tx_hash?: string | null;

    @Column('VARCHAR(255) DEFAULT NULL')
    public outgoing_tx_hash?: string | null;

    @Column('VARCHAR(255) DEFAULT NULL')
    public address?: string | null;

    @Column('VARCHAR(100) DEFAULT NULL')
    public network?: string | null;

    @Column('JSONB DEFAULT NULL')
    public metadata?: Record<string, unknown> | null;

    @Index({ unique: false })
    @Column('TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP')
    public created_at: string;

    @Index({ unique: false })
    @Column('TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP')
    public updated_at: string;
}
