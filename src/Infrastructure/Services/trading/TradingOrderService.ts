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
import { DIContainer } from '../../../Core/DIContainer';
import { WalletAccountRepository } from '../../Repository/SQL/wallet/WalletAccountRepository';
import { WalletRepository } from '../../Repository/SQL/wallet/WalletRepository';
import { CurrencyRepository } from '../../Repository/SQL/wallet/CurrencyRepository';
import { TransactionManager } from '../../Repository/SQL/Abstractions/TransactionManager';
import { Console } from '../../Utils/Console';
import { ServiceError, ValidationError } from '../../../Core/Application/Error/AppError';

@injectable()
export class TradingOrderService implements ITradingOrderService {
    constructor(
        @inject(TYPES.TradingOrderRepository) private readonly tradingOrderRepo: ITradingOrderRepository,
        @inject(TYPES.TradingRateService) private readonly tradingRateService: ITradingRateService,
        @inject(TYPES.WalletService) private readonly walletService: IWalletService,
        @inject(TYPES.BitcoinTransactionService) private readonly bitcoinTransactionService: IBitcoinTransactionService,
        @inject(TYPES.UTXOManagerService) private readonly utxoManagerService: IUTXOManagerService,
        @inject(TYPES.BlockchainService) private readonly blockchainService: IBlockchainService,
        @inject(TYPES.WalletAccountRepository) private readonly walletAccountRepo: WalletAccountRepository,
        @inject(TYPES.WalletRepository) private readonly walletRepo: WalletRepository,
        @inject(TYPES.CurrencyRepository) private readonly currencyRepo: CurrencyRepository,
        @inject(TYPES.TransactionManager) private readonly transactionManager: TransactionManager
    ) {}

    async createBuyOrder(userId: string, data: {
        crypto_type: string;
        crypto_amount: number;
    }): Promise<ITradingOrder> {
        try {
            // 1. Get active trading rate
            const rate = await this.tradingRateService.getActiveRate(data.crypto_type.toUpperCase());
            
            // 2. Calculate NGN amount needed (user buys at sell_rate)
            const fiatAmount = await this.tradingRateService.calculateBuyAmount(
                data.crypto_type.toUpperCase(),
                data.crypto_amount
            );

            // 3. Get user's wallet and NGN account
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

            // 4. Check if user has sufficient NGN balance
            const availableBalance = parseFloat(userNgnAccount.available_balance?.toString() || '0');
            if (availableBalance < fiatAmount) {
                throw new ValidationError(`Insufficient balance. Need ${fiatAmount} NGN, have ${availableBalance} NGN`);
            }

            // 5. Get platform wallet and BTC account
            const platformWallet = await this.walletRepo.findPlatformWallet();
            if (!platformWallet || !platformWallet._id) {
                throw new ServiceError('Platform wallet not found');
            }

            const btcCurrency = await this.currencyRepo.findByCode('BTC');
            if (!btcCurrency || !btcCurrency._id) {
                throw new ServiceError('BTC currency not found');
            }

            const platformBtcAccount = await this.walletAccountRepo.findByWalletIdAndCurrencyId(
                platformWallet._id,
                btcCurrency._id
            );

            if (!platformBtcAccount || !platformBtcAccount.address) {
                throw new ServiceError('Platform BTC account or address not found');
            }

            // 6. Get user's BTC account
            const userBtcAccount = await this.walletAccountRepo.findByWalletIdAndCurrencyId(
                wallet._id,
                btcCurrency._id
            );

            if (!userBtcAccount || !userBtcAccount._id) {
                throw new ValidationError('User BTC wallet account not found');
            }

            // 7. Lock user's NGN balance
            const newLockedBalance = parseFloat(userNgnAccount.locked_balance?.toString() || '0') + fiatAmount;
            const newAvailableBalance = availableBalance - fiatAmount;

            await this.walletAccountRepo.updateBalance(
                userNgnAccount._id!,
                parseFloat(userNgnAccount.balance?.toString() || '0'),
                newAvailableBalance,
                newLockedBalance
            );

            // 8. Calculate network fee and reserve UTXOs
            const networkFee = await this.bitcoinTransactionService.calculateNetworkFee('medium');
            const totalBtcNeeded = data.crypto_amount + networkFee;

            // 9. Create order first (status: pending - will update to processing after UTXO reservation)
            const order = await this.tradingOrderRepo.create({
                user_id: userId,
                type: 'buy',
                crypto_type: data.crypto_type.toUpperCase(),
                crypto_amount: data.crypto_amount,
                fiat_amount: fiatAmount,
                rate_used: rate.sell_rate, 
                status: 'pending', // Will update to processing after UTXO reservation
                wallet_account_id: userBtcAccount._id,
                network_fee: networkFee,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            });

            // 10. Reserve UTXOs atomically (prevents double-spending)
            let reservedUTXOs;
            try {
                reservedUTXOs = await this.utxoManagerService.reserveUTXOsForOrder(
                    platformBtcAccount.address,
                    totalBtcNeeded,
                    order._id!
                );
            } catch (error: any) {
                // Unlock user NGN and mark order as failed if UTXO reservation fails
                await this.unlockBalance(userNgnAccount._id!, fiatAmount);
                await this.tradingOrderRepo.update(order._id!, {
                    status: 'failed',
                    failure_reason: `Failed to reserve UTXOs: ${error.message}`
                });
                throw new ServiceError(`Failed to reserve UTXOs: ${error.message}`);
            }

            // Update order with UTXO IDs and status
            await this.tradingOrderRepo.update(order._id!, {
                utxo_ids: reservedUTXOs.map(u => u._id!),
                status: 'processing'
            });

            Console.info('Buy order created with reserved UTXOs', {
                orderId: order._id,
                userId,
                cryptoAmount: data.crypto_amount,
                fiatAmount,
                rate: rate.sell_rate,
                utxoCount: reservedUTXOs.length
            });

            // 10. Build and broadcast Bitcoin transaction using reserved UTXOs
            try {
                if (!userBtcAccount.address) {
                    throw new ServiceError('User BTC address not found');
                }

                // Build transaction with reserved UTXOs
                const transaction = await this.bitcoinTransactionService.buildTransactionWithUTXOs(
                    platformBtcAccount.address,
                    userBtcAccount.address,
                    data.crypto_amount,
                    reservedUTXOs.map(u => ({
                        txid: u.txid,
                        vout: u.vout,
                        amount: parseFloat(u.amount.toString()),
                        script: u.script || undefined
                    })),
                    networkFee
                );

                // Sign transaction
                const signedTxHex = await this.bitcoinTransactionService.signTransaction(
                    transaction,
                    platformBtcAccount.address
                );

                // Broadcast transaction
                const txHash = await this.bitcoinTransactionService.broadcastTransaction(signedTxHex);

                // Mark UTXOs as spent
                const utxoIds = reservedUTXOs.map(u => u._id!);
                await this.utxoManagerService.markUTXOsAsSpent(utxoIds, txHash);

                // Update order with transaction hash
                // Webhook will complete the order and store change UTXO when transaction is confirmed
                const updatedOrder = await this.tradingOrderRepo.update(order._id!, {
                    bitcoin_tx_hash_outgoing: txHash,
                    network_fee: networkFee
                });

                Console.info('Buy order transaction broadcasted', {
                    orderId: order._id,
                    txHash,
                    utxoCount: reservedUTXOs.length,
                    status: 'Waiting for confirmation via webhook'
                });

                return updatedOrder!;
            } catch (error: any) {
                Console.error(error, { message: 'Failed to broadcast transaction, unlocking UTXOs', orderId: order._id });
                
                // Unlock UTXOs and user NGN on error
                const utxoIds = reservedUTXOs.map(u => u._id!);
                await this.utxoManagerService.unlockUTXOs(utxoIds);
                await this.unlockBalance(userNgnAccount._id!, fiatAmount);
                
                // Mark order as failed
                await this.tradingOrderRepo.update(order._id!, {
                    status: 'failed',
                    failure_reason: error.message
                });

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
    }): Promise<ITradingOrder> {
        try {
            // 1. Get active trading rate
            const rate = await this.tradingRateService.getActiveRate(data.crypto_type.toUpperCase());
            
            // 2. Calculate NGN amount user will receive (user sells at buy_rate)
            const fiatAmount = await this.tradingRateService.calculateSellAmount(
                data.crypto_type.toUpperCase(),
                data.crypto_amount
            );

            // 3. Get user's wallet and BTC account
            const wallet = await this.walletRepo.findByUserId(userId);
            if (!wallet || !wallet._id) {
                throw new ValidationError('Wallet not found for user');
            }

            const btcCurrency = await this.currencyRepo.findByCode('BTC');
            if (!btcCurrency || !btcCurrency._id) {
                throw new ServiceError('BTC currency not found');
            }

            const userBtcAccount = await this.walletAccountRepo.findByWalletIdAndCurrencyId(
                wallet._id,
                btcCurrency._id
            );

            if (!userBtcAccount || !userBtcAccount._id) {
                throw new ValidationError('User BTC wallet account not found');
            }

            // 4. Check if user has sufficient BTC balance (including network fee)
            const networkFee = await this.bitcoinTransactionService.calculateNetworkFee('medium');
            const totalBtcNeeded = data.crypto_amount + networkFee; // User pays fee for sell orders

            const availableBalance = parseFloat(userBtcAccount.available_balance?.toString() || '0');
            if (availableBalance < totalBtcNeeded) {
                throw new ValidationError(
                    `Insufficient balance. Need ${totalBtcNeeded} BTC (${data.crypto_amount} + ${networkFee} fee), have ${availableBalance} BTC`
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

            // 6. Lock user's BTC balance
            const newLockedBalance = parseFloat(userBtcAccount.locked_balance?.toString() || '0') + totalBtcNeeded;
            const newAvailableBalance = availableBalance - totalBtcNeeded;

            await this.walletAccountRepo.updateBalance(
                userBtcAccount._id!,
                parseFloat(userBtcAccount.balance?.toString() || '0'),
                newAvailableBalance,
                newLockedBalance
            );

            // 7. Get platform BTC account
            const platformBtcAccount = await this.walletAccountRepo.findByWalletIdAndCurrencyId(
                platformWallet._id,
                btcCurrency._id
            );

            if (!platformBtcAccount || !platformBtcAccount.address) {
                throw new ServiceError('Platform BTC account or address not found');
            }

            // 8. Lock platform NGN balance (prevent race conditions)
            const platformNgnLocked = parseFloat(platformNgnAccount.locked_balance?.toString() || '0') + fiatAmount;
            const platformNgnAvailable = platformNgnBalance - fiatAmount;

            await this.walletAccountRepo.updateBalance(
                platformNgnAccount._id!,
                parseFloat(platformNgnAccount.balance?.toString() || '0'),
                platformNgnAvailable,
                platformNgnLocked
            );

            // 9. Create order first (status: pending - will update to processing after UTXO reservation)
            const order = await this.tradingOrderRepo.create({
                user_id: userId,
                type: 'sell',
                crypto_type: data.crypto_type.toUpperCase(),
                crypto_amount: data.crypto_amount,
                fiat_amount: fiatAmount,
                rate_used: rate.buy_rate, // User sells at buy_rate
                network_fee: networkFee,
                status: 'pending', // Will update to processing after UTXO reservation
                wallet_account_id: userBtcAccount._id,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            });

            // 10. Reserve UTXOs from user's address atomically (prevents double-spending)
            let reservedUTXOs;
            try {
                if (!userBtcAccount.address) {
                    throw new ServiceError('User BTC address not found');
                }

                reservedUTXOs = await this.utxoManagerService.reserveUTXOsForOrder(
                    userBtcAccount.address,
                    totalBtcNeeded,
                    order._id!
                );
            } catch (error: any) {
                // Unlock user BTC and platform NGN, mark order as failed if UTXO reservation fails
                await this.unlockBalance(userBtcAccount._id!, totalBtcNeeded);
                await this.unlockBalance(platformNgnAccount._id!, fiatAmount);
                await this.tradingOrderRepo.update(order._id!, {
                    status: 'failed',
                    failure_reason: `Failed to reserve UTXOs: ${error.message}`
                });
                throw new ServiceError(`Failed to reserve UTXOs: ${error.message}`);
            }

            // Update order with UTXO IDs and status
            await this.tradingOrderRepo.update(order._id!, {
                utxo_ids: reservedUTXOs.map(u => u._id!),
                status: 'processing'
            });

            Console.info('Sell order created with reserved UTXOs', {
                orderId: order._id,
                userId,
                cryptoAmount: data.crypto_amount,
                fiatAmount,
                rate: rate.buy_rate,
                utxoCount: reservedUTXOs.length
            });

            // 11. Build and broadcast Bitcoin transaction using reserved UTXOs
            try {
                if (!userBtcAccount.address) {
                    throw new ServiceError('User BTC address not found');
                }

                // Build transaction with reserved UTXOs (from user address to platform address)
                const transaction = await this.bitcoinTransactionService.buildTransactionWithUTXOs(
                    userBtcAccount.address,
                    platformBtcAccount.address,
                    data.crypto_amount,
                    reservedUTXOs.map(u => ({
                        txid: u.txid,
                        vout: u.vout,
                        amount: parseFloat(u.amount.toString()),
                        script: u.script || undefined
                    })),
                    networkFee
                );

                // Sign transaction
                const signedTxHex = await this.bitcoinTransactionService.signTransaction(
                    transaction,
                    userBtcAccount.address
                );

                // Broadcast transaction
                const txHash = await this.bitcoinTransactionService.broadcastTransaction(signedTxHex);

                // Mark UTXOs as spent
                const utxoIds = reservedUTXOs.map(u => u._id!);
                await this.utxoManagerService.markUTXOsAsSpent(utxoIds, txHash);

                // Update order with transaction hash
                // Webhook will complete the order when transaction is confirmed
                const updatedOrder = await this.tradingOrderRepo.update(order._id!, {
                    bitcoin_tx_hash: txHash,
                    network_fee: networkFee
                });

                Console.info('Sell order transaction broadcasted', {
                    orderId: order._id,
                    txHash,
                    utxoCount: reservedUTXOs.length,
                    fromAddress: userBtcAccount.address,
                    toAddress: platformBtcAccount.address,
                    status: 'Waiting for confirmation via webhook'
                });

                return updatedOrder!;
            } catch (error: any) {
                Console.error(error, { message: 'Failed to broadcast transaction, unlocking UTXOs', orderId: order._id });
                
                // Unlock UTXOs, user BTC, and platform NGN on error
                const utxoIds = reservedUTXOs.map(u => u._id!);
                await this.utxoManagerService.unlockUTXOs(utxoIds);
                await this.unlockBalance(userBtcAccount._id!, totalBtcNeeded);
                await this.unlockBalance(platformNgnAccount._id!, fiatAmount);
                
                // Mark order as failed
                await this.tradingOrderRepo.update(order._id!, {
                    status: 'failed',
                    failure_reason: error.message
                });

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

            // Update order with payment reference if provided
            if (paymentReference) {
                await this.tradingOrderRepo.update(orderId, {
                    payment_reference: paymentReference,
                    status: 'processing'
                });
            } else if (order.status === 'pending') {
                // If no payment reference but order is pending, mark as processing
                await this.tradingOrderRepo.update(orderId, {
                    status: 'processing'
                });
            }

            // Complete the buy order (debit NGN, credit BTC, send BTC to user)
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

        // 1. Get user's wallet accounts
            const wallet = await this.walletRepo.findByUserId(order.user_id);
            if (!wallet || !wallet._id) {
                throw new ServiceError('User wallet not found');
            }

            const ngnCurrency = await this.currencyRepo.findByCode('NGN');
            const btcCurrency = await this.currencyRepo.findByCode('BTC');
            if (!ngnCurrency?._id || !btcCurrency?._id) {
                throw new ServiceError('Currency not found');
            }

            const userNgnAccount = await this.walletAccountRepo.findByWalletIdAndCurrencyId(wallet._id, ngnCurrency._id);
            const userBtcAccount = await this.walletAccountRepo.findByWalletIdAndCurrencyId(wallet._id, btcCurrency._id);
            
            if (!userNgnAccount || !userBtcAccount || !userBtcAccount._id) {
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
            const platformBtcAccount = await this.walletAccountRepo.findByWalletIdAndCurrencyId(
                platformWallet._id,
                btcCurrency._id
            );

        if (!platformNgnAccount || !platformBtcAccount || !platformBtcAccount._id) {
            throw new ServiceError('Platform wallet accounts not found');
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

            // 5. Credit user's BTC wallet - Transaction confirmed, safe to credit
            const userBtcBalance = parseFloat(userBtcAccount.balance?.toString() || '0');
            const userBtcAvailable = parseFloat(userBtcAccount.available_balance?.toString() || '0');
            const cryptoAmount = parseFloat(order.crypto_amount?.toString() || '0'); // Ensure it's a number

            await this.walletAccountRepo.updateBalance(
                userBtcAccount._id!,
                userBtcBalance + cryptoAmount,
                userBtcAvailable + cryptoAmount,
                parseFloat(userBtcAccount.locked_balance?.toString() || '0')
            );

            // 6. Create UTXOs for user address so they can sell later
            // This is critical - without UTXOs, users can't create sell orders
            // This runs in background job when transaction is confirmed, so it's more reliable than webhooks
            if (order.bitcoin_tx_hash_outgoing && userBtcAccount.address && userBtcAccount._id) {
                try {
                    Console.info('Creating UTXOs for user address via background job', {
                        orderId,
                        address: userBtcAccount.address,
                        txHash: order.bitcoin_tx_hash_outgoing
                    });

                    // Get transaction details from blockchain to find outputs
                    // We need to fetch the full transaction to see which outputs went to user address
                    const container = DIContainer.getInstance();
                    const utxoManagerService = container.get<IUTXOManagerService>(TYPES.UTXOManagerService);
                    
                    // Try to get transaction from blockchain
                    // Use blockchainService's internal httpClient to fetch transaction
                    const httpClient = (this.blockchainService as any).httpClient;
                    const blockstreamClient = (this.blockchainService as any).blockstreamClient;
                    
                    let txData: any = null;
                    let usedBlockstream = false;
                    
                    try {
                        // Try BlockCypher first
                        txData = await httpClient.get(`/txs/${order.bitcoin_tx_hash_outgoing}`);
                    } catch (blockcypherError: any) {
                        // Fallback to Blockstream
                        try {
                            txData = await blockstreamClient.get(`/tx/${order.bitcoin_tx_hash_outgoing}`);
                            usedBlockstream = true;
                        } catch (blockstreamError: any) {
                            Console.warn('Failed to fetch transaction from both APIs for UTXO creation', {
                                orderId,
                                txHash: order.bitcoin_tx_hash_outgoing,
                                blockcypherError: blockcypherError?.message,
                                blockstreamError: blockstreamError?.message
                            });
                        }
                    }
                    
                    if (txData) {
                        // Parse outputs based on API provider
                        let outputs: any[] = [];
                        if (usedBlockstream) {
                            // Blockstream format
                            if (txData.vout && Array.isArray(txData.vout)) {
                                outputs = txData.vout.map((vout: any, index: number) => ({
                                    index,
                                    addresses: vout.scriptpubkey_address ? [vout.scriptpubkey_address] : [],
                                    value: vout.value || 0,
                                    spent_by: vout.spent ? [{ txid: 'spent' }] : []
                                }));
                            }
                        } else {
                            // BlockCypher format
                            outputs = txData.outputs || [];
                        }
                        
                        // Find all outputs that went to user address
                        let utxosCreated = 0;
                        for (let i = 0; i < outputs.length; i++) {
                            const output = outputs[i];
                            const outputAddresses = output.addresses || [];
                            
                            if (outputAddresses.includes(userBtcAccount.address)) {
                                // Check if this output is already spent
                                const isSpent = output.spent_by && output.spent_by.length > 0;
                                
                                if (!isSpent) {
                                    // Check if UTXO already exists (avoid duplicates)
                                    try {
                                        const existing = await utxoManagerService.createUTXOFromTransaction(
                                            order.bitcoin_tx_hash_outgoing,
                                            i, // vout index
                                            userBtcAccount.address,
                                            userBtcAccount._id
                                        );
                                        
                                        utxosCreated++;
                                        Console.info('UTXO created for user address via background job', {
                                            orderId,
                                            address: userBtcAccount.address,
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
                                address: userBtcAccount.address,
                                utxosCreated,
                                txHash: order.bitcoin_tx_hash_outgoing
                            });
                        } else {
                            Console.warn('No UTXOs created - all outputs may be spent or already exist', {
                                orderId,
                                address: userBtcAccount.address,
                                txHash: order.bitcoin_tx_hash_outgoing
                            });
                        }
                    } else {
                        // Fallback: Try to create UTXO with default vout 0 (most common case)
                        // This is less accurate but better than nothing
                        Console.warn('Could not fetch transaction details, attempting to create UTXO with default vout', {
                            orderId,
                            txHash: order.bitcoin_tx_hash_outgoing
                        });
                        try {
                            await utxoManagerService.createUTXOFromTransaction(
                                order.bitcoin_tx_hash_outgoing,
                                0, // Default to vout 0
                                userBtcAccount.address,
                                userBtcAccount._id
                            );
                            Console.info('UTXO created with default vout', {
                                orderId,
                                address: userBtcAccount.address,
                                txHash: order.bitcoin_tx_hash_outgoing
                            });
                        } catch (utxoError: any) {
                            Console.warn('Failed to create UTXO with default vout, will need manual sync', {
                                orderId,
                                error: utxoError.message
                            });
                        }
                    }
                } catch (error: any) {
                    // Don't fail the order completion if UTXO creation fails
                    // It can be retried later via sync endpoint
                    Console.warn('Error creating UTXOs for user address in background job', {
                        orderId,
                        address: userBtcAccount.address,
                        txHash: order.bitcoin_tx_hash_outgoing,
                        error: error.message
                    });
                }
            } else {
                Console.warn('Cannot create UTXOs - missing transaction hash or user address', {
                    orderId,
                    hasTxHash: !!order.bitcoin_tx_hash_outgoing,
                    hasAddress: !!userBtcAccount.address
                });
            }

            // 7. Update platform BTC balance based on UTXO totals
            if (platformBtcAccount.address && platformBtcAccount._id) {
                try {
                    const availableUTXOs = await this.utxoManagerService.getAvailableUTXOs(platformBtcAccount.address);
                    const totalUTXOAmount = availableUTXOs.reduce((sum, utxo) => {
                        let amount = parseFloat(utxo.amount.toString());
                        // If amount is suspiciously large (> 1), it might be in satoshis - convert to BTC
                        if (amount > 1) {
                            amount = amount / 100000000;
                        }
                        return sum + amount;
                    }, 0);

                    await this.walletAccountRepo.updateBalance(
                        platformBtcAccount._id,
                        totalUTXOAmount,
                        totalUTXOAmount,
                        parseFloat(platformBtcAccount.locked_balance?.toString() || '0')
                    );

                    Console.info('Platform BTC balance updated from UTXOs', {
                        address: platformBtcAccount.address,
                        totalUTXOAmount,
                        utxoCount: availableUTXOs.length
                    });
                } catch (utxoError: any) {
                    Console.warn('Failed to update platform BTC balance from UTXOs', {
                        error: utxoError.message,
                        address: platformBtcAccount.address
                    });
                    // Don't fail the order completion if UTXO balance update fails
                }
            }

            // 8. Update order status to completed
            const updated = await this.tradingOrderRepo.update(orderId, {
                status: 'completed',
                network_fee: order.network_fee || await this.bitcoinTransactionService.calculateNetworkFee('medium'),
                completed_at: new Date().toISOString()
            });

            // Commit transaction
            await this.transactionManager.commit();
            transactionStarted = false;

            // 9. Store change UTXO if transaction was confirmed (outside transaction - can fail without affecting order)
            // Change goes back to platform address, so we need to store it as a new available UTXO
            if (order.bitcoin_tx_hash_outgoing && platformBtcAccount.address) {
                try {
                    const changeUTXO = await this.utxoManagerService.storeChangeUTXO(
                        order.bitcoin_tx_hash_outgoing,
                        platformBtcAccount.address,
                        platformBtcAccount._id
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
     * Complete sell order: Debit BTC, credit NGN
     */
    private async completeSellOrder(orderId: string): Promise<ITradingOrder> {
        const order = await this.tradingOrderRepo.findById(orderId);
        if (!order) throw new ServiceError('Order not found');

        try {
            // 1. Get user's wallet accounts
            const wallet = await this.walletRepo.findByUserId(order.user_id);
            if (!wallet || !wallet._id) {
                throw new ServiceError('User wallet not found');
            }

            const ngnCurrency = await this.currencyRepo.findByCode('NGN');
            const btcCurrency = await this.currencyRepo.findByCode('BTC');
            if (!ngnCurrency?._id || !btcCurrency?._id) {
                throw new ServiceError('Currency not found');
            }

            const userNgnAccount = await this.walletAccountRepo.findByWalletIdAndCurrencyId(wallet._id, ngnCurrency._id);
            const userBtcAccount = await this.walletAccountRepo.findByWalletIdAndCurrencyId(wallet._id, btcCurrency._id);
            
            if (!userNgnAccount || !userBtcAccount || !userBtcAccount._id) {
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
            const platformBtcAccount = await this.walletAccountRepo.findByWalletIdAndCurrencyId(
                platformWallet._id,
                btcCurrency._id
            );

            if (!platformNgnAccount || !platformBtcAccount) {
                throw new ServiceError('Platform wallet accounts not found');
            }

            // 3. Debit user's BTC (unlock and deduct, including fee)
            const cryptoAmount = parseFloat(order.crypto_amount?.toString() || '0');
            const networkFee = parseFloat(order.network_fee?.toString() || '0');
            const totalBtcDeducted = cryptoAmount + networkFee;
            const userBtcLocked = parseFloat(userBtcAccount.locked_balance?.toString() || '0');
            const userBtcBalance = parseFloat(userBtcAccount.balance?.toString() || '0');

            await this.walletAccountRepo.updateBalance(
                userBtcAccount._id!,
                userBtcBalance - totalBtcDeducted,
                (parseFloat(userBtcAccount.available_balance?.toString() || '0') + userBtcLocked) - totalBtcDeducted,
                userBtcLocked - totalBtcDeducted
            );

            // 4. Credit platform's BTC
            const platformBtcBalance = parseFloat(platformBtcAccount.balance?.toString() || '0');
            const platformBtcAvailable = parseFloat(platformBtcAccount.available_balance?.toString() || '0');

            await this.walletAccountRepo.updateBalance(
                platformBtcAccount._id!,
                platformBtcBalance + order.crypto_amount,
                platformBtcAvailable + order.crypto_amount,
                parseFloat(platformBtcAccount.locked_balance?.toString() || '0')
            );

            // 5. Credit user's NGN
            const userNgnBalance = parseFloat(userNgnAccount.balance?.toString() || '0');
            const userNgnAvailable = parseFloat(userNgnAccount.available_balance?.toString() || '0');

            await this.walletAccountRepo.updateBalance(
                userNgnAccount._id!,
                userNgnBalance + order.fiat_amount,
                userNgnAvailable + order.fiat_amount,
                parseFloat(userNgnAccount.locked_balance?.toString() || '0')
            );

            // 6. Debit platform's NGN
            const platformNgnBalance = parseFloat(platformNgnAccount.balance?.toString() || '0');
            const platformNgnAvailable = parseFloat(platformNgnAccount.available_balance?.toString() || '0');

            await this.walletAccountRepo.updateBalance(
                platformNgnAccount._id!,
                platformNgnBalance - order.fiat_amount,
                platformNgnAvailable - order.fiat_amount,
                parseFloat(platformNgnAccount.locked_balance?.toString() || '0')
            );

            // 7. Update order
            const updated = await this.tradingOrderRepo.update(orderId, {
                status: 'completed',
                completed_at: new Date().toISOString()
            });

            Console.info('Sell order completed', {
                orderId,
                userId: order.user_id,
                cryptoAmount: order.crypto_amount,
                fiatAmount: order.fiat_amount,
                txHash: order.bitcoin_tx_hash
            });

            return updated!;
        } catch (error: any) {
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
     * Helper method to unlock balance
     */
    private async unlockBalance(walletAccountId: string, amount: number): Promise<void> {
        const account = await this.walletAccountRepo.findById(walletAccountId);
        if (!account) {
            throw new ServiceError('Wallet account not found');
        }

        const currentLocked = parseFloat(account.locked_balance?.toString() || '0');
        const currentAvailable = parseFloat(account.available_balance?.toString() || '0');
        const newLocked = Math.max(0, currentLocked - amount);
        const newAvailable = currentAvailable + (currentLocked - newLocked);

        await this.walletAccountRepo.updateBalance(
            walletAccountId,
            parseFloat(account.balance?.toString() || '0'),
            newAvailable,
            newLocked
        );
    }
}

