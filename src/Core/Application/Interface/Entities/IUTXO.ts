export interface IUTXO {
    _id?: string;
    txid: string;  // Transaction ID that created this UTXO
    vout: number;   // Output index in that transaction
    amount: number; // Amount in BTC
    address: string; // Address that owns this UTXO
    script?: string; // Script hex (for building transactions)
    status: 'available' | 'reserved' | 'spent'; // UTXO status
    /**
     * Ownership tagging to enforce custodial safety:
     * - user: belongs to user's spendable bucket (must never be swept by platform)
     * - platform: belongs to platform-owned bucket (sellable / sweepable)
     */
    ownership?: 'user' | 'platform';
    reserved_for_order_id?: string | null; // Which order reserved this UTXO
    wallet_account_id?: string | null; // Link to wallet_account table
    created_at?: string;
    updated_at?: string;
    spent_at?: string | null; // When it was spent
    spent_txid?: string | null; // Transaction that spent it
}

