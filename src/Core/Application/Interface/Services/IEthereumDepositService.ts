export interface IEthereumDepositService {
    /**
     * Upsert a normalized incoming ETH transfer and credit wallet when confirmed.
     */
    processTransaction(
        tx: {
            hash: string;
            valueEth: number;
            confirmations: number;
            block_time?: string;
            raw?: Record<string, unknown>;
        },
        address: string
    ): Promise<void>;
}
