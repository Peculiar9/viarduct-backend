export interface IBlockchainService {
    /**
     * Get balance for a Bitcoin address
     */
    getAddressBalance(address: string): Promise<number>;

    /**
     * Get transaction history for an address
     */
    getAddressTransactions(address: string): Promise<any[]>;

    /**
     * Verify a transaction
     */
    verifyTransaction(txHash: string): Promise<{
        confirmed: boolean;
        confirmations: number;
        amount: number;
        to: string;
    } | null>;

    /**
     * Monitor addresses for incoming transactions
     * This should be called periodically or via webhook
     */
    checkAddressForIncomingTransactions(address: string): Promise<any[]>;
}

