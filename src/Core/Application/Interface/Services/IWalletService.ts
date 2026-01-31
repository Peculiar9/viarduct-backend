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
}

