export interface IBitcoinTransactionService {
    /**
     * Calculate network fee for a transaction
     * @param priority 'low' | 'medium' | 'high'
     * @returns Fee in BTC
     */
    calculateNetworkFee(priority?: 'low' | 'medium' | 'high'): Promise<number>;

    /**
     * Build a Bitcoin transaction
     * @param fromAddress Source address
     * @param toAddress Destination address
     * @param amount Amount in BTC
     * @param fee Network fee in BTC
     * @returns Unsigned transaction
     */
    buildTransaction(
        fromAddress: string,
        toAddress: string,
        amount: number,
        fee?: number
    ): Promise<any>;

    /**
     * Build a Bitcoin transaction using specific UTXOs
     * @param fromAddress Source address
     * @param toAddress Destination address
     * @param amount Amount in BTC
     * @param utxos Array of UTXOs to use (from database)
     * @param fee Network fee in BTC
     * @returns Unsigned transaction
     */
    buildTransactionWithUTXOs(
        fromAddress: string,
        toAddress: string,
        amount: number,
        utxos: Array<{ txid: string; vout: number; amount: number; script?: string }>,
        fee?: number
    ): Promise<any>;

    /**
     * Sign a transaction with private key
     * @param transaction Unsigned transaction
     * @param fromAddress Address to sign from (we derive private key)
     * @returns Signed transaction
     */
    signTransaction(transaction: any, fromAddress: string): Promise<string>;

    /**
     * Broadcast a signed transaction to Bitcoin network
     * @param signedTransactionHex Signed transaction in hex format
     * @returns Transaction hash
     */
    broadcastTransaction(signedTransactionHex: string): Promise<string>;

    /**
     * Send BTC from one address to another (complete flow)
     * @param fromAddress Source address
     * @param toAddress Destination address
     * @param amount Amount in BTC
     * @param priority Transaction priority
     * @returns Transaction hash
     */
    sendBitcoin(
        fromAddress: string,
        toAddress: string,
        amount: number,
        priority?: 'low' | 'medium' | 'high'
    ): Promise<string>;
}

