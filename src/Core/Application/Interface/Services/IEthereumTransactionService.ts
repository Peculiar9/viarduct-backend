export interface IEthereumTransactionService {
    /**
     * Send native ETH from a custodial deposit address to the vault.
     * @returns tx hash and actual fee paid (ETH)
     */
    sendNativeSweep(
        walletAccountId: string,
        fromAddress: string,
        toVaultAddress: string,
        amountEth: number
    ): Promise<{ txHash: string; feeEth: number }>;

    estimateNativeTransferFee(fromAddress: string, toAddress: string, amountEth: number): Promise<number>;

    sendFromDerivationPath(
        derivationPath: string,
        fromAddress: string,
        toAddress: string,
        amountEth: number
    ): Promise<{ txHash: string; feeEth: number }>;

    sendNativeSweepFromDerivationPath(
        derivationPath: string,
        fromAddress: string,
        toVaultAddress: string,
        amountEth: number
    ): Promise<{ txHash: string; feeEth: number }>;
}
