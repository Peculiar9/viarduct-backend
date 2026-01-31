export interface IWalletAccount {
    _id?: string;
    wallet_id: string;
    currency_id: string;
    balance: number;                    // Current balance
    available_balance: number;          // balance - locked
    locked_balance: number;              // Locked in pending trades
    address?: string | null;             // Bitcoin address (for crypto only)
    address_type?: string | null;        // 'p2pkh', 'bech32', etc. (for crypto only)
    status: 'active' | 'suspended';
    created_at?: string;
    updated_at?: string;
}

