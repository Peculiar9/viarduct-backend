export interface IWallet {
    _id?: string;
    user_id: string | null;        // NULL for platform wallet
    is_platform_wallet: boolean;    // true for Viarduct platform wallet
    status: 'active' | 'suspended' | 'frozen';
    created_at?: string;
    updated_at?: string;
}

