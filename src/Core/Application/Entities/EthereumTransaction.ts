import { Column, CompositeIndex, ForeignKey, Index } from '../../../extensions/decorators';
import { TableNames } from '../Enums/TableNames';
import { IEthereumTransaction } from '../Interface/Entities/ethereum/IEthereumTransaction';

@CompositeIndex(['address', 'tx_hash'])
@CompositeIndex(['wallet_account_id', 'status'])
export class EthereumTransaction implements IEthereumTransaction {
    @Column('UUID PRIMARY KEY DEFAULT gen_random_uuid()')
    public _id?: string;

    @Index({ unique: true })
    @Column('VARCHAR(255) NOT NULL UNIQUE')
    public tx_hash: string;

    @Index({ unique: false })
    @Column('VARCHAR(255) NOT NULL')
    public address: string;

    @Index({ unique: false })
    @ForeignKey({
        table: TableNames.WALLET_ACCOUNTS,
        field: '_id',
        constraint: 'fk_ethereum_transaction_wallet_account_id'
    })
    @Column('UUID')
    public wallet_account_id?: string;

    @Column('DECIMAL(20,8) NOT NULL')
    public amount: number;

    @Column('INTEGER DEFAULT 0')
    public confirmations: number;

    @Column('VARCHAR(50) DEFAULT \'pending\'')
    public status: 'pending' | 'confirmed' | 'failed';

    @Column('VARCHAR(50) DEFAULT \'incoming\'')
    public direction: 'incoming' | 'outgoing';

    @Column('JSONB DEFAULT NULL')
    public webhook_data?: Record<string, any>;

    @Column('JSONB DEFAULT NULL')
    public metadata?: Record<string, any>;

    @Column('TIMESTAMP WITH TIME ZONE')
    public block_time?: string;

    @Index({ unique: false })
    @Column('TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP')
    public created_at: string;

    @Index({ unique: false })
    @Column('TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP')
    public updated_at: string;
}
