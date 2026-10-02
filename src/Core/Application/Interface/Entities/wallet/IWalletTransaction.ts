export type WalletTransactionType = 'DEPOSIT' | 'WITHDRAWAL' | 'TRANSFER';
export type WalletTransactionStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

export interface IWalletTransaction {
    _id?: string;
    user_id: string;
    wallet_account_id?: string | null;
    crypto_type: 'BTC' | 'ETH';
    type: WalletTransactionType;
    status: WalletTransactionStatus;
    amount: number;
    /** Total fee charged to the user (on-chain gas + platform profit). */
    network_fee?: number;
    /** Live/estimated on-chain gas in crypto units. */
    estimated_onchain_gas?: number;
    /** Platform markup on the estimated gas. */
    platform_profit?: number;
    incoming_tx_hash?: string | null;
    outgoing_tx_hash?: string | null;
    address?: string | null;
    network?: string | null;
    metadata?: Record<string, unknown> | null;
    created_at: string;
    updated_at: string;
}
