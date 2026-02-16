import { Request, Response } from 'express';
import { inject } from 'inversify';
import { controller, httpPost, httpGet, request, response, requestBody, requestParam, queryParam } from 'inversify-express-utils';
import { API_PATH, TYPES } from '../../Core/Types/Constants';
import { ITradingOrderService } from '../../Core/Application/Interface/Services/ITradingOrderService';
import { IBlockchainService } from '../../Core/Application/Interface/Services/IBlockchainService';
import { IOrderCompletionJob } from '../../Core/Application/Interface/Services/IOrderCompletionJob';
import { ITradingOrderRepository } from '../../Core/Application/Interface/Repositories/ITradingOrderRepository';
import { ITradingOrder, TradingOrderStatus, TradingOrderType } from '../../Core/Application/Interface/Entities/trading/ITradingOrder';
import AuthMiddleware from '../../Middleware/AuthMiddleware';
import { BaseController } from '../BaseController';
import { validationMiddleware } from '../../Middleware/ValidationMiddleware';
import { CompleteBuyOrderDTO } from '../../Core/Application/DTOs/TradingOrderDTO';

/**
 * Admin Trading Order Controller
 * Handles admin-only operations for trading orders
 */
@controller(`/${API_PATH}/admin/trading-orders`)
export class AdminTradingOrderController extends BaseController {
    constructor(
        @inject(TYPES.TradingOrderService) private readonly tradingOrderService: ITradingOrderService,
        @inject(TYPES.BlockchainService) private readonly blockchainService: IBlockchainService,
        @inject(TYPES.OrderCompletionJob) private readonly orderCompletionJob: IOrderCompletionJob,
        @inject(TYPES.TradingOrderRepository) private readonly tradingOrderRepo: ITradingOrderRepository
    ) {
        super();
    }

    /**
     * Manually complete a pending buy order (admin only)
     * Verifies transaction confirmation and completes the order
     * Useful for completing orders that were broadcast but webhook didn't trigger
     * @route POST /api/v1/admin/trading-orders/complete-buy
     */
    @httpPost('/complete-buy', AuthMiddleware.authenticateAdmin(), validationMiddleware(CompleteBuyOrderDTO))
    async manuallyCompleteBuyOrder(
        @requestBody() dto: CompleteBuyOrderDTO,
        @request() req: Request,
        @response() res: Response
    ) {
        try {
            // Get the order first
            const order = await this.tradingOrderService.getOrderById(dto.order_id);
            
            if (!order) {
                return this.error(res, 'Order not found', 404);
            }

            if (order.type !== 'buy') {
                return this.error(res, 'This endpoint is only for buy orders', 400);
            }

            if (order.status === 'completed') {
                return this.success(res, order, 'Order is already completed');
            }

            // Allow both 'pending' and 'processing' orders to be completed
            if (order.status !== 'processing' && order.status !== 'pending') {
                return this.error(res, 
                    `Cannot complete order with status: ${order.status}. Only 'pending' or 'processing' orders can be completed.`, 
                    400
                );
            }

            if (!order.bitcoin_tx_hash_outgoing) {
                return this.error(res, 
                    'Order does not have an outgoing transaction hash. Cannot complete.', 
                    400
                );
            }

            // Verify transaction on blockchain
            const txVerification = await this.blockchainService.verifyTransaction(order.bitcoin_tx_hash_outgoing);
            
            if (!txVerification) {
                return this.error(res, 
                    `Transaction ${order.bitcoin_tx_hash_outgoing} not found on blockchain`, 
                    404
                );
            }

            if (!txVerification.confirmed) {
                return this.error(res, 
                    `Transaction is not confirmed yet. Current confirmations: ${txVerification.confirmations}. ` +
                    `Please wait for at least 1 confirmation before completing the order.`,
                    400
                );
            }

            // Complete the order
            const completedOrder = await this.tradingOrderService.completeBuyOrderAfterConfirmation(dto.order_id);
            
            return this.success(res, {
                order: completedOrder,
                transaction: {
                    hash: order.bitcoin_tx_hash_outgoing,
                    confirmations: txVerification.confirmations,
                    confirmed: txVerification.confirmed,
                    amount: txVerification.amount,
                    to: txVerification.to
                }
            }, 'Buy order completed successfully');
        } catch (error: any) {
            return this.error(res, error.message, error.statusCode || 400);
        }
    }

    /**
     * Manually trigger the order completion job (admin only)
     * Useful for debugging and immediate processing
     * @route POST /api/v1/admin/trading-orders/trigger-completion-job
     */
    @httpPost('/trigger-completion-job', AuthMiddleware.authenticateAdmin())
    async triggerCompletionJob(
        @request() req: Request,
        @response() res: Response
    ) {
        try {
            await this.orderCompletionJob.processPendingOrders();
            return this.success(res, { message: 'Order completion job executed successfully' }, 'Job executed successfully');
        } catch (error: any) {
            return this.error(res, error.message, error.statusCode || 400);
        }
    }

    /**
     * Check transaction status on blockchain (admin only)
     * @route GET /api/v1/admin/trading-orders/check-transaction/:txHash
     */
    @httpGet('/check-transaction/:txHash', AuthMiddleware.authenticateAdmin())
    async checkTransaction(
        @requestParam('txHash') txHash: string,
        @request() req: Request,
        @response() res: Response
    ) {
        try {
            const verification = await this.blockchainService.verifyTransaction(txHash);
            
            if (!verification) {
                return this.error(res, 'Transaction not found on blockchain', 404);
            }

            return this.success(res, {
                txHash,
                confirmed: verification.confirmed,
                confirmations: verification.confirmations,
                amount: verification.amount,
                to: verification.to
            }, 'Transaction status retrieved successfully');
        } catch (error: any) {
            return this.error(res, error.message, error.statusCode || 400);
        }
    }

    /**
     * Get all orders with filters (admin only)
     * Filterable by userId, status, and type
     * @route GET /api/v1/admin/trading-orders
     */
    @httpGet('/', AuthMiddleware.authenticateAdmin())
    async getAllOrders(
        @queryParam('userId') userId: string,
        @queryParam('status') status: string,
        @queryParam('type') type: string,
        @queryParam('limit') limit: string,
        @queryParam('offset') offset: string,
        @request() req: Request,
        @response() res: Response
    ) {
        try {
            const limitNum = limit ? parseInt(limit, 10) : 50;
            const offsetNum = offset ? parseInt(offset, 10) : 0;

            // Validate limit and offset
            if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
                return this.error(res, 'Limit must be between 1 and 100', 400);
            }
            if (isNaN(offsetNum) || offsetNum < 0) {
                return this.error(res, 'Offset must be a non-negative number', 400);
            }

            // Build filters with proper types
            const filters: {
                userId?: string;
                status?: TradingOrderStatus;
                type?: TradingOrderType;
            } = {};

            if (userId) {
                filters.userId = userId;
            }

            if (status) {
                // Validate status
                const validStatuses: TradingOrderStatus[] = ['pending', 'processing', 'completed', 'failed', 'cancelled'];
                const normalizedStatus = status.toLowerCase() as TradingOrderStatus;
                if (!validStatuses.includes(normalizedStatus)) {
                    return this.error(res, 
                        `Invalid status. Must be one of: ${validStatuses.join(', ')}`, 
                        400
                    );
                }
                filters.status = normalizedStatus;
            }

            if (type) {
                // Validate type
                const validTypes: TradingOrderType[] = ['buy', 'sell'];
                const normalizedType = type.toLowerCase() as TradingOrderType;
                if (!validTypes.includes(normalizedType)) {
                    return this.error(res, 
                        `Invalid type. Must be one of: ${validTypes.join(', ')}`, 
                        400
                    );
                }
                filters.type = normalizedType;
            }

            // Get orders with filters
            const orders = await this.tradingOrderRepo.findWithFilters(filters, limitNum, offsetNum);

            // Get total count for pagination
            const countFilters: Partial<ITradingOrder> = {};
            if (filters.userId) countFilters.user_id = filters.userId;
            if (filters.status) countFilters.status = filters.status as any;
            if (filters.type) countFilters.type = filters.type as any;
            const totalCount = await this.tradingOrderRepo.count(countFilters);

            return this.success(res, {
                orders,
                pagination: {
                    total: totalCount,
                    limit: limitNum,
                    offset: offsetNum,
                    hasMore: offsetNum + limitNum < totalCount
                },
                filters: filters
            }, 'Orders retrieved successfully');
        } catch (error: any) {
            return this.error(res, error.message, error.statusCode || 400);
        }
    }
}

