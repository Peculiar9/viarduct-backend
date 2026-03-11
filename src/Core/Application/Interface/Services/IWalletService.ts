import { IWallet } from '../../Interface/Entities/wallet/IWallet';
import { IWalletAccount } from '../../Interface/Entities/wallet/IWalletAccount';
import { ICurrency } from '../Entities/wallet/ICurrency';

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
     * Creates wallet and wallet accounts (NGN and BTC) in one transaction
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
        accounts: Array<IWalletAccount & { currency: ICurrency }>;
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
     * Generate or get Bitcoin address for user's BTC wallet account
     * @param userId User ID
     * @returns Bitcoin address
     */
    generateBitcoinAddress(userId: string): Promise<string>;

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
     * Creates platform wallet and wallet accounts (NGN and BTC) with BTC address
     * @returns Object containing wallet and wallet accounts
     */
    initializePlatformWallet(): Promise<{
        wallet: IWallet;
        walletAccounts: IWalletAccount[];
    }>;
}

