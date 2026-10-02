import { IWallet } from '../../Interface/Entities/wallet/IWallet';
import { IWalletAccount } from '../../Interface/Entities/wallet/IWalletAccount';
import { ICurrency } from '../Entities/wallet/ICurrency';
import { IWalletAccountTradingMetadata } from '../Entities/wallet/IWalletAccountMetadata';

export type WalletAccountWithCurrency = IWalletAccount & {
    currency: ICurrency;
    metadata?: IWalletAccountTradingMetadata;
};

export interface IWalletService {
    /**
     * Create a wallet for a user
     * @param userId User ID
     * @returns Created wallet
     */
    createWalletForUser(userId: string): Promise<IWallet>;

    /**
     * Create wallet accounts for a wallet (NGN and BTC)
     * @param walletId Wallet ID
     * @returns Array of created wallet accounts
     */
    createWalletAccountsForWallet(walletId: string): Promise<IWalletAccount[]>;

    /**
     * Initialize wallet system for a new user
     * Creates wallet and wallet accounts (NGN, BTC, ETH) in one transaction
     * @param userId User ID
     * @returns Object containing wallet and wallet accounts
     */
    initializeUserWallet(userId: string): Promise<{
        wallet: IWallet;
        walletAccounts: IWalletAccount[];
    }>;


    /**
     * Get user wallet with accounts and currency information
     * @param userId User ID
     * @returns Wallet with accounts and currency details, or null if not found
     */
    getUserWalletWithAccounts(userId: string): Promise<{
        wallet: IWallet;
        accounts: WalletAccountWithCurrency[];
    } | null>;

    /**
     * Credit user wallet with NGN
     * @param userId User ID
     * @param amount Amount in Naira (not kobo)
     * @returns Wallet and updated wallet account
     */
    creditUserWallet(userId: string, amount: number): Promise<{
        wallet: IWallet;
        walletAccount: IWalletAccount;
    }>;

    /**
     * Debit user wallet (NGN) - e.g. for withdrawals
     * @param userId User ID
     * @param amount Amount in Naira
     * @returns Updated wallet account
     */
    debitUserWallet(userId: string, amount: number): Promise<IWalletAccount>;

    /**
     * Debit a user's wallet account by currency code (NGN, BTC, ETH, ...).
     */
    debitUserWalletByCurrency(userId: string, currencyCode: string, amount: number): Promise<IWalletAccount>;

    /**
     * Credit a user's wallet account by currency code (used for purchase rollbacks).
     */
    creditUserWalletByCurrency(userId: string, currencyCode: string, amount: number): Promise<IWalletAccount>;

    /**
     * Atomically debit user.btc_balance / user.eth_balance and the matching wallet_account.
     */
    debitUserCryptoBalance(
        userId: string,
        asset: 'BTC' | 'ETH',
        amount: number
    ): Promise<IWalletAccount>;

    /**
     * Refund a crypto debit to user.btc_balance / user.eth_balance and the matching wallet_account.
     */
    creditUserCryptoBalance(userId: string, asset: 'BTC' | 'ETH', amount: number): Promise<IWalletAccount>;

    /**
     * Get or create a permanent static deposit address (Thresh0ld sequential HD path).
     */
    getOrCreateUserDepositAddress(
        userId: string,
        cryptoType: string
    ): Promise<{
        crypto_type: 'BTC' | 'ETH';
        address: string;
        derivation_path: string | null;
        network: string;
        already_existed: boolean;
    }>;

    /**
     * Credit a user's custodial BTC/ETH wallet from a Thresh0ld Receive webhook.
     * Returns credited=false when the address is not a user static deposit address.
     */
    handleIncomingWalletDeposit(params: {
        address: string;
        txHash: string;
        amountCrypto: number;
        asset: 'BTC' | 'ETH';
        source?: string;
    }): Promise<{ credited: boolean; userId?: string; alreadyProcessed?: boolean }>;

    /**
     * On-demand Thresh0ld history poll for confirmed deposits not yet COMPLETED.
     */
    syncUserWallet(
        userId: string,
        asset: 'BTC' | 'ETH'
    ): Promise<{
        asset: 'BTC' | 'ETH';
        deposit_address: string;
        btc_balance: number;
        eth_balance: number;
        synced_tx_hashes: string[];
    }>;

    /**
     * Debit company-owned crypto inventory after a treasury/admin on-chain payout.
     * Never touches user_balance.
     */
    debitPlatformOwnedForOutbound(asset: 'BTC' | 'ETH', amount: number): Promise<number>;

    /**
     * Generate or get Bitcoin address for user's BTC wallet account
     * @param userId User ID
     * @returns Bitcoin address
     */
    generateBitcoinAddress(userId: string): Promise<string>;

    /**
     * Generate or get Ethereum address for user's ETH wallet account
     */
    generateEthereumAddress(userId: string): Promise<string>;

    /**
     * Create platform wallet (exchange's main wallet)
     * @returns Created platform wallet
     */
    createPlatformWallet(): Promise<IWallet>;

    /**
     * Get platform wallet with accounts and currency information
     * @returns Platform wallet with accounts, or null if not found
     */
    getPlatformWalletWithAccounts(): Promise<{
        wallet: IWallet;
        accounts: Array<IWalletAccount & { currency: ICurrency }>;
    } | null>;

    /**
     * Initialize platform wallet system
     * Creates platform wallet and wallet accounts (NGN, BTC, ETH) with deposit addresses
     * @returns Object containing wallet and wallet accounts
     */
    initializePlatformWallet(): Promise<{
        wallet: IWallet;
        walletAccounts: IWalletAccount[];
    }>;

    /**
     * Ensure platform wallet + account exist and return or generate a deposit address for BTC or ETH.
     */
    ensurePlatformCryptoAddress(cryptoType: 'BTC' | 'ETH'): Promise<{
        crypto_type: 'BTC' | 'ETH';
        address: string;
        already_existed: boolean;
    }>;
}

