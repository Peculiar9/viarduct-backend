import { Column, Index, ForeignKey, CompositeIndex } from '../../../extensions/decorators';
import { IWalletAccount } from '../Interface/Entities/wallet/IWalletAccount';
import { TableNames } from '../Enums/TableNames';

@CompositeIndex(['wallet_id', 'currency_id'])
export class WalletAccount implements IWalletAccount {
    @Column('UUID PRIMARY KEY DEFAULT gen_random_uuid()')
    public _id?: string;

    @Index({ unique: false })
    @ForeignKey({
        table: TableNames.WALLETS,
        field: '_id',
        constraint: 'fk_wallet_account_wallet_id'
    })
    @Column('UUID NOT NULL')
    public wallet_id: string;

    @Index({ unique: false })
    @ForeignKey({
        table: TableNames.CURRENCIES,
        field: '_id',
        constraint: 'fk_wallet_account_currency_id'
    })
    @Column('UUID NOT NULL')
    public currency_id: string;

    @Column('DECIMAL(20, 8) NOT NULL DEFAULT 0')
    public balance: number;

    @Column('DECIMAL(20, 8) NOT NULL DEFAULT 0')
    public available_balance: number;

    @Column('DECIMAL(20, 8) NOT NULL DEFAULT 0')
    public locked_balance: number;

    // --- Custodial ledger fields (crypto) ---
    // NOTE: We keep existing balance/available_balance for backward compatibility.
    // For BTC accounts we treat:
    // - balance/available_balance as the user's spendable ledger (user_balance / user_balance - locked)
    // - platform_owned_balance as company-owned BTC sitting in this account/address
    // - total_onchain_balance as physical BTC tracked for this account/address bucket
    @Column('DECIMAL(20, 8) NOT NULL DEFAULT 0')
    public user_balance?: number;

    @Column('DECIMAL(20, 8) NOT NULL DEFAULT 0')
    public platform_owned_balance?: number;

    @Column('DECIMAL(20, 8) NOT NULL DEFAULT 0')
    public total_onchain_balance?: number;

    @Column('DECIMAL(20, 8) DEFAULT NULL')
    public sweep_threshold?: number | null;

    @Column('VARCHAR(255) DEFAULT NULL')
    public address?: string | null;

    @Column('VARCHAR(20) DEFAULT NULL')
    public address_type?: string | null;

    @Column('VARCHAR(20) NOT NULL DEFAULT \'active\'')
    public status: 'active' | 'suspended';

    @Column('TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP')
    public created_at?: string;

    @Column('TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP')
    public updated_at?: string;
}

