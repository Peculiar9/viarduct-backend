export interface IWalletAccount {
    _id?: string;
    wallet_id: string;
    currency_id: string;
    balance: number;                    // Current balance
    available_balance: number;          // balance - locked
    locked_balance: number;              // Locked in pending trades
    /**
     * Custodial ledger fields (primarily for crypto like BTC).
     *
     * - user_balance: what the user can spend/withdraw/sell (their claim)
     * - platform_owned_balance: BTC physically sitting in this address that the platform owns (sellable assets)
     * - total_onchain_balance: the physical BTC tracked for this address/ledger bucket
     *
     * Safety rule: platform operations must NEVER spend user_balance.
     */
    user_balance?: number;
    platform_owned_balance?: number;
    total_onchain_balance?: number;
    /**
     * Placeholder for future sweeping policy: when platform_owned_balance gets large enough,
     * we can sweep to a vault address to optimize network fees.
     */
    sweep_threshold?: number | null;
    address?: string | null;             // Bitcoin address (for crypto only)
    address_type?: string | null;        // 'p2pkh', 'bech32', etc. (for crypto only)
    status: 'active' | 'suspended';
    created_at?: string;
    updated_at?: string;
}

