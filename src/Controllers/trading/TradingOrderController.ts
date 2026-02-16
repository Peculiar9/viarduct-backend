import { Request, Response } from 'express';
import { inject } from 'inversify';
import { controller, httpPost, httpGet, httpPatch, request, response, requestBody, requestParam, queryParam } from 'inversify-express-utils';
import { API_PATH, TYPES } from '../../Core/Types/Constants';
import { ITradingOrderService } from '../../Core/Application/Interface/Services/ITradingOrderService';
import { IBlockchainService } from '../../Core/Application/Interface/Services/IBlockchainService';
import AuthMiddleware from '../../Middleware/AuthMiddleware';
import { BaseController } from '../BaseController';
import { validationMiddleware } from '../../Middleware/ValidationMiddleware';
import { CreateBuyOrderDTO, CreateSellOrderDTO, ProcessBuyOrderDTO } from '../../Core/Application/DTOs/TradingOrderDTO';
import { IUser } from '../../Core/Application/Interface/Entities/auth-and-user/IUser';

/**
 * Trading Order Controller
 * Handles buy/sell orders for users
 */
@controller(`/${API_PATH}/trading-orders`)
export class TradingOrderController extends BaseController {
    constructor(
        @inject(TYPES.TradingOrderService) private readonly tradingOrderService: ITradingOrderService
    ) {
        super();
    }

    /**
     * Create buy order (user buys BTC with NGN)
     * @route POST /api/v1/trading-orders/buy
     */
    @httpPost('/buy', AuthMiddleware.authenticate(), validationMiddleware(CreateBuyOrderDTO))
    async createBuyOrder(
        @requestBody() dto: CreateBuyOrderDTO,
        @request() req: Request,
        @response() res: Response
    ) {
        try {
            const user = req.user as IUser;
            const order = await this.tradingOrderService.createBuyOrder(user._id!, dto);
            return this.success(res, order, 'Buy order created successfully');
        } catch (error: any) {
            return this.error(res, error.message, error.statusCode || 400);
        }
    }

    /**
     * Create sell order (user sells BTC for NGN)
     * BTC is automatically sent from user address to platform address
     * @route POST /api/v1/trading-orders/sell
     */
    @httpPost('/sell', AuthMiddleware.authenticate(), validationMiddleware(CreateSellOrderDTO))
    async createSellOrder(
        @requestBody() dto: CreateSellOrderDTO,
        @request() req: Request,
        @response() res: Response
    ) {
        try {
            const user = req.user as IUser;
            const order = await this.tradingOrderService.createSellOrder(user._id!, dto);
            return this.success(res, order, 'Sell order created successfully. BTC transaction has been broadcasted.');
        } catch (error: any) {
            return this.error(res, error.message, error.statusCode || 400);
        }
    }

    /**
     * Get user's orders
     * @route GET /api/v1/trading-orders
     */
    @httpGet('/', AuthMiddleware.authenticate())
    async getUserOrders(
        @queryParam('limit') limit: string,
        @queryParam('offset') offset: string,
        @request() req: Request,
        @response() res: Response
    ) {
        try {
            const user = req.user as IUser;
            const limitNum = limit ? parseInt(limit, 10) : 50;
            const offsetNum = offset ? parseInt(offset, 10) : 0;
            const orders = await this.tradingOrderService.getUserOrders(user._id!, limitNum, offsetNum);
            return this.success(res, orders, 'Orders retrieved successfully');
        } catch (error: any) {
            return this.error(res, error.message, error.statusCode || 400);
        }
    }

    /**
     * Get order by ID
     * @route GET /api/v1/trading-orders/:id
     */
    @httpGet('/:id', AuthMiddleware.authenticate())
    async getOrderById(
        @requestParam('id') orderId: string,
        @request() req: Request,
        @response() res: Response
    ) {
        try {
            const user = req.user as IUser;
            const order = await this.tradingOrderService.getOrderById(orderId, user._id!);
            return this.success(res, order, 'Order retrieved successfully');
        } catch (error: any) {
            return this.error(res, error.message, error.statusCode || 400);
        }
    }

    /**
     * Cancel order
     * @route PATCH /api/v1/trading-orders/:id/cancel
     */
    @httpPatch('/:id/cancel', AuthMiddleware.authenticate())
    async cancelOrder(
        @requestParam('id') orderId: string,
        @request() req: Request,
        @response() res: Response
    ) {
        try {
            const user = req.user as IUser;
            const order = await this.tradingOrderService.cancelOrder(orderId, user._id!);
            return this.success(res, order, 'Order cancelled successfully');
        } catch (error: any) {
            return this.error(res, error.message, error.statusCode || 400);
        }
    }

    /**
     * Process buy order (after payment confirmation)
     * This endpoint can be called by payment webhook or manually by admin
     * @route POST /api/v1/trading-orders/:id/process-buy
     */
    @httpPost('/:id/process-buy', AuthMiddleware.authenticateAdmin(), validationMiddleware(ProcessBuyOrderDTO))
    async processBuyOrder(
        @requestParam('id') orderId: string,
        @requestBody() dto: ProcessBuyOrderDTO,
        @response() res: Response
    ) {
        try {
            const order = await this.tradingOrderService.processBuyOrder(orderId, dto.payment_reference);
            return this.success(res, order, 'Buy order processed successfully');
        } catch (error: any) {
            return this.error(res, error.message, error.statusCode || 400);
        }
    }

}

