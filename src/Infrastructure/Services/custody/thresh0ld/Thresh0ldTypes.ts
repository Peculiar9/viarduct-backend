export type Thresh0ldCoin = 'btc' | 'eth';

/**
 * Thresh0ld MPC nodes only index HD sub-addresses within batches of 40,000
 * (indices 0..39999). Paths outside this range are ignored by the watcher.
 */
export const THRESH0LD_ADDRESS_INDEX_BATCH_SIZE = 40_000;

export interface Thresh0ldCreateWalletRequest {
    cloudProvider: 'mpc';
    wallet: {
        coin: string;
        walletType: 'deposit' | 'withdrawal' | string;
    };
}

export interface Thresh0ldCreateWalletResponse {
    success?: boolean;
    message?: string | null;
    data?: {
        walletId?: number | string;
        id?: number | string;
        coin?: string;
        walletType?: string;
        [key: string]: unknown;
    };
    walletId?: number | string;
}

export interface Thresh0ldGenerateAddressRequest {
    wallet: {
        coin: string;
        walletId: number | string;
        allToken?: boolean;
    };
    /**
     * Address derivation index (API 2.0 uses a numeric path, not BIP32 string).
     * Must be within Thresh0ld's first watcher batch: 0..39999 (maps to m/0/{index}).
     */
    path: number;
}

export interface Thresh0ldGenerateAddressResponse {
    success?: boolean;
    address?: string;
    path?: number | string;
    message?: string | null;
    data?: {
        address?: string;
        path?: number | string;
        walletId?: number | string;
        coin?: string;
        [key: string]: unknown;
    };
}

export interface Thresh0ldSendManyRequest {
    wallet: {
        coin: string;
        allToken?: boolean;
        tokenOptions?: {
            tokenName?: string;
            tokenAddress?: string;
        };
    };
    transactions: {
        recipientsData: {
            recipients: Array<{
                address: string;
                amount: number | string;
            }>;
            sequenceId: string;
        };
        consolidateOptions?: {
            targetAddress: string;
        };
    };
}

export interface Thresh0ldSendManyResponse {
    success?: boolean;
    message?: string | null;
    data?: {
        sequenceId?: string;
        destinationAddress?: string;
        amount?: number | string;
        coin?: string;
        messageToSign?: string;
        signature?: string;
        timestamp?: number;
        txHash?: string;
        txid?: string;
        transactionId?: string | number;
        id?: string | number;
        output?: Array<{ address: string; valueUnitAmount: number }>;
        [key: string]: unknown;
    };
    sequenceId?: string;
    txHash?: string;
    txid?: string;
    id?: string;
}

export interface Thresh0ldSubmitTransactionRequest {
    wallet: {
        coin: string;
    };
}

export interface Thresh0ldSubmitTransactionResponse {
    success?: boolean;
    message?: string | null;
    data?: {
        txHash?: string;
        txid?: string;
        transactionId?: string | number;
        sequenceId?: string;
        id?: string | number;
        [key: string]: unknown;
    };
}

export interface Thresh0ldWalletListRequest {
    wallet: {
        coin: string;
    };
}

export interface Thresh0ldWebhookPayload {
    event?: string;
    type?: string;
    eventType?: string;
    status?: string;
    address?: string;
    amount?: string | number;
    txHash?: string;
    txid?: string;
    transactionHash?: string;
    coin?: string;
    asset?: string;
    data?: {
        address?: string;
        amount?: string | number;
        txHash?: string;
        txid?: string;
        transactionHash?: string;
        coin?: string;
        asset?: string;
        type?: string;
        event?: string;
    };
}
