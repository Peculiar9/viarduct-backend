import { inject, injectable } from 'inversify';
import { TYPES } from '../../../Core/Types/Constants';
import { ITradingOrderService } from '../../../Core/Application/Interface/Services/ITradingOrderService';
import { ITradingOrder, TradingOrderType, TradingOrderStatus } from '../../../Core/Application/Interface/Entities/trading/ITradingOrder';
import { ITradingOrderRepository } from '../../../Core/Application/Interface/Repositories/ITradingOrderRepository';
import { ITradingRateService } from '../../../Core/Application/Interface/Services/ITradingRateService';
import { IWalletService } from '../../../Core/Application/Interface/Services/IWalletService';
import { IBitcoinTransactionService } from '../../../Core/Application/Interface/Services/IBitcoinTransactionService';
import { IUTXOManagerService } from '../../../Core/Application/Interface/Services/IUTXOManagerService';
import { IBlockchainService } from '../../../Core/Application/Interface/Services/IBlockchainService';
import { IEthereumBlockchainService } from '../../../Core/Application/Interface/Services/IEthereumBlockchainService';
import { DIContainer } from '../../../Core/DIContainer';
import { WalletAccountRepository } from '../../Repository/SQL/wallet/WalletAccountRepository';
import { WalletRepository } from '../../Repository/SQL/wallet/WalletRepository';
import { CurrencyRepository } from '../../Repository/SQL/wallet/CurrencyRepository';
import { UserRepository } from '../../Repository/SQL/users/UserRepository';
import { TransactionManager } from '../../Repository/SQL/Abstractions/TransactionManager';
import { Console } from '../../Utils/Console';
import { ServiceError, ValidationError } from '../../../Core/Application/Error/AppError';
import { INotificationService } from '../../../Core/Application/Interface/Services/INotificationService';
import { NotificationType } from '../../../Core/Application/Enums/NotificationType';
import { IWithdrawalService } from '../../../Core/Application/Interface/Services/IWithdrawalService';
import { IUTXORepository } from '../../../Core/Application/Interface/Repositories/IUTXORepository';

@injectable() 
export class TradingOrderService implements ITradingOrderService {
    constructor(
        @inject(TYPES.TradingOrderRepository) private readonly tradingOrderRepo: ITradingOrderRepository,
        @inject(TYPES.TradingRateService) private readonly tradingRateService: ITradingRateService,
        @inject(TYPES.WalletService) private readonly walletService: IWalletService,
        @inject(TYPES.BitcoinTransactionService) private readonly bitcoinTransactionService: IBitcoinTransactionService,
        @inject(TYPES.UTXOManagerService) private readonly utxoManagerService: IUTXOManagerService,
        @inject(TYPES.UTXORepository) private readonly utxoRepo: IUTXORepository,
        @inject(TYPES.BlockchainService) private readonly blockchainService: IBlockchainService,
        @inject(TYPES.EthereumBlockchainService) private readonly ethereumBlockchainService: IEthereumBlockchainService,
        @inject(TYPES.WalletAccountRepository) private readonly walletAccountRepo: WalletAccountRepository,
        @inject(TYPES.WalletRepository) private readonly walletRepo: WalletRepository,
        @inject(TYPES.CurrencyRepository) private readonly currencyRepo: CurrencyRepository,
        @inject(TYPES.UserRepository) private readonly userRepo: UserRepository,
        @inject(TYPES.TransactionManager) private readonly transactionManager: TransactionManager,
        @inject(TYPES.NotificationService) private readonly notificationService: INotificationService,
        @inject(TYPES.WithdrawalService) private readonly withdrawalService: IWithdrawalService
    ) {}

    private normalizeCustodialAsset(cryptoType: string): 'BTC' | 'ETH' {
        const t = (cryptoType || '').toUpperCase().trim();
        if (t !== 'BTC' && t !== 'ETH') {
            throw new ValidationError('Unsupported crypto_type. Supported: BTC, ETH');
        }
        return t;
    }

    async createBuyOrder(userId: string, data: {
        crypto_type: string;
        crypto_amount: number;
        crypto_purchase_amount?: number;
        transaction_pin: string;
    }): Promise<ITradingOrder> {
        try {
            // 0. Check if user has completed KYC (required for trading orders)
            const user = await this.userRepo.findById(userId);
            if (!user) {
                throw new ValidationError('User not found');
            }
            if (!user.has_completed_kyc) {
                throw new ValidationError('KYC verification is required to create trading orders. Please complete your KYC verification first.');
            }
            if (!user.has_set_transaction_pin) {
                throw new ValidationError('Transaction PIN not set. Please set your PIN first.');
            }

            const pinValid = await this.withdrawalService.verifyTransactionPin(userId, data.transaction_pin);
            if (!pinValid) {
                throw new ValidationError('Invalid transaction PIN');
            }

         // 1. Get active trading rate
         const cryptoType = data.crypto_type.toUpperCase();
         const asset = this.normalizeCustodialAsset(cryptoType);
         const rate = await this.tradingRateService.getActiveRate(cryptoType);
         const hasCryptoAmount = data.crypto_amount !== undefined && data.crypto_amount !== null;
         const hasCryptoPurchaseAmount = data.crypto_purchase_amount !== undefined && data.crypto_purchase_amount !== null;
         if (!hasCryptoAmount && !hasCryptoPurchaseAmount) {
             throw new ValidationError('Either crypto_amount or crypto_purchase_amount is required');
         }
         if (hasCryptoAmount && hasCryptoPurchaseAmount) {
             throw new ValidationError('Provide only one of crypto_amount or crypto_purchase_amount, not both');
         }
         let cryptoAmount: number;
         let fiatAmount: number;
         if (hasCryptoAmount) {
             // User specified BTC directly
             cryptoAmount = Number(data.crypto_amount);
             // Use existing helper to compute NGN needed
             fiatAmount = await this.tradingRateService.calculateBuyAmount(
                 cryptoType,
                 cryptoAmount
             );
         } else {
             // User specified how much NGN they want to spend
             fiatAmount = Number(data.crypto_purchase_amount);
             // Invert the rate: fiat = crypto * sell_rate  =>  crypto = fiat / sell_rate
             cryptoAmount = fiatAmount / rate.sell_rate;
         }

            // 3. Custodial (hybrid) model: settle internally in DB (no on-chain broadcast)
            // Get user's wallet and NGN account
            const wallet = await this.walletRepo.findByUserId(userId);
            if (!wallet || !wallet._id) {
                throw new ValidationError('Wallet not found for user');
            }

            const ngnCurrency = await this.currencyRepo.findByCode('NGN');
            if (!ngnCurrency || !ngnCurrency._id) {
                throw new ServiceError('NGN currency not found');
            }

            const userNgnAccount = await this.walletAccountRepo.findByWalletIdAndCurrencyId(
                wallet._id,
                ngnCurrency._id
            );

            if (!userNgnAccount) {
                throw new ValidationError('NGN wallet account not found');
            }

            // 4. Get platform wallet + accounts
            const platformWallet = await this.walletRepo.findPlatformWallet();
            if (!platformWallet || !platformWallet._id) {
                throw new ServiceError('Platform wallet not found');
            }

            const cryptoCurrency = await this.currencyRepo.findByCode(asset);
            if (!cryptoCurrency || !cryptoCurrency._id) {
                throw new ServiceError(`${asset} currency not found`);
            }

            const platformNgnAccount = await this.walletAccountRepo.findByWalletIdAndCurrencyId(
                platformWallet._id,
                ngnCurrency._id
            );
            const platformCryptoAccount = await this.walletAccountRepo.findByWalletIdAndCurrencyId(
                platformWallet._id,
                cryptoCurrency._id
            );

            if (!platformNgnAccount || !platformNgnAccount._id) {
                throw new ServiceError('Platform NGN account not found');
            }
            if (!platformCryptoAccount || !platformCryptoAccount._id) {
                throw new ServiceError(`Platform ${asset} account not found`);
            }

            // 5. Get user's crypto account
            const userCryptoAccount = await this.walletAccountRepo.findByWalletIdAndCurrencyId(
                wallet._id,
                cryptoCurrency._id
            );

            if (!userCryptoAccount || !userCryptoAccount._id) {
                throw new ValidationError(`User ${asset} wallet account not found`);
            }

            // 6. Validate balances (instant internal settlement)
            const userNgnAvailable = Number(parseFloat(userNgnAccount.available_balance?.toString() || '0'));
            if (userNgnAvailable < fiatAmount) {
                throw new ValidationError(`Insufficient balance. Need ${fiatAmount} NGN, have ${userNgnAvailable} NGN`);
            }

            const platformCryptoAvailable = Number(parseFloat(platformCryptoAccount.available_balance?.toString() || '0'));
            if (platformCryptoAvailable < cryptoAmount) {
                throw new ServiceError(
                    `Platform has insufficient ${asset} liquidity. Need ${cryptoAmount} ${asset}, have ${platformCryptoAvailable} ${asset}`
                );
            }

            // 7. Atomic DB settlement (no blockchain interaction)
            let transactionStarted = false;
            try {
                await this.transactionManager.beginTransaction();
                transactionStarted = true;

                const nowIso = new Date().toISOString();

                // 7a. Create order as completed immediately
                const order = await this.tradingOrderRepo.create({
                    user_id: userId,
                    type: 'buy',
                    crypto_type: data.crypto_type.toUpperCase(),
                    crypto_amount: cryptoAmount,
                    fiat_amount: fiatAmount,
                    rate_used: rate.sell_rate,
                    settlement_mode: 'internal',
                    status: 'completed',
                    wallet_account_id: userCryptoAccount._id,
                    network_fee: 0,
                    completed_at: nowIso,
                    created_at: nowIso,
                    updated_at: nowIso
                });

                // 7b. Debit user NGN; credit platform NGN
                const userNgnBalance = Number(parseFloat(userNgnAccount.balance?.toString() || '0'));
                const userNgnLocked = Number(parseFloat(userNgnAccount.locked_balance?.toString() || '0'));
                await this.walletAccountRepo.updateBalance(
                    userNgnAccount._id!,
                    Number(userNgnBalance - fiatAmount),
                    Number(userNgnAvailable - fiatAmount),
                    Number(userNgnLocked)
                );

                const platformNgnBalance = Number(parseFloat(platformNgnAccount.balance?.toString() || '0'));
                const platformNgnAvailable = Number(parseFloat(platformNgnAccount.available_balance?.toString() || '0'));
                const platformNgnLocked = Number(parseFloat(platformNgnAccount.locked_balance?.toString() || '0'));
                await this.walletAccountRepo.updateBalance(
                    platformNgnAccount._id!,
                    Number(platformNgnBalance + fiatAmount),
                    Number(platformNgnAvailable + fiatAmount),
                    Number(platformNgnLocked)
                );

                // 7c. Credit user crypto; debit platform crypto (liquidity tracking)
                // Custodial ledger:
                // - user_balance increases (user can sell/withdraw)
                // - total_onchain_balance is treated as backing assigned to this user (can be swept later)
                // - platform wallet decreases accordingly
                const userLocked = Number(parseFloat(userCryptoAccount.locked_balance?.toString() || '0'));
                const currentUserBalance = Number(parseFloat((userCryptoAccount.user_balance ?? userCryptoAccount.balance ?? 0).toString()));
                const currentUserPlatformOwned = Number(parseFloat((userCryptoAccount.platform_owned_balance ?? 0).toString()));
                const currentUserTotalOnchain = Number(parseFloat((userCryptoAccount.total_onchain_balance ?? 0).toString()));

                const newUserBalance = currentUserBalance + cryptoAmount;
                const newUserTotalOnchain = currentUserTotalOnchain + cryptoAmount;
                const newUserAvailable = Math.max(0, newUserBalance - userLocked);

                await this.walletAccountRepo.update(userCryptoAccount._id!, {
                    user_balance: newUserBalance,
                    platform_owned_balance: currentUserPlatformOwned,
                    total_onchain_balance: newUserTotalOnchain,
                    balance: newUserBalance,
                    available_balance: newUserAvailable
                });

                const platformLocked = Number(parseFloat(platformCryptoAccount.locked_balance?.toString() || '0'));
                const platformBalance = Number(parseFloat(platformCryptoAccount.balance?.toString() || '0'));
                const platformAvailable = Number(parseFloat(platformCryptoAccount.available_balance?.toString() || '0'));
                const platformPlatformOwned = Number(parseFloat((platformCryptoAccount.platform_owned_balance ?? 0).toString()));
                const platformTotalOnchain = Number(parseFloat((platformCryptoAccount.total_onchain_balance ?? 0).toString()));

                await this.walletAccountRepo.update(platformCryptoAccount._id!, {
                    // Platform wallet is corporate inventory; treat balance/available as spendable inventory.
                    balance: platformBalance - cryptoAmount,
                    available_balance: platformAvailable - cryptoAmount,
                    locked_balance: platformLocked,
                    platform_owned_balance: platformPlatformOwned,
                    total_onchain_balance: platformTotalOnchain - cryptoAmount
                });

                await this.transactionManager.commit();
                transactionStarted = false;

                // Notification (non-blocking)
                try {
                    await this.notificationService.create({
                        user_id: userId,
                        type: NotificationType.ORDER,
                        title: 'Order completed',
                        content: `Your ${cryptoType} buy order has been completed instantly.`,
                        url: `/orders/${order._id}`
                    });
                } catch {
                    // ignore notification errors
                }

                Console.info('Custodial buy order settled instantly', {
                    orderId: order._id,
                    userId,
                    cryptoAmount,
                    fiatAmount,
                    rate: rate.sell_rate
                });

                return order;
            } catch (error: any) {
                if (transactionStarted) {
                    try {
                        await this.transactionManager.rollback();
                    } catch (rollbackError: any) {
                        Console.error(rollbackError, { message: 'Failed to rollback custodial buy settlement', userId });
                    }
                }
                throw error;
            }
        } catch (error: any) {
            Console.error(error, { message: 'Failed to create buy order', userId, data });
            throw error;
        }
    }

    async createSellOrder(userId: string, data: {
        crypto_type: string;
        crypto_amount: number;
        crypto_purchase_amount?: number;
        transaction_pin: string;
    }): Promise<ITradingOrder> {
        try {
            // 0. Check if user has completed KYC (required for trading orders)
            const user = await this.userRepo.findById(userId);
            if (!user) {
                throw new ValidationError('User not found');
            }
            if (!user.has_completed_kyc) {
                throw new ValidationError('KYC verification is required to create trading orders. Please complete your KYC verification first.');
            }
            if (!user.has_set_transaction_pin) {
                throw new ValidationError('Transaction PIN not set. Please set your PIN first.');
            }

            const pinValid = await this.withdrawalService.verifyTransactionPin(userId, data.transaction_pin);
            if (!pinValid) {
                throw new ValidationError('Invalid transaction PIN');
            }

            const cryptoType = data.crypto_type.toUpperCase();
            const asset = this.normalizeCustodialAsset(cryptoType);
            const rate = await this.tradingRateService.getActiveRate(cryptoType);
            // === NEW: normalize input ===
            const hasCryptoAmount = data.crypto_amount !== undefined && data.crypto_amount !== null;
            const hasCryptoPurchaseAmount = data.crypto_purchase_amount !== undefined && data.crypto_purchase_amount !== null;
            if (!hasCryptoAmount && !hasCryptoPurchaseAmount) {
                throw new ValidationError('Either crypto_amount or crypto_purchase_amount is required');
            }
            if (hasCryptoAmount && hasCryptoPurchaseAmount) {
                throw new ValidationError('Provide only one of crypto_amount or crypto_purchase_amount, not both');
            }
            let cryptoAmount: number;
            let fiatAmount: number;
            if (hasCryptoAmount) {
                // User specified BTC they want to sell
                cryptoAmount = Number(data.crypto_amount);
                // Existing helper: how much NGN they receive
                fiatAmount = await this.tradingRateService.calculateSellAmount(
                    cryptoType,
                    cryptoAmount
                );
            } else {
                // User specified NGN they want to receive
                fiatAmount = Number(data.crypto_purchase_amount);
                // For sell: fiat = crypto * buy_rate  =>  crypto = fiat / buy_rate
                cryptoAmount = fiatAmount / rate.buy_rate;
            }

            // 3. Get user's wallet and crypto account
            const wallet = await this.walletRepo.findByUserId(userId);
            if (!wallet || !wallet._id) {
                throw new ValidationError('Wallet not found for user');
            }

            const cryptoCurrency = await this.currencyRepo.findByCode(asset);
            if (!cryptoCurrency || !cryptoCurrency._id) {
                throw new ServiceError(`${asset} currency not found`);
            }

            const userCryptoAccount = await this.walletAccountRepo.findByWalletIdAndCurrencyId(
                wallet._id,
                cryptoCurrency._id
            );

            if (!userCryptoAccount || !userCryptoAccount._id) {
                throw new ValidationError(`User ${asset} wallet account not found`);
            }

            // 4. Custodial (hybrid) model: settle internally in DB (no on-chain broadcast)
            const userLocked = Number(parseFloat(userCryptoAccount.locked_balance?.toString() || '0'));
            const userBalance = Number(parseFloat((userCryptoAccount.user_balance ?? userCryptoAccount.balance ?? 0).toString()));
            const userSpendable = Math.max(0, userBalance - userLocked);
            if (userSpendable < cryptoAmount) {
                throw new ValidationError(
                    `Insufficient balance. Need ${cryptoAmount} ${asset}, have ${userSpendable} ${asset}`
                );
            }

            // 5. Get platform wallet and check if platform has enough NGN
            const platformWallet = await this.walletRepo.findPlatformWallet();
            if (!platformWallet || !platformWallet._id) {
                throw new ServiceError('Platform wallet not found');
            }

            const ngnCurrency = await this.currencyRepo.findByCode('NGN');
            if (!ngnCurrency || !ngnCurrency._id) {
                throw new ServiceError('NGN currency not found');
            }

            const platformNgnAccount = await this.walletAccountRepo.findByWalletIdAndCurrencyId(
                platformWallet._id,
                ngnCurrency._id
            );

            if (!platformNgnAccount) {
                throw new ServiceError('Platform NGN account not found');
            }

            const platformNgnBalance = parseFloat(platformNgnAccount.available_balance?.toString() || '0');
            if (platformNgnBalance < fiatAmount) {
                throw new ServiceError(`Platform has insufficient NGN. Need ${fiatAmount} NGN, have ${platformNgnBalance} NGN`);
            }

            // 5b. Get user's NGN account (needed for instant settlement)
            const userNgnAccount = await this.walletAccountRepo.findByWalletIdAndCurrencyId(
                wallet._id,
                ngnCurrency._id
            );
            if (!userNgnAccount || !userNgnAccount._id) {
                throw new ValidationError('NGN wallet account not found');
            }

            // 6. Get platform crypto account
            const platformCryptoAccount = await this.walletAccountRepo.findByWalletIdAndCurrencyId(
                platformWallet._id,
                cryptoCurrency._id
            );

            if (!platformCryptoAccount || !platformCryptoAccount._id) {
                throw new ServiceError(`Platform ${asset} account not found`);
            }

            // 7. Atomic DB settlement (no blockchain interaction)
            let transactionStarted = false;
            try {
                await this.transactionManager.beginTransaction();
                transactionStarted = true;

                const nowIso = new Date().toISOString();

                // 7a. Create order as completed immediately
                const order = await this.tradingOrderRepo.create({
                    user_id: userId,
                    type: 'sell',
                    crypto_type: data.crypto_type.toUpperCase(),
                    crypto_amount: cryptoAmount,
                    fiat_amount: fiatAmount,
                    rate_used: rate.buy_rate, // User sells at buy_rate
                    network_fee: 0,
                    settlement_mode: 'internal',
                    status: 'completed',
                    wallet_account_id: userCryptoAccount._id,
                    completed_at: nowIso,
                    created_at: nowIso,
                    updated_at: nowIso
                });

                // 7b. Internal sell custodial ledger (NO on-chain move):
                // Move ownership inside the SAME address/account:
                // - user_balance decreases (user can no longer spend it)
                // - platform_owned_balance increases (sellable by platform)
                // - total_onchain_balance stays the same (physical asset didn't move)
                const currentUserBalance = Number(parseFloat((userCryptoAccount.user_balance ?? userCryptoAccount.balance ?? 0).toString()));
                const currentUserPlatformOwned = Number(parseFloat((userCryptoAccount.platform_owned_balance ?? 0).toString()));
                const currentUserTotalOnchain = Number(parseFloat((userCryptoAccount.total_onchain_balance ?? 0).toString()));
                const locked = Number(parseFloat(userCryptoAccount.locked_balance?.toString() || '0'));

                const newUserBalance = currentUserBalance - cryptoAmount;
                const newPlatformOwned = currentUserPlatformOwned + cryptoAmount;
                const newAvailable = Math.max(0, newUserBalance - locked);

                await this.walletAccountRepo.update(userCryptoAccount._id!, {
                    user_balance: newUserBalance,
                    platform_owned_balance: newPlatformOwned,
                    total_onchain_balance: currentUserTotalOnchain,
                    balance: newUserBalance,
                    available_balance: newAvailable
                });

                if (asset === 'BTC') {
                    if (!userCryptoAccount.address) {
                        throw new ServiceError(
                            'Cannot complete internal sell: user BTC address missing (UTXO ownership tagging requires an address)'
                        );
                    }
                    await this.utxoRepo.promoteUserUtxosToPlatformInTxn(userCryptoAccount.address, cryptoAmount);
                }

                // 7c. Credit user NGN; debit platform NGN
                const userNgnBalance = Number(parseFloat(userNgnAccount.balance?.toString() || '0'));
                const userNgnAvailable = Number(parseFloat(userNgnAccount.available_balance?.toString() || '0'));
                const userNgnLocked = Number(parseFloat(userNgnAccount.locked_balance?.toString() || '0'));
                await this.walletAccountRepo.updateBalance(
                    userNgnAccount._id!,
                    Number(userNgnBalance + fiatAmount),
                    Number(userNgnAvailable + fiatAmount),
                    Number(userNgnLocked)
                );

                const platformNgnBalance = Number(parseFloat(platformNgnAccount.balance?.toString() || '0'));
                const platformNgnAvailable = Number(parseFloat(platformNgnAccount.available_balance?.toString() || '0'));
                const platformNgnLocked = Number(parseFloat(platformNgnAccount.locked_balance?.toString() || '0'));
                await this.walletAccountRepo.updateBalance(
                    platformNgnAccount._id!,
                    Number(platformNgnBalance - fiatAmount),
                    Number(platformNgnAvailable - fiatAmount),
                    Number(platformNgnLocked)
                );

                await this.transactionManager.commit();
                transactionStarted = false;

                // Notification (non-blocking)
                try {
                    await this.notificationService.create({
                        user_id: userId,
                        type: NotificationType.ORDER,
                        title: 'Order completed',
                        content: `Your ${cryptoType} sell order has been completed instantly.`,
                        url: `/orders/${order._id}`
                    });
                } catch {
                    // ignore notification errors
                }

                Console.info('Custodial sell order settled instantly', {
                    orderId: order._id,
                    userId,
                    cryptoAmount,
                    fiatAmount,
                    rate: rate.buy_rate
                });

                return order;
            } catch (error: any) {
                if (transactionStarted) {
                    try {
                        await this.transactionManager.rollback();
                    } catch (rollbackError: any) {
                        Console.error(rollbackError, { message: 'Failed to rollback custodial sell settlement', userId });
                    }
                }
                throw error;
            }
        } catch (error: any) {
            Console.error(error, { message: 'Failed to create sell order', userId, data });
            throw error;
        }
    }

    async getUserOrders(userId: string, limit: number = 50, offset: number = 0): Promise<ITradingOrder[]> {
        try {
            return await this.tradingOrderRepo.findByUserId(userId, limit, offset);
        } catch (error: any) {
            Console.error(error, { message: 'Failed to get user orders', userId });
            throw error;
        }
    } 

    async getOrderById(orderId: string, userId?: string): Promise<ITradingOrder> {
        try {
            const order = await this.tradingOrderRepo.findById(orderId);
            
            if (!order) {
                throw new ServiceError('Order not found');
            }

            // If userId provided, verify order belongs to user
            if (userId && order.user_id !== userId) {
                throw new ValidationError('Order does not belong to user');
            }

            return order;
        } catch (error: any) {
            Console.error(error, { message: 'Failed to get order by id', orderId, userId });
            throw error;
        }
    }

    async cancelOrder(orderId: string, userId: string): Promise<ITradingOrder> {
        try {
            const order = await this.getOrderById(orderId, userId);

            if (order.status === 'completed') {
                throw new ValidationError('Cannot cancel completed order');
            }

            if (order.status === 'cancelled') {
                throw new ValidationError('Order is already cancelled');
            }

            // Prevent canceling orders with pending transactions
            // If order is processing and has a transaction hash, transaction is already on blockchain
            if (order.status === 'processing') {
                const hasTransaction = order.type === 'buy' 
                    ? order.bitcoin_tx_hash_outgoing 
                    : order.bitcoin_tx_hash;
                
                if (hasTransaction) {
                    throw new ValidationError(
                        'Cannot cancel order with pending transaction. Transaction has been broadcast and is being processed. ' +
                        'Please wait for completion or contact support if the transaction is taking too long.'
                    );
                }
            }

            // Unlock balances and UTXOs
            if (order.type === 'buy') {
                // Unlock user's NGN
                const userNgnAccount = await this.walletAccountRepo.findByWalletIdAndCurrencyId(
                    (await this.walletRepo.findByUserId(userId))!._id!,
                    (await this.currencyRepo.findByCode('NGN'))!._id!
                );
                
                if (userNgnAccount) {
                    await this.unlockBalance(userNgnAccount._id!, order.fiat_amount);
                }

                // Unlock reserved UTXOs if order hasn't been broadcast yet
                if (order.utxo_ids && order.utxo_ids.length > 0 && !order.bitcoin_tx_hash_outgoing) {
                    await this.utxoManagerService.unlockUTXOs(order.utxo_ids);
                    Console.info('UTXOs unlocked for cancelled buy order', {
                        orderId,
                        utxoCount: order.utxo_ids.length
                    });
                }
            } else {
                // Unlock user's BTC (including fee)
                const cryptoAmount = parseFloat(order.crypto_amount?.toString() || '0');
                const networkFee = parseFloat(order.network_fee?.toString() || '0');
                const totalBtc = cryptoAmount + networkFee;
                if (order.wallet_account_id) {
                    await this.unlockBalance(order.wallet_account_id, totalBtc);
                }
                // Unlock platform NGN (was locked at sell creation)
                const platformWallet = await this.walletRepo.findPlatformWallet();
                const ngnCurrency = await this.currencyRepo.findByCode('NGN');
                if (platformWallet?._id && ngnCurrency?._id) {
                    const platformNgnAccount = await this.walletAccountRepo.findByWalletIdAndCurrencyId(
                        platformWallet._id,
                        ngnCurrency._id
                    );
                    if (platformNgnAccount) {
                        await this.unlockBalance(platformNgnAccount._id!, order.fiat_amount);
                    }
                }
            }

            // Update order
            const updated = await this.tradingOrderRepo.update(orderId, {
                status: 'cancelled'
            });

            if (!updated) {
                throw new ServiceError('Failed to cancel order');
            }

            Console.info('Order cancelled', { orderId, userId, type: order.type });

            return updated;
        } catch (error: any) {
            Console.error(error, { message: 'Failed to cancel order', orderId, userId });
            throw error;
        }
    }

    async processBuyOrder(orderId: string, paymentReference?: string): Promise<ITradingOrder> {
        try {
            const order = await this.tradingOrderRepo.findById(orderId);
            
            if (!order) {
                throw new ServiceError('Order not found');
            }

            if (order.type !== 'buy') {
                throw new ValidationError('Order is not a buy order');
            }

            if (order.status !== 'pending' && order.status !== 'processing') {
                throw new ValidationError(`Cannot process order with status: ${order.status}`);
            }

            // Require on-chain confirmation before completing
            if (!order.bitcoin_tx_hash_outgoing) {
                throw new ValidationError('Order has no broadcast transaction. Cannot complete.');
            }
            const asset = this.normalizeCustodialAsset(order.crypto_type || 'BTC');
            let confirmed = false;
            if (asset === 'ETH') {
                const v = await this.ethereumBlockchainService.verifyTransaction(order.bitcoin_tx_hash_outgoing);
                confirmed = !!(v && v.confirmed);
            } else {
                const verification = await this.blockchainService.verifyTransaction(order.bitcoin_tx_hash_outgoing);
                confirmed = !!(verification && verification.confirmed);
            }
            if (!confirmed) {
                throw new ValidationError(
                    'Transaction not confirmed on blockchain. Wait for confirmation or use admin complete-buy endpoint.'
                );
            }

            // Update order with payment reference if provided
            if (paymentReference) {
                await this.tradingOrderRepo.update(orderId, {
                    payment_reference: paymentReference,
                    status: 'processing'
                });
            } else if (order.status === 'pending') {
                await this.tradingOrderRepo.update(orderId, {
                    status: 'processing'
                });
            }

            // Complete the buy order (debit NGN, credit BTC)
            return await this.completeBuyOrder(orderId);
        } catch (error: any) {
            Console.error(error, { message: 'Failed to process buy order', orderId, paymentReference });
            throw error;
        }
    }

    async processSellOrder(orderId: string, bitcoinTxHash: string): Promise<ITradingOrder> {
        try {
            const order = await this.tradingOrderRepo.findById(orderId);
            
            if (!order) {
                throw new ServiceError('Order not found');
            }

            if (order.type !== 'sell') {
                throw new ValidationError('Order is not a sell order');
            }

            // Update order with transaction hash if not already set
            if (!order.bitcoin_tx_hash) {
                await this.tradingOrderRepo.update(orderId, {
                    bitcoin_tx_hash: bitcoinTxHash
                });
            }

            // Complete the sell order (debit BTC, credit NGN)
            return await this.completeSellOrder(orderId);
        } catch (error: any) {
            Console.error(error, { message: 'Failed to process sell order', orderId, bitcoinTxHash });
            throw error;
        }
    }

    async completeOrder(orderId: string): Promise<ITradingOrder> {
        try {
            const order = await this.tradingOrderRepo.findById(orderId);
            
            if (!order) {
                throw new ServiceError('Order not found');
            }

            if (order.status === 'completed') {
                return order; // Already completed
            }

            if (order.type === 'buy') {
                return await this.completeBuyOrder(orderId);
            } else {
                return await this.completeSellOrder(orderId);
            }
        } catch (error: any) {
            Console.error(error, { message: 'Failed to complete order', orderId });
            throw error;
        }
    }

    /**
     * Complete buy order after confirmation: Called by webhook when transaction is confirmed
     * Transaction was already broadcast, now we safely update balances
     */
    async completeBuyOrderAfterConfirmation(orderId: string): Promise<ITradingOrder> {
        const order = await this.tradingOrderRepo.findById(orderId);
        if (!order) throw new ServiceError('Order not found');

        // Check if already completed
        if (order.status === 'completed') {
            Console.info('Buy order already completed', { orderId });
            return order;
        }

        // Allow 'pending', 'processing', and 'failed' orders to be completed
        // 'failed' orders can be retried if they have a transaction hash (from background job)
        // This is useful for manually completing old orders or orders that didn't get webhook confirmation
        if (order.status !== 'processing' && order.status !== 'pending' && order.status !== 'failed') {
            throw new ServiceError(`Cannot complete order with status: ${order.status}. Only 'pending', 'processing', or 'failed' orders can be completed.`);
        }

        // For failed orders, ensure they have a transaction hash (otherwise they can't be completed)
        if (order.status === 'failed' && !order.bitcoin_tx_hash_outgoing) {
            throw new ServiceError('Cannot retry failed order without a transaction hash. Order was never broadcast.');
        }

        const asset = this.normalizeCustodialAsset(order.crypto_type || 'BTC');

        // 1. Get user's wallet accounts
            const wallet = await this.walletRepo.findByUserId(order.user_id);
            if (!wallet || !wallet._id) {
                throw new ServiceError('User wallet not found');
            }

            const ngnCurrency = await this.currencyRepo.findByCode('NGN');
            const cryptoCurrency = await this.currencyRepo.findByCode(asset);
            if (!ngnCurrency?._id || !cryptoCurrency?._id) {
                throw new ServiceError('Currency not found');
            }

            const userNgnAccount = await this.walletAccountRepo.findByWalletIdAndCurrencyId(wallet._id, ngnCurrency._id);
            const userCryptoAccount = await this.walletAccountRepo.findByWalletIdAndCurrencyId(wallet._id, cryptoCurrency._id);
            
            if (!userNgnAccount || !userCryptoAccount || !userCryptoAccount._id) {
                throw new ServiceError('User wallet accounts not found');
            }

            // 2. Get platform wallet accounts
            const platformWallet = await this.walletRepo.findPlatformWallet();
            if (!platformWallet || !platformWallet._id) {
                throw new ServiceError('Platform wallet not found');
            }

            const platformNgnAccount = await this.walletAccountRepo.findByWalletIdAndCurrencyId(
                platformWallet._id,
                ngnCurrency._id
            );
            const platformCryptoAccount = await this.walletAccountRepo.findByWalletIdAndCurrencyId(
                platformWallet._id,
                cryptoCurrency._id
            );

        if (!platformNgnAccount || !platformCryptoAccount || !platformCryptoAccount._id) {
            throw new ServiceError('Platform wallet accounts not found');
        }

        // Fetch blockchain data OUTSIDE transaction (avoids holding DB lock during network I/O)
        let parsedOutputs: Array<{ index: number; addresses: string[]; value: number; spent_by?: any[] }> = [];
        if (asset === 'BTC' && order.bitcoin_tx_hash_outgoing && userCryptoAccount.address) {
            try {
                const httpClient = (this.blockchainService as any).httpClient;
                const blockstreamClient = (this.blockchainService as any).blockstreamClient;
                let txData: any = null;
                let usedBlockstream = false;
                try {
                    txData = await httpClient.get(`/txs/${order.bitcoin_tx_hash_outgoing}`);
                } catch {
                    try {
                        txData = await blockstreamClient.get(`/tx/${order.bitcoin_tx_hash_outgoing}`);
                        usedBlockstream = true;
                    } catch {
                        Console.warn('Could not fetch tx for UTXO creation', { orderId });
                    }
                }
                if (txData) {
                    if (usedBlockstream && txData.vout) {
                        parsedOutputs = txData.vout.map((vout: any, index: number) => ({
                            index,
                            addresses: vout.scriptpubkey_address ? [vout.scriptpubkey_address] : [],
                            value: vout.value || 0,
                            spent_by: vout.spent ? [{ txid: 'spent' }] : []
                        }));
                    } else {
                        parsedOutputs = txData.outputs || [];
                    }
                }
            } catch (err: any) {
                Console.warn('Failed to pre-fetch tx for UTXO creation', { orderId, error: err.message });
            }
        }

        // Start database transaction for atomicity
        let transactionStarted = false;
        try {
            await this.transactionManager.beginTransaction();
            transactionStarted = true;
            Console.info('Transaction started for order completion', { orderId });

            // 3. Debit user's NGN (unlock and deduct) - Transaction confirmed, safe to deduct
            const userNgnLocked = parseFloat(userNgnAccount.locked_balance?.toString() || '0');
            const userNgnBalance = parseFloat(userNgnAccount.balance?.toString() || '0');
            const userNgnAvailable = parseFloat(userNgnAccount.available_balance?.toString() || '0');
            const fiatAmount = parseFloat(order.fiat_amount?.toString() || '0'); // Ensure it's a number

            // For failed orders being retried, check if NGN was already debited
            // If locked balance >= fiatAmount, NGN is still locked (not debited yet)
            // If locked balance < fiatAmount, NGN might have been debited already
            const isRetry = order.status === 'failed';
            let shouldDebitUser = true;
            let newUserNgnBalance = userNgnBalance;
            let newUserNgnAvailable = userNgnAvailable;
            let newUserNgnLocked = userNgnLocked;

            if (isRetry) {
                // Check if NGN is still locked (means it wasn't debited yet)
                if (userNgnLocked >= fiatAmount) {
                    // NGN is still locked, unlock and debit it
                    newUserNgnBalance = userNgnBalance - fiatAmount;
                    newUserNgnAvailable = (userNgnAvailable + userNgnLocked) - fiatAmount;
                    newUserNgnLocked = Math.max(0, userNgnLocked - fiatAmount); // Prevent negative
                    Console.info('Retrying failed order: Unlocking and debiting user NGN', {
                        orderId,
                        locked: userNgnLocked,
                        fiatAmount,
                        newBalance: newUserNgnBalance,
                        newLocked: newUserNgnLocked
                    });
                } else {
                    // NGN was already debited in previous attempt, don't debit again
                    // Just unlock any remaining locked amount (could be 0 or negative from previous bug)
                    shouldDebitUser = false;
                    newUserNgnBalance = userNgnBalance; // Keep current balance
                    // If locked is negative, add it back to available (it was over-unlocked)
                    // If locked is positive, unlock it normally
                    newUserNgnAvailable = userNgnAvailable + Math.max(0, userNgnLocked); // Only unlock if positive
                    newUserNgnLocked = 0; // Always set to 0 (unlock all, fix any negative)
                    Console.info('Retrying failed order: User NGN already debited, fixing locked balance', {
                        orderId,
                        currentBalance: userNgnBalance,
                        currentLocked: userNgnLocked,
                        fiatAmount,
                        newLocked: newUserNgnLocked
                    });
                }
            } else {
                // Normal flow: unlock and debit
                newUserNgnBalance = userNgnBalance - fiatAmount;
                newUserNgnAvailable = (userNgnAvailable + userNgnLocked) - fiatAmount;
                newUserNgnLocked = Math.max(0, userNgnLocked - fiatAmount); // Prevent negative
            }
            
            await this.walletAccountRepo.updateBalance(
                userNgnAccount._id!,
                newUserNgnBalance,
                newUserNgnAvailable,
                newUserNgnLocked
            );

            // 4. Credit platform's NGN (only if we debited the user)
            if (shouldDebitUser) {
                const platformNgnBalance = parseFloat(platformNgnAccount.balance?.toString() || '0');
                const platformNgnAvailable = parseFloat(platformNgnAccount.available_balance?.toString() || '0');
                
                await this.walletAccountRepo.updateBalance(
                    platformNgnAccount._id!,
                    platformNgnBalance + fiatAmount,
                    platformNgnAvailable + fiatAmount,
                    parseFloat(platformNgnAccount.locked_balance?.toString() || '0')
                );
            } else {
                Console.info('Retrying failed order: Platform NGN already credited, skipping', {
                    orderId,
                    currentPlatformBalance: parseFloat(platformNgnAccount.balance?.toString() || '0')
                });
            }

            // 5. Credit user's crypto wallet - Transaction confirmed, safe to credit
            const userCryptoBalance = parseFloat(userCryptoAccount.balance?.toString() || '0');
            const userCryptoAvailable = parseFloat(userCryptoAccount.available_balance?.toString() || '0');
            const cryptoAmount = parseFloat(order.crypto_amount?.toString() || '0'); // Ensure it's a number

            await this.walletAccountRepo.updateBalance(
                userCryptoAccount._id!,
                userCryptoBalance + cryptoAmount,
                userCryptoAvailable + cryptoAmount,
                parseFloat(userCryptoAccount.locked_balance?.toString() || '0')
            );

            // 6. Create UTXOs for user address (using pre-fetched tx data - no network calls inside txn)
            if (asset === 'BTC' && order.bitcoin_tx_hash_outgoing && userCryptoAccount.address && userCryptoAccount._id && parsedOutputs.length > 0) {
                try {
                    const container = DIContainer.getInstance();
                    const utxoManagerService = container.get<IUTXOManagerService>(TYPES.UTXOManagerService);
                    const outputs = parsedOutputs;
                    
                    // Find all outputs that went to user address
                        let utxosCreated = 0;
                        for (let i = 0; i < outputs.length; i++) {
                            const output = outputs[i];
                            const outputAddresses = output.addresses || [];
                            
                            if (outputAddresses.includes(userCryptoAccount.address)) {
                                // Check if this output is already spent
                                const isSpent = output.spent_by && output.spent_by.length > 0;
                                
                                if (!isSpent) {
                                    // Check if UTXO already exists (avoid duplicates)
                                    try {
                                        const existing = await utxoManagerService.createUTXOFromTransaction(
                                            order.bitcoin_tx_hash_outgoing,
                                            i, // vout index
                                            userCryptoAccount.address,
                                            userCryptoAccount._id
                                        );
                                        
                                        utxosCreated++;
                                        Console.info('UTXO created for user address via background job', {
                                            orderId,
                                            address: userCryptoAccount.address,
                                            txHash: order.bitcoin_tx_hash_outgoing,
                                            vout: i,
                                            amount: (output.value || 0) / 100000000,
                                            utxoId: existing._id
                                        });
                                    } catch (utxoError: any) {
                                        // UTXO might already exist, that's okay
                                        if (utxoError.message && utxoError.message.includes('already exists')) {
                                            Console.info('UTXO already exists, skipping', {
                                                orderId,
                                                txHash: order.bitcoin_tx_hash_outgoing,
                                                vout: i
                                            });
                                        } else {
                                            Console.warn('Failed to create UTXO for output', {
                                                orderId,
                                                txHash: order.bitcoin_tx_hash_outgoing,
                                                vout: i,
                                                error: utxoError.message
                                            });
                                        }
                                    }
                                } else {
                                    Console.info('Output already spent, skipping UTXO creation', {
                                        orderId,
                                        txHash: order.bitcoin_tx_hash_outgoing,
                                        vout: i
                                    });
                                }
                            }
                        }
                        
                        if (utxosCreated > 0) {
                            Console.info('UTXOs created successfully for user address', {
                                orderId,
                                address: userCryptoAccount.address,
                                utxosCreated,
                                txHash: order.bitcoin_tx_hash_outgoing
                            });
                        } else {
                            Console.warn('No UTXOs created - all outputs may be spent or already exist', {
                                orderId,
                                address: userCryptoAccount.address,
                                txHash: order.bitcoin_tx_hash_outgoing
                            });
                        }
                } catch (utxoErr: any) {
                    Console.warn('Error creating UTXOs in completion', { orderId, error: utxoErr.message });
                }
            } else if (asset === 'BTC' && order.bitcoin_tx_hash_outgoing && userCryptoAccount.address && userCryptoAccount._id) {
                // Fallback when pre-fetch failed: try default vout 0
                try {
                    const container = DIContainer.getInstance();
                    const utxoManagerService = container.get<IUTXOManagerService>(TYPES.UTXOManagerService);
                    await utxoManagerService.createUTXOFromTransaction(
                        order.bitcoin_tx_hash_outgoing,
                        0,
                        userCryptoAccount.address,
                        userCryptoAccount._id
                    );
                } catch (utxoError: any) {
                    Console.warn('Fallback UTXO creation failed, will need manual sync', { orderId });
                }
            } else if (asset === 'BTC') {
                Console.warn('Cannot create UTXOs - missing transaction hash or user address', {
                    orderId,
                    hasTxHash: !!order.bitcoin_tx_hash_outgoing,
                    hasAddress: !!userCryptoAccount.address
                });
            }

            // 7. Update platform BTC balance based on UTXO totals
            if (asset === 'BTC' && platformCryptoAccount.address && platformCryptoAccount._id) {
                try {
                    const availableUTXOs = await this.utxoManagerService.getAvailableUTXOs(platformCryptoAccount.address);
                    const totalUTXOAmount = availableUTXOs.reduce((sum, utxo) => {
                        let amount = Number(parseFloat(String(utxo.amount)));
                        // If amount is suspiciously large (> 1), it might be in satoshis - convert to BTC
                        if (amount > 1) {
                            amount = amount / 100000000;
                        }
                        return sum + amount;
                    }, 0);

                    await this.walletAccountRepo.updateBalance(
                        platformCryptoAccount._id,
                        Number(totalUTXOAmount),
                        Number(totalUTXOAmount),
                        Number(parseFloat(platformCryptoAccount.locked_balance?.toString() || '0'))
                    );

                    Console.info('Platform BTC balance updated from UTXOs', {
                        address: platformCryptoAccount.address,
                        totalUTXOAmount,
                        utxoCount: availableUTXOs.length
                    });
                } catch (utxoError: any) {
                    Console.warn('Failed to update platform BTC balance from UTXOs', {
                        error: utxoError.message,
                        address: platformCryptoAccount.address
                    });
                    // Don't fail the order completion if UTXO balance update fails
                }
            }

            // 8. Update order status to completed (coerce network_fee to number - pg can return Decimal as string)
            const updated = await this.tradingOrderRepo.update(orderId, {
                status: 'completed',
                settlement_mode: 'onchain',
                network_fee: Number(
                    order.network_fee ??
                        (asset === 'BTC' ? await this.bitcoinTransactionService.calculateNetworkFee('medium') : 0)
                ),
                completed_at: new Date().toISOString()
            });

            // Commit transaction
            await this.transactionManager.commit();
            transactionStarted = false;

            // 9. Store change UTXO if transaction was confirmed (outside transaction - can fail without affecting order)
            // Change goes back to platform address, so we need to store it as a new available UTXO
            if (asset === 'BTC' && order.bitcoin_tx_hash_outgoing && platformCryptoAccount.address) {
                try {
                    const changeUTXO = await this.utxoManagerService.storeChangeUTXO(
                        order.bitcoin_tx_hash_outgoing,
                        platformCryptoAccount.address,
                        platformCryptoAccount._id
                    );
                    
                    if (changeUTXO) {
                        await this.tradingOrderRepo.update(orderId, {
                            change_utxo_id: changeUTXO._id!
                        });
                        Console.info('Change UTXO stored', {
                            orderId,
                            changeUTXOId: changeUTXO._id,
                            amount: changeUTXO.amount
                        });
                    }
                } catch (error: any) {
                    Console.warn('Failed to store change UTXO', {
                        orderId,
                        txHash: order.bitcoin_tx_hash_outgoing,
                        error: error.message
                    });
                    // Don't fail the order completion if change UTXO storage fails
                }
            }

            Console.info('Buy order completed after confirmation', {
                orderId,
                userId: order.user_id,
                cryptoAmount: order.crypto_amount,
                fiatAmount: order.fiat_amount,
                txHash: order.bitcoin_tx_hash_outgoing
            });

            return updated!;
        } catch (error: any) {
            // Rollback transaction if it was started
            if (transactionStarted) {
                try {
                    await this.transactionManager.rollback();
                    Console.info('Transaction rolled back due to error', { orderId });
                } catch (rollbackError: any) {
                    Console.error(rollbackError, { message: 'Failed to rollback transaction', orderId });
                }
            }

            Console.error(error, { message: 'Failed to complete buy order after confirmation', orderId });
            
            // Mark order as failed
            await this.tradingOrderRepo.update(orderId, {
                status: 'failed',
                failure_reason: error.message
            });

            throw error;
        }
    }

    /**
     * Complete buy order: Debit NGN, credit BTC, send BTC to user
     * @deprecated Use completeBuyOrderAfterConfirmation after webhook confirmation
     */
    private async completeBuyOrder(orderId: string): Promise<ITradingOrder> {
        // This method is kept for backward compatibility but should not be used for new orders
        // New orders use completeBuyOrderAfterConfirmation after webhook confirmation
        return await this.completeBuyOrderAfterConfirmation(orderId);
    }

    /**
     * Complete sell order: Debit BTC, credit NGN.
     * Wrapped in transaction for atomicity; idempotent (safe to retry).
     */
    private async completeSellOrder(orderId: string): Promise<ITradingOrder> {
        const order = await this.tradingOrderRepo.findById(orderId);
        if (!order) throw new ServiceError('Order not found');

        // Idempotency: already completed
        if (order.status === 'completed') {
            Console.info('Sell order already completed, skipping', { orderId });
            return order;
        }

        const asset = this.normalizeCustodialAsset(order.crypto_type || 'BTC');

        let transactionStarted = false;
        try {
            await this.transactionManager.beginTransaction();
            transactionStarted = true;

            // 1. Get user's wallet accounts
            const wallet = await this.walletRepo.findByUserId(order.user_id);
            if (!wallet || !wallet._id) {
                throw new ServiceError('User wallet not found');
            }

            const ngnCurrency = await this.currencyRepo.findByCode('NGN');
            const cryptoCurrency = await this.currencyRepo.findByCode(asset);
            if (!ngnCurrency?._id || !cryptoCurrency?._id) {
                throw new ServiceError('Currency not found');
            }

            const userNgnAccount = await this.walletAccountRepo.findByWalletIdAndCurrencyId(wallet._id, ngnCurrency._id);
            const userCryptoAccount = await this.walletAccountRepo.findByWalletIdAndCurrencyId(wallet._id, cryptoCurrency._id);
            
            if (!userNgnAccount || !userCryptoAccount || !userCryptoAccount._id) {
                throw new ServiceError('User wallet accounts not found');
            }

            // 2. Get platform wallet accounts
            const platformWallet = await this.walletRepo.findPlatformWallet();
            if (!platformWallet || !platformWallet._id) {
                throw new ServiceError('Platform wallet not found');
            }

            const platformNgnAccount = await this.walletAccountRepo.findByWalletIdAndCurrencyId(
                platformWallet._id,
                ngnCurrency._id
            );
            const platformCryptoAccount = await this.walletAccountRepo.findByWalletIdAndCurrencyId(
                platformWallet._id,
                cryptoCurrency._id
            );

            if (!platformNgnAccount || !platformCryptoAccount) {
                throw new ServiceError('Platform wallet accounts not found');
            }

            // 3. Debit user's crypto (unlock and deduct, including fee)
            const cryptoAmount = Number(parseFloat(order.crypto_amount?.toString() || '0'));
            const fiatAmount = Number(parseFloat(order.fiat_amount?.toString() || '0'));
            const networkFee = Number(parseFloat(order.network_fee?.toString() || '0'));
            const totalCryptoDeducted = cryptoAmount + networkFee;
            const userCryptoLocked = Number(parseFloat(userCryptoAccount.locked_balance?.toString() || '0'));
            const userCryptoBal = Number(parseFloat(userCryptoAccount.balance?.toString() || '0'));

            await this.walletAccountRepo.updateBalance(
                userCryptoAccount._id!,
                Number(userCryptoBal - totalCryptoDeducted),
                Number((Number(parseFloat(userCryptoAccount.available_balance?.toString() || '0')) + userCryptoLocked) - totalCryptoDeducted),
                Number(userCryptoLocked - totalCryptoDeducted)
            );

            // 4. Credit platform's crypto inventory
            const platformCryptoBal = Number(parseFloat(platformCryptoAccount.balance?.toString() || '0'));
            const platformCryptoAvail = Number(parseFloat(platformCryptoAccount.available_balance?.toString() || '0'));

            await this.walletAccountRepo.updateBalance(
                platformCryptoAccount._id!,
                Number(platformCryptoBal + cryptoAmount),
                Number(platformCryptoAvail + cryptoAmount),
                Number(parseFloat(platformCryptoAccount.locked_balance?.toString() || '0'))
            );

            // 5. Credit user's NGN
            const userNgnBalance = Number(parseFloat(userNgnAccount.balance?.toString() || '0'));
            const userNgnAvailable = Number(parseFloat(userNgnAccount.available_balance?.toString() || '0'));

            await this.walletAccountRepo.updateBalance(
                userNgnAccount._id!,
                Number(userNgnBalance + fiatAmount),
                Number(userNgnAvailable + fiatAmount),
                Number(parseFloat(userNgnAccount.locked_balance?.toString() || '0'))
            );

            // 6. Debit platform's NGN (release lock and pay out)
            // At sell creation we locked: available -= fiatAmount, locked += fiatAmount
            // On completion: release lock (locked -= fiatAmount) and debit balance
            const platformNgnBalance = Number(parseFloat(platformNgnAccount.balance?.toString() || '0'));
            const platformNgnLocked = Number(parseFloat(platformNgnAccount.locked_balance?.toString() || '0'));
            const platformNgnAvailable = Number(parseFloat(platformNgnAccount.available_balance?.toString() || '0'));

            await this.walletAccountRepo.updateBalance(
                platformNgnAccount._id!,
                Number(platformNgnBalance - fiatAmount),
                Number(platformNgnAvailable), // unchanged – already reduced when locked
                Number(platformNgnLocked - fiatAmount)
            );

            // 7. Update order
            const updated = await this.tradingOrderRepo.update(orderId, {
                status: 'completed',
                settlement_mode: 'onchain',
                completed_at: new Date().toISOString()
            });

            await this.transactionManager.commit();
            transactionStarted = false;

            Console.info('Sell order completed', {
                orderId,
                userId: order.user_id,
                cryptoAmount: order.crypto_amount,
                fiatAmount: order.fiat_amount,
                txHash: order.bitcoin_tx_hash
            });

            return updated!;
        } catch (error: any) {
            if (transactionStarted) {
                try {
                    await this.transactionManager.rollback();
                } catch (rollbackError: any) {
                    Console.error(rollbackError, { message: 'Failed to rollback sell completion', orderId });
                }
            }
            Console.error(error, { message: 'Failed to complete sell order', orderId });
            
            // Mark order as failed
            await this.tradingOrderRepo.update(orderId, {
                status: 'failed',
                failure_reason: error.message
            });

            throw error;
        }
    }

    /**
     * Helper method to unlock balance (uses atomic update to prevent race conditions)
     */
    private async unlockBalance(walletAccountId: string, amount: number): Promise<void> {
        const result = await this.walletAccountRepo.unlockBalanceAtomic(walletAccountId, amount);
        if (!result) {
            Console.warn('unlockBalance: insufficient locked balance or account not found', {
                walletAccountId,
                amount
            });
            // Fallback to non-atomic unlock for edge cases (e.g. negative locked from previous bugs)
            const account = await this.walletAccountRepo.findById(walletAccountId);
            if (account) {
                const currentLocked = parseFloat(account.locked_balance?.toString() || '0');
                const currentAvailable = parseFloat(account.available_balance?.toString() || '0');
                const newLocked = Math.max(0, currentLocked - amount);
                const newAvailable = currentAvailable + Math.min(amount, currentLocked);
                await this.walletAccountRepo.updateBalance(
                    walletAccountId,
                    parseFloat(account.balance?.toString() || '0'),
                    newAvailable,
                    newLocked
                );
            }
        }
    }
}

