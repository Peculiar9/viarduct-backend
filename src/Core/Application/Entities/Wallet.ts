import { Column, Index, ForeignKey } from '../../../extensions/decorators';
import { IWallet } from '../Interface/Entities/wallet/IWallet';
import { TableNames } from '../Enums/TableNames';

export class Wallet implements IWallet {
    @Column('UUID PRIMARY KEY DEFAULT gen_random_uuid()')
    public _id?: string;

    @Index({ unique: true })
    @ForeignKey({
        table: TableNames.USERS,
        field: '_id',
        constraint: 'fk_wallet_user_id'
    })
    @Column('UUID DEFAULT NULL')
    public user_id: string | null;

    @Column('BOOLEAN DEFAULT false')
    public is_platform_wallet: boolean;

    @Column('VARCHAR(20) NOT NULL DEFAULT \'active\'')
    public status: 'active' | 'suspended' | 'frozen';

    @Column('TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP')
    public created_at?: string;

    @Column('TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP')
    public updated_at?: string;
}

