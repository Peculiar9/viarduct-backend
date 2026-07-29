import { Column, CompositeIndex, ForeignKey, Index } from '../../../extensions/decorators';
import { TableNames } from '../Enums/TableNames';
import {
    IPlatformCryptoAddress,
    PlatformCryptoAsset
} from '../Interface/Entities/trading/IPlatformCryptoAddress';

@CompositeIndex(['asset', 'is_active'])
export class PlatformCryptoAddress implements IPlatformCryptoAddress {
    @Column('UUID PRIMARY KEY DEFAULT gen_random_uuid()')
    public _id?: string;

    @Index({ unique: false })
    @Column('VARCHAR(10) NOT NULL')
    public asset: PlatformCryptoAsset;

    @Index({ unique: true })
    @Column('VARCHAR(255) NOT NULL')
    public address: string;

    @Column('VARCHAR(100) DEFAULT NULL')
    public label?: string | null;

    @Column('BOOLEAN DEFAULT TRUE')
    public is_active: boolean;

    @Index({ unique: false })
    @Column('TIMESTAMP WITH TIME ZONE DEFAULT NULL')
    public last_assigned_at?: string | null;

    @ForeignKey({
        table: TableNames.USERS,
        field: '_id',
        constraint: 'fk_platform_crypto_address_created_by'
    })
    @Column('UUID NOT NULL')
    public created_by: string;

    @Index({ unique: false })
    @Column('TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP')
    public created_at: string;

    @Index({ unique: false })
    @Column('TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP')
    public updated_at: string;
}
