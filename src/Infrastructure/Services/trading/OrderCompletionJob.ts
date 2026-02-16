import { inject, injectable } from 'inversify';
import { TYPES } from '../../../Core/Types/Constants';
import { IOrderCompletionJob } from '../../../Core/Application/Interface/Services/IOrderCompletionJob';
import { ITradingOrderRepository } from '../../../Core/Application/Interface/Repositories/ITradingOrderRepository';
import { ITradingOrderService } from '../../../Core/Application/Interface/Services/ITradingOrderService';
import { IBlockchainService } from '../../../Core/Application/Interface/Services/IBlockchainService';
import { Console } from '../../Utils/Console';
import { EnvironmentConfig } from '../../Config/EnvironmentConfig';

@injectable()
export class OrderCompletionJob implements IOrderCompletionJob {
    private intervalId: NodeJS.Timeout | null = null;
    private isRunning: boolean = false;
    private readonly intervalMinutes: number;

    constructor(
        @inject(TYPES.TradingOrderRepository) private readonly tradingOrderRepo: ITradingOrderRepository,
        @inject(TYPES.TradingOrderService) private readonly tradingOrderService: ITradingOrderService,
        @inject(TYPES.BlockchainService) private readonly blockchainService: IBlockchainService
    ) {
        // Get interval from environment (default: 1 minute for faster processing)
        this.intervalMinutes = EnvironmentConfig.getNumber('ORDER_COMPLETION_JOB_INTERVAL_MINUTES', 1);
    }

    /**
     * Start the background job
     */
    start(): void {
        if (this.intervalId) {
            Console.warn('Order completion job is already running');
            return;
        }

        const intervalMs = this.intervalMinutes * 60 * 1000;
        
        Console.info('🚀 STARTING ORDER COMPLETION JOB', {
            intervalMinutes: this.intervalMinutes,
            intervalMs
        });

        // Run immediately on start, then on interval
        this.processPendingOrders().catch(error => {
            Console.error(error, { message: 'Error in initial order completion job run' });
        });

        this.intervalId = setInterval(() => {
            this.processPendingOrders().catch(error => {
                Console.error(error, { message: 'Error in order completion job' });
            });
        }, intervalMs);
    }

    /**
     * Stop the background job
     */
    stop(): void {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
            Console.info('Order completion background job stopped');
        }
    }

    /**
     * Process pending orders once
     * Finds all processing orders with transaction hashes and completes them if confirmed
     */
    async processPendingOrders(): Promise<void> {
        if (this.isRunning) {
            Console.warn('Order completion job is already running, skipping this cycle');
            return;
        }

        this.isRunning = true;
        const startTime = Date.now();

        try {
            Console.info('🔄 ORDER COMPLETION JOB: Starting job cycle...');

            // Find all processing orders with transaction hashes
            const processingOrders = await this.tradingOrderRepo.findByStatus('processing', 1000);
            
            // Also find failed orders with transaction hashes (to retry them)
            const failedOrders = await this.tradingOrderRepo.findByStatus('failed', 1000);
            const failedOrdersWithTxHash = failedOrders.filter(order => {
                const txHash = order.type === 'buy' 
                    ? order.bitcoin_tx_hash_outgoing 
                    : order.bitcoin_tx_hash;
                return !!txHash;
            });

            const allOrdersToCheck = [...processingOrders, ...failedOrdersWithTxHash];
            
            if (allOrdersToCheck.length === 0) {
                Console.info('✅ ORDER COMPLETION JOB: No orders to check (processing or failed with tx hash)');
                return;
            }

            Console.info(`📋 ORDER COMPLETION JOB: Found ${processingOrders.length} processing orders and ${failedOrdersWithTxHash.length} failed orders with transaction hashes to retry`);

            let completedCount = 0;
            let failedCount = 0;
            let skippedCount = 0;
            let retriedCount = 0;

            for (const order of allOrdersToCheck) {
                const isRetry = order.status === 'failed';
                if (isRetry) {
                    retriedCount++;
                    Console.info('🔄 ORDER COMPLETION JOB: Retrying failed order', {
                        orderId: order._id,
                        txHash: order.type === 'buy' ? order.bitcoin_tx_hash_outgoing : order.bitcoin_tx_hash
                    });
                }
                try {
                    // Get transaction hash based on order type
                    const txHash = order.type === 'buy' 
                        ? order.bitcoin_tx_hash_outgoing 
                        : order.bitcoin_tx_hash;

                    if (!txHash) {
                        Console.warn('Order has no transaction hash, skipping', {
                            orderId: order._id,
                            type: order.type
                        });
                        skippedCount++;
                        continue;
                    }

                    // Verify transaction on blockchain
                    Console.info('🔍 ORDER COMPLETION JOB: Verifying transaction for order', {
                        orderId: order._id,
                        txHash,
                        type: order.type
                    });

                    const txVerification = await this.blockchainService.verifyTransaction(txHash);
                    
                    if (!txVerification) {
                        Console.warn('Transaction not found on blockchain (will retry on next cycle)', {
                            orderId: order._id,
                            txHash,
                            type: order.type
                        });
                        skippedCount++;
                        continue;
                    }

                    Console.info('📊 ORDER COMPLETION JOB: Transaction verification result', {
                        orderId: order._id,
                        txHash,
                        confirmed: txVerification.confirmed,
                        confirmations: txVerification.confirmations,
                        amount: txVerification.amount,
                        to: txVerification.to
                    });

                    if (!txVerification.confirmed) {
                        Console.info('⏳ ORDER COMPLETION JOB: Transaction not confirmed yet, will check again later', {
                            orderId: order._id,
                            txHash,
                            confirmations: txVerification.confirmations,
                            type: order.type
                        });
                        skippedCount++;
                        continue;
                    }

                    // Transaction is confirmed! Complete the order
                    Console.info('✅ ORDER COMPLETION JOB: Transaction confirmed! Completing order...', {
                        orderId: order._id,
                        txHash,
                        confirmations: txVerification.confirmations,
                        type: order.type
                    });

                    if (order.type === 'buy') {
                        await this.tradingOrderService.completeBuyOrderAfterConfirmation(order._id!);
                        Console.info('🎉 ORDER COMPLETION JOB: Buy order completed successfully!', {
                            orderId: order._id,
                            txHash,
                            confirmations: txVerification.confirmations
                        });
                    } else {
                        // For sell orders, we need to process them
                        await this.tradingOrderService.processSellOrder(order._id!, txHash);
                        Console.info('🎉 ORDER COMPLETION JOB: Sell order completed successfully!', {
                            orderId: order._id,
                            txHash,
                            confirmations: txVerification.confirmations
                        });
                    }

                    completedCount++;
                } catch (error: any) {
                    Console.error(error, {
                        message: 'Failed to process order in background job',
                        orderId: order._id,
                        type: order.type
                    });
                    failedCount++;
                }
            }

            const duration = Date.now() - startTime;
            Console.info('✅ ORDER COMPLETION JOB: Job cycle finished', {
                totalOrders: allOrdersToCheck.length,
                processingOrders: processingOrders.length,
                retriedFailedOrders: retriedCount,
                completed: completedCount,
                failed: failedCount,
                skipped: skippedCount,
                durationMs: duration
            });
        } catch (error: any) {
            Console.error(error, { message: 'Error in order completion job cycle' });
        } finally {
            this.isRunning = false;
        }
    }
}

