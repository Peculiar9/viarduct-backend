export interface IEthereumTransaction {
    _id?: string;
    tx_hash: string;
    address: string;
    wallet_account_id?: string;
    amount: number;
    confirmations: number;
    status: 'pending' | 'confirmed' | 'failed';
    direction: 'incoming' | 'outgoing';
    webhook_data?: Record<string, any>;
    metadata?: Record<string, any>;
    block_time?: string;
    created_at: string;
    updated_at: string;
}
