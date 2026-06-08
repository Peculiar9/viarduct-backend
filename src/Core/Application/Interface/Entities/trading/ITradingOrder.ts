export type TradingOrderType = 'buy' | 'sell';
export type TradingOrderStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
export type TradingOrderSettlementMode = 'internal' | 'onchain';

export interface ITradingOrder {
    _id?: string;
    user_id: string;
    type: TradingOrderType; // 'buy' or 'sell'
    /**
     * Tracks how the order was settled.
     * - internal: custodial ledger move only (no on-chain tx)
     * - onchain: settlement depended on blockchain confirmation
     */
    settlement_mode?: TradingOrderSettlementMode;
    crypto_type: string; // 'BTC', 'ETH', etc.
    crypto_amount: number; // Amount of crypto (e.g., 0.001 BTC)
    fiat_amount: number; // Amount in NGN
    rate_used: number; // The rate used at time of order creation
    network_fee?: number; // Network fee in BTC (if applicable)
    status: TradingOrderStatus;
    payment_reference?: string; // For buy orders (Paystack reference)
    bitcoin_tx_hash?: string; // For sell orders (BTC transaction hash)
    bitcoin_tx_hash_outgoing?: string; // For buy orders (BTC sent to user)
    wallet_account_id?: string; // User's wallet account ID
    utxo_ids?: string[]; // Array of UTXO IDs used in this transaction
    change_utxo_id?: string; // Change UTXO created by this transaction
    failure_reason?: string; // If order failed
    metadata?: Record<string, any>; // Additional data
    created_at: string;
    updated_at: string;
    completed_at?: string;
}

