import { inject, injectable } from 'inversify';
import { IWalletService, WalletAccountWithCurrency } from '../../Core/Application/Interface/Services/IWalletService';
import { IWallet } from '../../Core/Application/Interface/Entities/wallet/IWallet';
import { IWalletAccount } from '../../Core/Application/Interface/Entities/wallet/IWalletAccount';
import { WalletRepository } from '../Repository/SQL/wallet/WalletRepository';
import { WalletAccountRepository } from '../Repository/SQL/wallet/WalletAccountRepository';
import { CurrencyRepository } from '../Repository/SQL/wallet/CurrencyRepository';
import { TYPES } from '../../Core/Types/Constants';
import { ValidationError, ServiceError, TooManyRequestsError } from '../../Core/Application/Error/AppError';
import { Console } from '../Utils/Console';
import { ICurrency } from '@/Core/Application/Interface/Entities/wallet/ICurrency';
import { IBitcoinWalletService } from '../../Core/Application/Interface/Services/IBitcoinWalletService';
import { IEthereumWalletService } from '../../Core/Application/Interface/Services/IEthereumWalletService';
import { ITradingRateService } from '../../Core/Application/Interface/Services/ITradingRateService';
import { IWalletAccountTradingMetadata } from '../../Core/Application/Interface/Entities/wallet/IWalletAccountMetadata';
import { TransactionManager } from '../Repository/SQL/Abstractions/TransactionManager';
import { WalletTransactionRepository } from '../Repository/SQL/wallet/WalletTransactionRepository';
import { UserRepository } from '../Repository/SQL/users/UserRepository';
import { Thresh0ldApiClient } from './custody/thresh0ld/Thresh0ldApiClient';
import { ICustodyDerivationCounterRepository } from '../../Core/Application/Interface/Repositories/ICustodyDerivationCounterRepository';
import { EnvironmentConfig } from '../Config/EnvironmentConfig';
import {
    assertThresh0ldPathIndex,
    formatThresh0ldDerivationPath
} from './custody/thresh0ld/Thresh0ldDerivationPath';
import { resolveNetworkName } from './trading/getNetworkName';
import { IUser } from '../../Core/Application/Interface/Entities/auth-and-user/IUser';
import { Thresh0ldTransfer } from './custody/thresh0ld/Thresh0ldTypes';

const WALLET_SYNC_COOLDOWN_MS = 30_000;
const walletSyncCooldownByUserAsset = new Map<string, number>();

@injectable()
export class WalletService implements IWalletService {
    constructor(
        @inject(TYPES.WalletRepository) private readonly walletRepository: WalletRepository,
        @inject(TYPES.WalletAccountRepository) private readonly walletAccountRepository: WalletAccountRepository,
        @inject(TYPES.CurrencyRepository) private readonly currencyRepository: CurrencyRepository,
        @inject(TYPES.BitcoinWalletService) private readonly bitcoinWalletService: IBitcoinWalletService,
        @inject(TYPES.EthereumWalletService) private readonly ethereumWalletService: IEthereumWalletService,
        @inject(TYPES.TradingRateService) private readonly tradingRateService: ITradingRateService,
        @inject(TYPES.UserRepository) private readonly userRepository: UserRepository,
        @inject(TYPES.WalletTransactionRepository)
        private readonly walletTransactionRepository: WalletTransactionRepository,
        @inject(TYPES.TransactionManager) private readonly transactionManager: TransactionManager,
        @inject(TYPES.Thresh0ldApiClient) private readonly thresh0ldApiClient: Thresh0ldApiClient,
        @inject(TYPES.CustodyDerivationCounterRepository)
        private readonly derivationCounterRepo: ICustodyDerivationCounterRepository
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

    async debitUserWalletByCurrency(
        userId: string,
        currencyCode: string,
        amount: number
    ): Promise<IWalletAccount> {
        try {
            if (!(amount > 0)) {
                throw new ValidationError('Debit amount must be greater than 0');
            }
            const code = currencyCode.trim().toUpperCase();
            const wallet = await this.walletRepository.findByUserId(userId);
            if (!wallet || !wallet._id) {
                throw new ValidationError('Wallet not found for user');
            }
            const currency = await this.currencyRepository.findByCode(code);
            if (!currency || !currency._id) {
                throw new ServiceError(`${code} currency not found`);
            }
            const walletAccount = await this.walletAccountRepository.findByWalletIdAndCurrencyId(
                wallet._id,
                currency._id
            );
            if (!walletAccount) {
                throw new ValidationError(`${code} wallet account not found`);
            }
            const availableBalance = parseFloat(String(walletAccount.available_balance ?? 0));
            const currentBalance = parseFloat(String(walletAccount.balance ?? 0));
            const lockedBalance = parseFloat(String(walletAccount.locked_balance ?? 0));
            if (availableBalance < amount) {
                throw new ValidationError(
                    `Insufficient ${code} balance. Need ${amount}, have ${availableBalance}`
                );
            }
            const updated = await this.walletAccountRepository.updateBalance(
                walletAccount._id!,
                currentBalance - amount,
                availableBalance - amount,
                lockedBalance
            );
            if (!updated) {
                throw new ServiceError(`Failed to debit ${code} wallet`);
            }
            Console.info('Wallet debited by currency', {
                userId,
                currencyCode: code,
                amount,
                newBalance: updated.available_balance
            });
            return updated;
        } catch (error: any) {
            Console.error(error, {
                message: 'Failed to debit user wallet by currency',
                userId,
                currencyCode,
                amount
            });
            throw error;
        }
    }

    async debitUserCryptoBalance(
        userId: string,
        asset: 'BTC' | 'ETH',
        amount: number
    ): Promise<IWalletAccount> {
        if (!(amount > 0)) {
            throw new ValidationError('Debit amount must be greater than 0');
        }
        const updatedUser = await this.userRepository.tryDebitCryptoBalance(userId, asset, amount);
        if (!updatedUser) {
            const user = await this.userRepository.findById(userId);
            const field = asset === 'ETH' ? 'eth_balance' : 'btc_balance';
            const available = Number(user?.[field] ?? 0);
            throw new ValidationError(
                `Insufficient ${asset} balance. Need ${amount}, have ${available}`
            );
        }
        try {
            return await this.debitUserWalletByCurrency(userId, asset, amount);
        } catch (error) {
            await this.userRepository.creditCryptoBalance(userId, asset, amount);
            throw error;
        }
    }

    async creditUserCryptoBalance(
        userId: string,
        asset: 'BTC' | 'ETH',
        amount: number
    ): Promise<IWalletAccount> {
        await this.userRepository.creditCryptoBalance(userId, asset, amount);
        return this.creditUserWalletByCurrency(userId, asset, amount);
    }

    async debitPlatformOwnedForOutbound(asset: 'BTC' | 'ETH', amount: number): Promise<number> {
        if (!(amount > 0)) {
            return 0;
        }
        let remaining = amount;
        const platformWallet = await this.walletRepository.findPlatformWallet();
        if (platformWallet?._id) {
            const currency = await this.currencyRepository.findByCode(asset);
            if (currency?._id) {
                const platformAccount = await this.walletAccountRepository.findByWalletIdAndCurrencyId(
                    platformWallet._id,
                    currency._id
                );
                if (platformAccount?._id) {
                    remaining -= await this.debitPlatformOwnedFromAccount(platformAccount._id, remaining);
                }
            }
        }

        if (remaining > 1e-12) {
            const others =
                asset === 'BTC'
                    ? await this.walletAccountRepository.findBtcAccountsWithPlatformOwnedAbove(0, 500)
                    : await this.walletAccountRepository.findEthAccountsWithPlatformOwnedAbove(0, 500);
            for (const account of others) {
                if (remaining <= 1e-12) {
                    break;
                }
                if (!account._id) {
                    continue;
                }
                remaining -= await this.debitPlatformOwnedFromAccount(account._id, remaining);
            }
        }

        const debited = amount - Math.max(0, remaining);
        if (remaining > 1e-12) {
            Console.warn('Treasury ledger shortfall after outbound payout', {
                asset,
                requested: amount,
                debited,
                shortfall: remaining
            });
        }
        return debited;
    }

    private async debitPlatformOwnedFromAccount(accountId: string, remaining: number): Promise<number> {
        const current = await this.walletAccountRepository.findById(accountId);
        const owned = Number(parseFloat(String(current?.platform_owned_balance ?? 0)));
        if (!(owned > 0) || !(remaining > 0)) {
            return 0;
        }
        const debit = Math.min(owned, remaining);
        const updated = await this.walletAccountRepository.tryDebitPlatformOwned(accountId, debit);
        return updated ? debit : 0;
    }

    async creditUserWalletByCurrency(
        userId: string,
        currencyCode: string,
        amount: number
    ): Promise<IWalletAccount> {
        try {
            if (!(amount > 0)) {
                throw new ValidationError('Credit amount must be greater than 0');
            }
            const code = currencyCode.trim().toUpperCase();
            const wallet = await this.walletRepository.findByUserId(userId);
            if (!wallet || !wallet._id) {
                throw new ValidationError('Wallet not found for user');
            }
            const currency = await this.currencyRepository.findByCode(code);
            if (!currency || !currency._id) {
                throw new ServiceError(`${code} currency not found`);
            }
            let walletAccount = await this.walletAccountRepository.findByWalletIdAndCurrencyId(
                wallet._id,
                currency._id
            );
            if (!walletAccount) {
                walletAccount = await this.walletAccountRepository.create({
                    wallet_id: wallet._id,
                    currency_id: currency._id,
                    balance: amount,
                    available_balance: amount,
                    locked_balance: 0,
                    status: 'active'
                } as IWalletAccount);
                return walletAccount;
            }
            const updated = await this.walletAccountRepository.updateBalance(
                walletAccount._id!,
                parseFloat(String(walletAccount.balance ?? 0)) + amount,
                parseFloat(String(walletAccount.available_balance ?? 0)) + amount,
                parseFloat(String(walletAccount.locked_balance ?? 0))
            );
            if (!updated) {
                throw new ServiceError(`Failed to credit ${code} wallet`);
            }
            Console.info('Wallet credited by currency', {
                userId,
                currencyCode: code,
                amount,
                newBalance: updated.available_balance
            });
            return updated;
        } catch (error: any) {
            Console.error(error, {
                message: 'Failed to credit user wallet by currency',
                userId,
                currencyCode,
                amount
            });
            throw error;
        }
    }

    async generateBitcoinAddress(userId: string): Promise<string> {
        const result = await this.getOrCreateUserDepositAddress(userId, 'BTC');
        return result.address;
    }

    async generateEthereumAddress(userId: string): Promise<string> {
        const result = await this.getOrCreateUserDepositAddress(userId, 'ETH');
        return result.address;
    }

    async getOrCreateUserDepositAddress(
        userId: string,
        cryptoType: string
    ): Promise<{
        crypto_type: 'BTC' | 'ETH';
        address: string;
        derivation_path: string | null;
        network: string;
        already_existed: boolean;
    }> {
        const asset = this.assertCryptoType(cryptoType);
        const network = resolveNetworkName(asset);
        const user = await this.userRepository.findById(userId);
        if (!user) {
            throw new ValidationError('User not found');
        }

        const existingAddress =
            asset === 'BTC' ? user.btc_deposit_address : user.eth_deposit_address;
        const existingPath =
            asset === 'BTC' ? user.btc_derivation_path : user.eth_derivation_path;

        if (existingAddress && String(existingAddress).trim()) {
            await this.syncWalletAccountAddress(
                userId,
                asset,
                String(existingAddress).trim(),
                existingPath ?? null
            );
            return {
                crypto_type: asset,
                address: String(existingAddress).trim(),
                derivation_path: existingPath ?? null,
                network,
                already_existed: true
            };
        }

        const generated = await this.generateCustodialAddress(userId, asset);
        await this.persistUserDepositAddress(userId, asset, generated.address, generated.derivationPath);
        await this.syncWalletAccountAddress(userId, asset, generated.address, generated.derivationPath);

        Console.info('Created permanent user deposit address', {
            userId,
            asset,
            address: generated.address,
            derivation_path: generated.derivationPath,
            network
        });

        return {
            crypto_type: asset,
            address: generated.address,
            derivation_path: generated.derivationPath,
            network,
            already_existed: false
        };
    }

    async handleIncomingWalletDeposit(params: {
        address: string;
        txHash: string;
        amountCrypto: number;
        asset: 'BTC' | 'ETH';
        source?: string;
    }): Promise<{ credited: boolean; userId?: string; alreadyProcessed?: boolean }> {
        const user = await this.userRepository.findByCryptoDepositAddress(params.address, params.asset);
        if (!user?._id) {
            return { credited: false };
        }

        const ledgerSource = params.source || 'thresh0ld_webhook';

        await this.transactionManager.beginTransaction();
        try {
            const existingTx = await this.walletTransactionRepository.lockByIncomingTxHash(params.txHash);
            if (existingTx && String(existingTx.status || '').toUpperCase() === 'COMPLETED') {
                await this.transactionManager.rollback();
                Console.info('Wallet deposit already processed', {
                    userId: user._id,
                    txHash: params.txHash
                });
                return { credited: false, userId: user._id, alreadyProcessed: true };
            }

            const lockedUser = await this.userRepository.lockById(user._id);
            if (!lockedUser?._id) {
                await this.transactionManager.rollback();
                return { credited: false };
            }

            await this.userRepository.incrementCryptoBalance(lockedUser._id, params.asset, params.amountCrypto);
            const walletAccount = await this.creditCryptoDeposit(lockedUser._id, params.asset, params.amountCrypto);

            const now = new Date().toISOString();
            const existingMeta =
                existingTx?.metadata &&
                typeof existingTx.metadata === 'object' &&
                !Array.isArray(existingTx.metadata)
                    ? existingTx.metadata
                    : {};
            const metadata = {
                ...existingMeta,
                source: ledgerSource
            };

            if (existingTx?._id) {
                await this.walletTransactionRepository.update(existingTx._id, {
                    status: 'COMPLETED',
                    amount: params.amountCrypto,
                    wallet_account_id: walletAccount._id ?? existingTx.wallet_account_id,
                    address: params.address,
                    network: resolveNetworkName(params.asset),
                    metadata
                });
            } else {
                await this.walletTransactionRepository.create({
                    user_id: lockedUser._id,
                    wallet_account_id: walletAccount._id ?? null,
                    crypto_type: params.asset,
                    type: 'DEPOSIT',
                    status: 'COMPLETED',
                    amount: params.amountCrypto,
                    incoming_tx_hash: params.txHash,
                    address: params.address,
                    network: resolveNetworkName(params.asset),
                    metadata,
                    created_at: now,
                    updated_at: now
                });
            }

            await this.transactionManager.commit();

            Console.info('Credited user wallet from Thresh0ld deposit', {
                userId: lockedUser._id,
                asset: params.asset,
                amount: params.amountCrypto,
                txHash: params.txHash
            });

            return { credited: true, userId: lockedUser._id };
        } catch (error: any) {
            try {
                if (this.transactionManager.isActive()) {
                    await this.transactionManager.rollback();
                }
            } catch (rollbackError: any) {
                Console.error(rollbackError, { message: 'Failed to rollback wallet deposit transaction' });
            }

            if (this.isUniqueViolation(error)) {
                Console.info('Wallet deposit unique constraint hit (concurrent webhook)', {
                    txHash: params.txHash,
                    userId: user._id
                });
                return { credited: false, userId: user._id, alreadyProcessed: true };
            }
            throw error;
        }
    }

    async syncUserWallet(
        userId: string,
        asset: 'BTC' | 'ETH'
    ): Promise<{
        asset: 'BTC' | 'ETH';
        deposit_address: string;
        btc_balance: number;
        eth_balance: number;
        synced_tx_hashes: string[];
    }> {
        const crypto = this.assertCryptoType(asset);
        this.assertWalletSyncCooldown(userId, crypto);

        if (!this.isThresh0ldCustody()) {
            throw new ServiceError('Manual wallet sync requires CUSTODY_PROVIDER=thresh0ld');
        }

        const deposit = await this.getOrCreateUserDepositAddress(userId, crypto);
        const transfers = await this.thresh0ldApiClient.getTransferList(crypto.toLowerCase());
        const syncedTxHashes: string[] = [];
        const seen = new Set<string>();

        for (const transfer of transfers) {
            const txHash = String(transfer.txHash || '').trim();
            if (!txHash || seen.has(txHash.toLowerCase())) {
                continue;
            }
            seen.add(txHash.toLowerCase());

            if (!this.isIncomingDepositToAddress(transfer, deposit.address)) {
                continue;
            }
            if (!this.isThresh0ldTransferConfirmed(transfer, crypto)) {
                continue;
            }

            const amountCrypto = this.normalizeDepositAmount(transfer.amount, crypto);
            if (!(amountCrypto > 0)) {
                continue;
            }

            const existing = await this.walletTransactionRepository.findByIncomingTxHash(txHash);
            if (existing && String(existing.status || '').toUpperCase() === 'COMPLETED') {
                continue;
            }

            const result = await this.handleIncomingWalletDeposit({
                address: deposit.address,
                txHash,
                amountCrypto,
                asset: crypto,
                source: 'thresh0ld_manual_sync'
            });

            if (result.credited) {
                syncedTxHashes.push(txHash);
            }
        }

        const user = await this.userRepository.findById(userId);
        return {
            asset: crypto,
            deposit_address: deposit.address,
            btc_balance: Number(user?.btc_balance ?? 0),
            eth_balance: Number(user?.eth_balance ?? 0),
            synced_tx_hashes: syncedTxHashes
        };
    }

    private assertWalletSyncCooldown(userId: string, asset: 'BTC' | 'ETH'): void {
        const key = `${userId}:${asset}`;
        const now = Date.now();
        const last = walletSyncCooldownByUserAsset.get(key) ?? 0;
        if (now - last < WALLET_SYNC_COOLDOWN_MS) {
            throw new TooManyRequestsError(
                'Wallet sync is limited to once every 30 seconds per asset. Please try again shortly.'
            );
        }
        walletSyncCooldownByUserAsset.set(key, now);
    }

    private isIncomingDepositToAddress(transfer: Thresh0ldTransfer, depositAddress: string): boolean {
        const type = transfer.type.toLowerCase();
        if (type.includes('send') || type.includes('outgoing') || type.includes('withdraw')) {
            return false;
        }

        const expected = depositAddress.trim().toLowerCase();
        const toAddress = (transfer.toAddress || '').trim().toLowerCase();
        if (!toAddress || toAddress !== expected) {
            return false;
        }

        return true;
    }

    private isThresh0ldTransferConfirmed(transfer: Thresh0ldTransfer, asset: 'BTC' | 'ETH'): boolean {
        const status = transfer.status.trim().toUpperCase();
        if (
            status === 'CONFIRMED' ||
            status === 'SUCCESS' ||
            status === 'COMPLETED' ||
            status === 'FINALIZED'
        ) {
            return true;
        }
        if (
            status === 'PENDING' ||
            status === 'UNCONFIRMED' ||
            status === 'MEMPOOL' ||
            status === 'PENDING_CONFIRMATION'
        ) {
            return false;
        }

        if (transfer.confirmations == null) {
            return false;
        }
        const minRequired =
            asset === 'BTC'
                ? Number(EnvironmentConfig.get('THRESH0LD_BTC_MIN_CONFIRMATIONS', '2'))
                : Number(EnvironmentConfig.get('THRESH0LD_ETH_MIN_CONFIRMATIONS', '1'));
        const floor = Number.isFinite(minRequired) ? minRequired : asset === 'BTC' ? 2 : 1;
        return transfer.confirmations >= floor;
    }

    private normalizeDepositAmount(amount: number, asset: 'BTC' | 'ETH'): number {
        if (!Number.isFinite(amount) || amount <= 0) {
            return 0;
        }
        if (asset === 'BTC' && amount >= 1000) {
            return amount / 100_000_000;
        }
        if (asset === 'ETH' && amount >= 1e9) {
            return amount / 1e18;
        }
        return amount;
    }

    private isUniqueViolation(error: unknown): boolean {
        const err = error as { name?: string; code?: string; message?: string };
        const message = String(err?.message || '');
        return (
            err?.name === 'DatabaseConstraintError' ||
            err?.code === '23505' ||
            message.includes('23505') ||
            /unique constraint|duplicate key/i.test(message)
        );
    }

    private assertCryptoType(cryptoType: string): 'BTC' | 'ETH' {
        const asset = String(cryptoType || '').trim().toUpperCase();
        if (asset !== 'BTC' && asset !== 'ETH') {
            throw new ValidationError('cryptoType must be BTC or ETH');
        }
        return asset;
    }

    private isThresh0ldCustody(): boolean {
        const mode = EnvironmentConfig.get('TRANSACTION_MODE', 'automated').toLowerCase().trim();
        const provider = EnvironmentConfig.get('CUSTODY_PROVIDER', 'inhouse').toLowerCase().trim();
        return mode !== 'manual' && provider === 'thresh0ld';
    }

    private async generateCustodialAddress(
        userId: string,
        asset: 'BTC' | 'ETH'
    ): Promise<{ address: string; derivationPath: string | null }> {
        if (this.isThresh0ldCustody()) {
            const pathIndex = await this.derivationCounterRepo.allocateNextIndex(asset);
            assertThresh0ldPathIndex(pathIndex);
            const derivationPath = formatThresh0ldDerivationPath(pathIndex);
            const generated = await this.thresh0ldApiClient.generateAddress(pathIndex, asset.toLowerCase());
            return { address: generated.address, derivationPath };
        }

        const walletAccount = await this.ensureCryptoWalletAccount(userId, asset);
        if (asset === 'BTC') {
            const address = await this.bitcoinWalletService.getOrGenerateAddress(userId, walletAccount._id!);
            return { address, derivationPath: walletAccount.derivation_path ?? null };
        }
        const address = await this.ethereumWalletService.getOrGenerateAddress(userId, walletAccount._id!);
        return { address, derivationPath: walletAccount.derivation_path ?? null };
    }

    private async persistUserDepositAddress(
        userId: string,
        asset: 'BTC' | 'ETH',
        address: string,
        derivationPath: string | null
    ): Promise<void> {
        const patch: Partial<IUser> =
            asset === 'BTC'
                ? { btc_deposit_address: address, btc_derivation_path: derivationPath }
                : { eth_deposit_address: address, eth_derivation_path: derivationPath };
        await this.userRepository.update(userId, patch);
    }

    private async ensureCryptoWalletAccount(userId: string, asset: 'BTC' | 'ETH'): Promise<IWalletAccount> {
        let wallet = await this.walletRepository.findByUserId(userId);
        if (!wallet?._id) {
            const initialized = await this.initializeUserWallet(userId);
            wallet = initialized.wallet;
        }
        const currency = await this.currencyRepository.findByCode(asset);
        if (!currency?._id) {
            throw new ServiceError(`${asset} currency not found`);
        }
        let account = await this.walletAccountRepository.findByWalletIdAndCurrencyId(wallet._id!, currency._id);
        if (!account) {
            account = await this.walletAccountRepository.create({
                wallet_id: wallet._id!,
                currency_id: currency._id,
                balance: 0,
                available_balance: 0,
                locked_balance: 0,
                user_balance: 0,
                platform_owned_balance: 0,
                total_onchain_balance: 0,
                address: null,
                derivation_path: null,
                status: 'active'
            } as IWalletAccount);
        }
        if (!account._id) {
            throw new ServiceError(`Failed to get ${asset} wallet account`);
        }
        return account;
    }

    private async syncWalletAccountAddress(
        userId: string,
        asset: 'BTC' | 'ETH',
        address: string,
        derivationPath: string | null
    ): Promise<void> {
        const account = await this.ensureCryptoWalletAccount(userId, asset);
        if (account.address === address && account.derivation_path === derivationPath) {
            return;
        }
        await this.walletAccountRepository.update(account._id!, {
            address,
            derivation_path: derivationPath,
            address_type: asset === 'BTC' ? 'p2wpkh' : 'eth'
        });
    }

    private async creditCryptoDeposit(
        userId: string,
        asset: 'BTC' | 'ETH',
        amount: number
    ): Promise<IWalletAccount> {
        const account = await this.ensureCryptoWalletAccount(userId, asset);
        await this.walletAccountRepository.lockById(account._id!);
        const updated = await this.walletAccountRepository.incrementCryptoDeposit(account._id!, amount);
        if (!updated) {
            throw new ServiceError(`Failed to credit ${asset} deposit`);
        }
        return updated;
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

