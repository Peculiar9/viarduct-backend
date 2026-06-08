export interface IEthereumWalletService {
    generateAddress(userId: string, walletAccountId: string): Promise<{ address: string }>;

    getOrGenerateAddress(userId: string, walletAccountId: string): Promise<string>;

    initializePlatformWallet(): Promise<void>;

    getPlatformWalletAddress(): Promise<string>;

    /** HD wallet for signing native transfers from a deposit address. */
    getDerivedWalletForAccount(walletAccountId: string): Promise<import('ethers').HDNodeWallet>;
}
