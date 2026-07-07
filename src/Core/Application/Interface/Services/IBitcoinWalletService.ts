export interface IBitcoinWalletService {
    /**
     * Generate a new Bitcoin address for a user
     * @param userId User ID
     * @param walletAccountId Wallet account ID
     * @returns Generated Bitcoin address and address type
     */
    generateAddress(userId: string, walletAccountId: string): Promise<{
        address: string;
        addressType: 'p2pkh' | 'p2sh' | 'p2wpkh' | 'p2wsh';
    }>;

    /**
     * Get or generate Bitcoin address for a wallet account
     * If address already exists, returns it. Otherwise generates a new one.
     */
    getOrGenerateAddress(userId: string, walletAccountId: string): Promise<string>;

    /**
     * Initialize platform wallet (master wallet for the exchange)
     * This should be called once during system initialization
     */
    initializePlatformWallet(): Promise<void>;

    /**
     * Get platform wallet address (for receiving Bitcoin from users)
     */
    getPlatformWalletAddress(): Promise<string>;

    /** Ephemeral per-trade deposit address (BIP44 account branch 1). */
    generateTradeIntentDepositAddress(intentId: string): Promise<{
        address: string;
        derivationPath: string;
    }>;

    /** Derive BIP32 path for a trade intent deposit address. */
    getTradeIntentDerivationPath(intentId: string): string;

    /** Vault / hot-wallet outbound path (BIP44 account branch 2, index 0). */
    getVaultDerivationPath(): string;

    getVaultAddress(): Promise<string>;
}
