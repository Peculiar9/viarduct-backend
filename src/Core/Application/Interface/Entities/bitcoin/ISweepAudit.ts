export interface ISweepAudit {
    _id?: string;
    wallet_account_id?: string | null;
    from_address: string;
    to_address: string;
    tx_hash: string;
    amount_moved: number; // BTC sent to vault (net)
    fee_paid: number; // BTC fee
    amount_debited: number; // amount_moved + fee_paid
    fee_rate_sats_vbyte?: number | null;
    asset?: 'BTC' | 'ETH';
    status: 'broadcasted' | 'failed';
    failure_reason?: string | null;
    created_at: string;
    updated_at: string;
}

