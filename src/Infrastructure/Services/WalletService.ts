import { inject, injectable } from 'inversify';
import { IWalletService } from '../../Core/Application/Interface/Services/IWalletService';
import { IWallet } from '../../Core/Application/Interface/Entities/wallet/IWallet';
import { IWalletAccount } from '../../Core/Application/Interface/Entities/wallet/IWalletAccount';
import { WalletRepository } from '../Repository/SQL/wallet/WalletRepository';
import { WalletAccountRepository } from '../Repository/SQL/wallet/WalletAccountRepository';
import { CurrencyRepository } from '../Repository/SQL/wallet/CurrencyRepository';
import { TYPES } from '../../Core/Types/Constants';
import { ValidationError, ServiceError } from '../../Core/Application/Error/AppError';
import { Console } from '../Utils/Console';
import { ICurrency } from '@/Core/Application/Interface/Entities/wallet/ICurrency';
import { IBitcoinWalletService } from '../../Core/Application/Interface/Services/IBitcoinWalletService';
import { IEthereumWalletService } from '../../Core/Application/Interface/Services/IEthereumWalletService';
import { ITradingRateService } from '../../Core/Application/Interface/Services/ITradingRateService';
import { IWalletAccountTradingMetadata } from '../../Core/Application/Interface/Entities/wallet/IWalletAccountMetadata';
import { WalletAccountWithCurrency } from '../../Core/Application/Interface/Services/IWalletService';

@injectable()
export class WalletService implements IWalletService {
    constructor(
        @inject(TYPES.WalletRepository) private readonly walletRepository: WalletRepository,
        @inject(TYPES.WalletAccountRepository) private readonly walletAccountRepository: WalletAccountRepository,
        @inject(TYPES.CurrencyRepository) private readonly currencyRepository: CurrencyRepository,
        @inject(TYPES.BitcoinWalletService) private readonly bitcoinWalletService: IBitcoinWalletService,
        @inject(TYPES.EthereumWalletService) private readonly ethereumWalletService: IEthereumWalletService,
        @inject(TYPES.TradingRateService) private readonly tradingRateService: ITradingRateService
    ) {}

    /**
     * Create a wallet for a user
     */
    async createWalletForUser(userId: string): Promise<IWallet> {
        try {
            // Check if wallet already exists for this user
            const existingWallet = await this.walletRepository.findByUserId(userId);
            if (existingWallet) {
                throw new ValidationError('Wallet already exists for this user');
            }

            const walletData: Partial<IWallet> = {
                user_id: userId,
                is_platform_wallet: false,
                status: 'active'
            };

            const wallet = await this.walletRepository.create(walletData as IWallet);
            Console.info('Wallet created for user', { userId, walletId: wallet._id });
            return wallet;
        } catch (error: any) {
            Console.error(error, { message: 'Failed to create wallet for user', userId });
            throw error;
        }
    }

    /**
     * Create wallet accounts for a wallet (NGN, BTC, ETH)
     */
    async createWalletAccountsForWallet(walletId: string): Promise<IWalletAccount[]> {
        try {
            // Get NGN, BTC, ETH currencies
            const ngnCurrency = await this.currencyRepository.findByCode('NGN');
            const btcCurrency = await this.currencyRepository.findByCode('BTC');
            const ethCurrency = await this.currencyRepository.findByCode('ETH');

            if (!ngnCurrency || !ngnCurrency._id) {
                throw new ServiceError('NGN currency not found. Please seed currencies first.');
            }

            if (!btcCurrency || !btcCurrency._id) {
                throw new ServiceError('BTC currency not found. Please seed currencies first.');
            }

            if (!ethCurrency || !ethCurrency._id) {
                throw new ServiceError('ETH currency not found. Please seed currencies first.');
            }

            const walletAccounts: IWalletAccount[] = [];

            // Create NGN wallet account
            const existingNGNAccount = await this.walletAccountRepository.findByWalletIdAndCurrencyId(
                walletId,
                ngnCurrency._id
            );

            if (!existingNGNAccount) {
                const ngnAccountData: Partial<IWalletAccount> = {
                    wallet_id: walletId,
                    currency_id: ngnCurrency._id,
                    balance: 0,
                    available_balance: 0,
                    locked_balance: 0,
                    status: 'active'
                };

                const ngnAccount = await this.walletAccountRepository.create(ngnAccountData as IWalletAccount);
                walletAccounts.push(ngnAccount);
                Console.info('NGN wallet account created', { walletId, accountId: ngnAccount._id });
            } else {
                walletAccounts.push(existingNGNAccount);
                Console.info('NGN wallet account already exists', { walletId, accountId: existingNGNAccount._id });
            }

            // Create BTC wallet account
            const existingBTCAccount = await this.walletAccountRepository.findByWalletIdAndCurrencyId(
                walletId,
                btcCurrency._id
            );

            if (!existingBTCAccount) {
                const btcAccountData: Partial<IWalletAccount> = {
                    wallet_id: walletId,
                    currency_id: btcCurrency._id,
                    balance: 0,
                    available_balance: 0,
                    locked_balance: 0,
                    user_balance: 0,
                    platform_owned_balance: 0,
                    total_onchain_balance: 0,
                    sweep_threshold: null,
                    address: null, // Bitcoin address will be generated later when needed
                    address_type: null,
                    status: 'active'
                };

                const btcAccount = await this.walletAccountRepository.create(btcAccountData as IWalletAccount);
                walletAccounts.push(btcAccount);
                Console.info('BTC wallet account created', { walletId, accountId: btcAccount._id });
            } else {
                walletAccounts.push(existingBTCAccount);
                Console.info('BTC wallet account already exists', { walletId, accountId: existingBTCAccount._id });
            }

            const existingETHAccount = await this.walletAccountRepository.findByWalletIdAndCurrencyId(
                walletId,
                ethCurrency._id
            );

            if (!existingETHAccount) {
                const ethAccountData: Partial<IWalletAccount> = {
                    wallet_id: walletId,
                    currency_id: ethCurrency._id,
                    balance: 0,
                    available_balance: 0,
                    locked_balance: 0,
                    user_balance: 0,
                    platform_owned_balance: 0,
                    total_onchain_balance: 0,
                    sweep_threshold: null,
                    address: null,
                    address_type: null,
                    status: 'active'
                };

                const ethAccount = await this.walletAccountRepository.create(ethAccountData as IWalletAccount);
                walletAccounts.push(ethAccount);
                Console.info('ETH wallet account created', { walletId, accountId: ethAccount._id });
            } else {
                walletAccounts.push(existingETHAccount);
                Console.info('ETH wallet account already exists', { walletId, accountId: existingETHAccount._id });
            }

            return walletAccounts;
        } catch (error: any) {
            Console.error(error, { message: 'Failed to create wallet accounts', walletId });
            throw error;
        }
    }

    /**
     * Initialize wallet system for a new user
     * Creates wallet and wallet accounts (NGN, BTC, ETH) in one go
     */
    async initializeUserWallet(userId: string): Promise<{
        wallet: IWallet;
        walletAccounts: IWalletAccount[];
    }> {
        try {
            // Create wallet
            const wallet = await this.createWalletForUser(userId);

            // Create wallet accounts
            const walletAccounts = await this.createWalletAccountsForWallet(wallet._id!);

            Console.info('User wallet initialized successfully', {
                userId,
                walletId: wallet._id,
                accountCount: walletAccounts.length
            });

            return {
                wallet,
                walletAccounts
            };
        } catch (error: any) {
            Console.error(error, { message: 'Failed to initialize user wallet', userId });
            throw error;
        }
    }


    private async buildCryptoTradingMetadata(
        account: IWalletAccount,
        currencyCode: string
    ): Promise<IWalletAccountTradingMetadata | undefined> {
        const code = currencyCode.toUpperCase();
        if (code !== 'BTC' && code !== 'ETH') {
            return undefined;
        }

        try {
            const rate = await this.tradingRateService.getActiveRate(code);
            const spot = Number(rate.last_spot_price ?? 0);
            if (!spot || spot <= 0) {
                return undefined;
            }

            const userBalance = Number(
                parseFloat(String(account.user_balance ?? account.balance ?? 0))
            );
            const locked = Number(parseFloat(String(account.locked_balance ?? 0)));
            const tradable = Math.max(0, userBalance - locked);

            return {
                tradable_crypto_amount: tradable,
                crypto_equivalent_tradable_amount: tradable * spot,
                spot_price_ngn: spot,
                buy_rate_ngn: Number(rate.buy_rate),
                sell_rate_ngn: Number(rate.sell_rate)
            };
        } catch (error: any) {
            Console.warn('Could not build wallet account trading metadata', {
                currencyCode: code,
                error: error?.message
            });
            return undefined;
        }
    }

    private async enrichAccount(
        account: IWalletAccount & { currency: ICurrency }
    ): Promise<WalletAccountWithCurrency> {
        const metadata = await this.buildCryptoTradingMetadata(account, account.currency.code);
        return metadata ? { ...account, metadata } : account;
    }

    /**
     * Get user wallet with accounts and currency information
     */
    async getUserWalletWithAccounts(userId: string): Promise<{
        wallet: IWallet;
        accounts: WalletAccountWithCurrency[];
    } | null> {
        try {
            const wallet = await this.walletRepository.findByUserId(userId);
            if (!wallet || !wallet._id) {
                return null;
            }

            const walletAccounts = await this.walletAccountRepository.findByWalletId(wallet._id);

            const accountsWithCurrency = await Promise.all(
                walletAccounts.map(async (account) => {
                    const currency = await this.currencyRepository.findById(account.currency_id);
                    return this.enrichAccount({
                        ...account,
                        currency: currency!
                    });
                })
            );

            return {
                wallet,
                accounts: accountsWithCurrency
            };
        } catch (error: any) {
            Console.error(error, { message: 'Failed to get user wallet with accounts', userId });
            throw error;
        }
    }

    /**
     * Credit user wallet with NGN
     */
    async creditUserWallet(userId: string, amount: number): Promise<{
        wallet: IWallet;
        walletAccount: IWalletAccount;
    }> {
        try {
            // Get user's wallet
            const wallet = await this.walletRepository.findByUserId(userId);
            if (!wallet || !wallet._id) {
                throw new ValidationError('Wallet not found for user');
            }

            // Get NGN currency
            const ngnCurrency = await this.currencyRepository.findByCode('NGN');
            if (!ngnCurrency || !ngnCurrency._id) {
                throw new ServiceError('NGN currency not found');
            }

            // Get or create NGN wallet account
            let walletAccount = await this.walletAccountRepository.findByWalletIdAndCurrencyId(
                wallet._id,
                ngnCurrency._id
            );

            if (!walletAccount) {
                // Create NGN account if it doesn't exist
                const accountData: Partial<IWalletAccount> = {
                    wallet_id: wallet._id,
                    currency_id: ngnCurrency._id,
                    balance: amount,
                    available_balance: amount,
                    locked_balance: 0,
                    status: 'active'
                };
                walletAccount = await this.walletAccountRepository.create(accountData as IWalletAccount);
            } else {
                // Update balance
                const newBalance = Number(walletAccount.balance) + amount;
                const newAvailableBalance = Number(walletAccount.available_balance) + amount;

                const updatedAccount = await this.walletAccountRepository.updateBalance(
                    walletAccount._id!,
                    newBalance,
                    newAvailableBalance,
                    Number(walletAccount.locked_balance)
                );
                
                if (!updatedAccount) {
                    throw new ServiceError('Failed to update wallet account balance');
                }
                
                walletAccount = updatedAccount;
            }

            if (!walletAccount) {
                throw new ServiceError('Failed to get or create wallet account');
            }

            Console.info('Wallet credited successfully', {
                userId,
                walletId: wallet._id,
                amount,
                newBalance: walletAccount.balance
            });

            return {
                wallet,
                walletAccount
            };
        } catch (error: any) {
            Console.error(error, { message: 'Failed to credit user wallet', userId, amount });
            throw error;
        }
    }

    /**
     * Debit user wallet (NGN) - for withdrawals
     */
    async debitUserWallet(userId: string, amount: number): Promise<IWalletAccount> {
        try {
            const wallet = await this.walletRepository.findByUserId(userId);
            if (!wallet || !wallet._id) {
                throw new ValidationError('Wallet not found for user');
            }
            const ngnCurrency = await this.currencyRepository.findByCode('NGN');
            if (!ngnCurrency || !ngnCurrency._id) {
                throw new ServiceError('NGN currency not found');
            }
            const walletAccount = await this.walletAccountRepository.findByWalletIdAndCurrencyId(wallet._id, ngnCurrency._id);
            if (!walletAccount) {
                throw new ValidationError('NGN wallet account not found');
            }
            const availableBalance = parseFloat(String(walletAccount.available_balance ?? 0));
            const currentBalance = parseFloat(String(walletAccount.balance ?? 0));
            const lockedBalance = parseFloat(String(walletAccount.locked_balance ?? 0));
            if (availableBalance < amount) {
                throw new ValidationError(`Insufficient balance. Need ${amount} NGN, have ${availableBalance} NGN`);
            }
            const newBalance = currentBalance - amount;
            const newAvailableBalance = availableBalance - amount;
            const updated = await this.walletAccountRepository.updateBalance(
                walletAccount._id!,
                newBalance,
                newAvailableBalance,
                lockedBalance
            );
            if (!updated) {
                throw new ServiceError('Failed to debit wallet');
            }
            Console.info('Wallet debited', { userId, amount, newBalance: newAvailableBalance });
            return updated;
        } catch (error: any) {
            Console.error(error, { message: 'Failed to debit user wallet', userId, amount });
            throw error;
        }
    }

    /**
     * Generate or get Bitcoin address for user's BTC wallet account
     */
    async generateBitcoinAddress(userId: string): Promise<string> {
        try {
            // Get user's wallet
            const wallet = await this.walletRepository.findByUserId(userId);
            if (!wallet || !wallet._id) {
                throw new ValidationError('Wallet not found for user');
            }

            // Get BTC currency
            const btcCurrency = await this.currencyRepository.findByCode('BTC');
            if (!btcCurrency || !btcCurrency._id) {
                throw new ServiceError('BTC currency not found');
            }

            // Get or create BTC wallet account
            let walletAccount = await this.walletAccountRepository.findByWalletIdAndCurrencyId(
                wallet._id,
                btcCurrency._id
            );

            if (!walletAccount) {
                // Create BTC account if it doesn't exist
                const accountData: Partial<IWalletAccount> = {
                    wallet_id: wallet._id,
                    currency_id: btcCurrency._id,
                    balance: 0,
                    available_balance: 0,
                    locked_balance: 0,
                    status: 'active'
                };
                walletAccount = await this.walletAccountRepository.create(accountData as IWalletAccount);
            }

            if (!walletAccount._id) {
                throw new ServiceError('Failed to get or create wallet account');
            }

            // Generate or get Bitcoin address
            const address = await this.bitcoinWalletService.getOrGenerateAddress(userId, walletAccount._id);
            
            return address;
        } catch (error: any) {
            Console.error(error, { message: 'Failed to generate Bitcoin address', userId });
            throw error;
        }
    }

    /**
     * Generate or get Ethereum address for user's ETH wallet account
     */
    async generateEthereumAddress(userId: string): Promise<string> {
        try {
            const wallet = await this.walletRepository.findByUserId(userId);
            if (!wallet || !wallet._id) {
                throw new ValidationError('Wallet not found for user');
            }

            const ethCurrency = await this.currencyRepository.findByCode('ETH');
            if (!ethCurrency || !ethCurrency._id) {
                throw new ServiceError('ETH currency not found');
            }

            let walletAccount = await this.walletAccountRepository.findByWalletIdAndCurrencyId(
                wallet._id,
                ethCurrency._id
            );

            if (!walletAccount) {
                const accountData: Partial<IWalletAccount> = {
                    wallet_id: wallet._id,
                    currency_id: ethCurrency._id,
                    balance: 0,
                    available_balance: 0,
                    locked_balance: 0,
                    user_balance: 0,
                    platform_owned_balance: 0,
                    total_onchain_balance: 0,
                    sweep_threshold: null,
                    address: null,
                    address_type: null,
                    status: 'active'
                };
                walletAccount = await this.walletAccountRepository.create(accountData as IWalletAccount);
            }

            if (!walletAccount._id) {
                throw new ServiceError('Failed to get or create ETH wallet account');
            }

            return await this.ethereumWalletService.getOrGenerateAddress(userId, walletAccount._id);
        } catch (error: any) {
            Console.error(error, { message: 'Failed to generate Ethereum address', userId });
            throw error;
        }
    }

    /**
     * Create platform wallet (exchange's main wallet), or return existing.
     */
    async ensurePlatformWallet(): Promise<IWallet> {
        const existing = await this.walletRepository.findPlatformWallet();
        if (existing) {
            return existing;
        }

        const walletData: Partial<IWallet> = {
            user_id: null,
            is_platform_wallet: true,
            status: 'active'
        };

        const wallet = await this.walletRepository.create(walletData as IWallet);
        Console.info('Platform wallet created', { walletId: wallet._id });
        return wallet;
    }

    /**
     * Create platform wallet (exchange's main wallet)
     */
    async createPlatformWallet(): Promise<IWallet> {
        try {
            const existingWallet = await this.walletRepository.findPlatformWallet();
            if (existingWallet) {
                throw new ValidationError('Platform wallet already exists');
            }

            const walletData: Partial<IWallet> = {
                user_id: null, // NULL for platform wallet
                is_platform_wallet: true,
                status: 'active'
            };

            const wallet = await this.walletRepository.create(walletData as IWallet);
            Console.info('Platform wallet created', { walletId: wallet._id });
            return wallet;
        } catch (error: any) {
            Console.error(error, { message: 'Failed to create platform wallet' });
            throw error;
        }
    }

    /**
     * Get platform wallet with accounts and currency information
     */
    async getPlatformWalletWithAccounts(): Promise<{
        wallet: IWallet;
        accounts: Array<IWalletAccount & { currency: ICurrency }>;
    } | null> {
        try {
            const wallet = await this.walletRepository.findPlatformWallet();
            if (!wallet || !wallet._id) {
                return null;
            }

            const walletAccounts = await this.walletAccountRepository.findByWalletId(wallet._id);

            const accountsWithCurrency = await Promise.all(
                walletAccounts.map(async (account) => {
                    const currency = await this.currencyRepository.findById(account.currency_id);
                    return {
                        ...account,
                        currency: currency!
                    };
                })
            );

            return {
                wallet,
                accounts: accountsWithCurrency
            };
        } catch (error: any) {
            Console.error(error, { message: 'Failed to get platform wallet with accounts' });
            throw error;
        }
    }

    private async ensurePlatformCurrencyAccount(
        walletId: string,
        currencyCode: 'BTC' | 'ETH'
    ): Promise<IWalletAccount> {
        const currency = await this.currencyRepository.findByCode(currencyCode);
        if (!currency?._id) {
            throw new ServiceError(`${currencyCode} currency not found. Please seed currencies first.`);
        }

        let account = await this.walletAccountRepository.findByWalletIdAndCurrencyId(walletId, currency._id);
        if (account) {
            return account;
        }

        account = await this.walletAccountRepository.create({
            wallet_id: walletId,
            currency_id: currency._id,
            balance: 0,
            available_balance: 0,
            locked_balance: 0,
            user_balance: 0,
            platform_owned_balance: 0,
            total_onchain_balance: 0,
            sweep_threshold: null,
            address: null,
            address_type: null,
            status: 'active'
        } as IWalletAccount);

        Console.info(`Platform ${currencyCode} wallet account created`, {
            walletId,
            accountId: account._id
        });

        return account;
    }

    async ensurePlatformCryptoAddress(cryptoType: 'BTC' | 'ETH'): Promise<{
        crypto_type: 'BTC' | 'ETH';
        address: string;
        already_existed: boolean;
    }> {
        const platformWallet = await this.ensurePlatformWallet();
        if (!platformWallet._id) {
            throw new ServiceError('Platform wallet could not be created');
        }

        const account = await this.ensurePlatformCurrencyAccount(platformWallet._id, cryptoType);

        if (account.address) {
            return {
                crypto_type: cryptoType,
                address: account.address,
                already_existed: true
            };
        }

        if (!account._id) {
            throw new ServiceError(`Platform ${cryptoType} account is missing an id`);
        }

        const address =
            cryptoType === 'BTC'
                ? await this.bitcoinWalletService.getOrGenerateAddress('platform', account._id)
                : await this.ethereumWalletService.getOrGenerateAddress('platform', account._id);

        return {
            crypto_type: cryptoType,
            address,
            already_existed: false
        };
    }

    /**
     * Initialize platform wallet system
     * Creates platform wallet and wallet accounts (NGN, BTC, ETH) with BTC and ETH addresses
     */
    async initializePlatformWallet(): Promise<{
        wallet: IWallet;
        walletAccounts: IWalletAccount[];
    }> {
        try {
            // Create platform wallet
            const wallet = await this.createPlatformWallet();

            // Create wallet accounts (NGN, BTC, ETH)
            const walletAccounts = await this.createWalletAccountsForWallet(wallet._id!);

            // Generate BTC address for platform wallet
            const btcCurrency = await this.currencyRepository.findByCode('BTC');
            if (!btcCurrency || !btcCurrency._id) {
                throw new ServiceError('BTC currency not found');
            }

            const btcAccount = walletAccounts.find(account => account.currency_id === btcCurrency._id);

            if (btcAccount && btcAccount._id) {
                // Generate BTC address using BitcoinWalletService
                // Use 'platform' as special identifier for platform wallet
                const address = await this.bitcoinWalletService.getOrGenerateAddress(
                    'platform', // Special identifier for platform wallet
                    btcAccount._id
                );
                Console.info('Platform wallet BTC address generated', { address });
            }

            const ethCurrency = await this.currencyRepository.findByCode('ETH');
            if (ethCurrency?._id) {
                const ethAccount = walletAccounts.find((a) => a.currency_id === ethCurrency._id);
                if (ethAccount && ethAccount._id) {
                    const ethAddress = await this.ethereumWalletService.getOrGenerateAddress('platform', ethAccount._id);
                    Console.info('Platform wallet ETH address generated', { address: ethAddress });
                }
            }

            Console.info('Platform wallet initialized successfully', {
                walletId: wallet._id,
                accountCount: walletAccounts.length
            });

            return {
                wallet,
                walletAccounts
            };
        } catch (error: any) {
            Console.error(error, { message: 'Failed to initialize platform wallet' });
            throw error;
        }
    }
}

