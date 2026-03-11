import { Request, Response } from 'express';
import { controller, httpGet, httpPost, httpPut, request, response, requestBody } from 'inversify-express-utils';
import { inject } from 'inversify';
import { API_PATH, TYPES } from '../../Core/Types/Constants';
import { ITradingOrderRepository } from '../../Core/Application/Interface/Repositories/ITradingOrderRepository';
import { TransactionRepository } from '../../Infrastructure/Repository/SQL/payment/TransactionRepository';
import { IWithdrawalService } from '../../Core/Application/Interface/Services/IWithdrawalService';
import AuthMiddleware from '../../Middleware/AuthMiddleware';
import { BaseController } from '../BaseController';
import { IUser } from '../../Core/Application/Interface/Entities/auth-and-user/IUser';
import { validationMiddleware } from '../../Middleware/ValidationMiddleware';
import { SetTransactionPinDTO, ChangeTransactionPinDTO } from '../../Core/Application/DTOs/WithdrawalDTO';
import { TradingOrderStatus, TradingOrderType } from '../../Core/Application/Interface/Entities/trading/ITradingOrder';
import { TransactionStatus, TransactionType, RelatedEntityType } from '../../Core/Application/Interface/Entities/payments/IPayment';
import { ResponseMessage } from '../../Core/Application/Response/ResponseFormat';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

/**
 * User-scoped /me endpoints: orders and transactions with filters and pagination.
 */
@controller(`/${API_PATH}/me`)
export class MeController extends BaseController {
    constructor(
        @inject(TYPES.TradingOrderRepository) private readonly tradingOrderRepo: ITradingOrderRepository,
        @inject(TYPES.TransactionRepository) private readonly transactionRepo: TransactionRepository,
        @inject(TYPES.WithdrawalService) private readonly withdrawalService: IWithdrawalService
    ) {
        super();
    }

    /**
     * GET /api/v1/me/orders
     * Query: date_from, date_to, status, type, crypto_type, limit, offset
     */
    @httpGet('/orders', AuthMiddleware.authenticate())
    async getMyOrders(@request() req: Request, @response() res: Response) {
        try {
            const user = req.user as IUser;
            const userId = user._id!;

            const limit = Math.min(
                Math.max(1, parseInt(String(req.query.limit), 10) || DEFAULT_LIMIT),
                MAX_LIMIT
            );
            const offset = Math.max(0, parseInt(String(req.query.offset), 10) || 0);

            const dateFrom = req.query.date_from as string | undefined;
            const dateTo = req.query.date_to as string | undefined;
            const status = req.query.status as TradingOrderStatus | undefined;
            const type = req.query.type as TradingOrderType | undefined;
            const cryptoType = req.query.crypto_type as string | undefined;

            const filters: {
                date_from?: string;
                date_to?: string;
                status?: TradingOrderStatus;
                type?: TradingOrderType;
                crypto_type?: string;
            } = {};
            if (dateFrom) filters.date_from = dateFrom;
            if (dateTo) filters.date_to = dateTo;
            if (status) filters.status = status;
            if (type) filters.type = type;
            if (cryptoType) filters.crypto_type = cryptoType;

            const [orders, total] = await Promise.all([
                this.tradingOrderRepo.findWithFiltersForUser(userId, filters, limit, offset),
                this.tradingOrderRepo.countWithFiltersForUser(userId, filters)
            ]);

            return this.success(res, {
                items: orders,
                total,
                limit,
                offset
            }, ResponseMessage.SUCCESSFUL_REQUEST_MESSAGE);
        } catch (error: any) {
            return this.error(res, error.message, error.statusCode || 500, error);
        }
    }

    /**
     * GET /api/v1/me/transactions
     * Query: date_from, date_to, status, type, currency, related_entity_type, limit, offset
     */
    @httpGet('/transactions', AuthMiddleware.authenticate())
    async getMyTransactions(@request() req: Request, @response() res: Response) {
        try {
            const user = req.user as IUser;
            const userId = user._id!;

            const limit = Math.min(
                Math.max(1, parseInt(String(req.query.limit), 10) || DEFAULT_LIMIT),
                MAX_LIMIT
            );
            const offset = Math.max(0, parseInt(String(req.query.offset), 10) || 0);

            const dateFrom = req.query.date_from as string | undefined;
            const dateTo = req.query.date_to as string | undefined;
            const status = req.query.status as TransactionStatus | string | undefined;
            const type = req.query.type as TransactionType | string | undefined;
            const currency = req.query.currency as string | undefined;
            const relatedEntityType = req.query.related_entity_type as RelatedEntityType | string | undefined;

            const filters: {
                date_from?: string;
                date_to?: string;
                status?: TransactionStatus | string;
                type?: TransactionType | string;
                currency?: string;
                related_entity_type?: RelatedEntityType | string;
            } = {};
            if (dateFrom) filters.date_from = dateFrom;
            if (dateTo) filters.date_to = dateTo;
            if (status) filters.status = status;
            if (type) filters.type = type;
            if (currency) filters.currency = currency;
            if (relatedEntityType) filters.related_entity_type = relatedEntityType;

            const [transactions, total] = await Promise.all([
                this.transactionRepo.findWithFiltersForUser(userId, filters, limit, offset),
                this.transactionRepo.countWithFiltersForUser(userId, filters)
            ]);

            return this.success(res, {
                items: transactions,
                total,
                limit,
                offset
            }, ResponseMessage.SUCCESSFUL_REQUEST_MESSAGE);
        } catch (error: any) {
            return this.error(res, error.message, error.statusCode || 500, error);
        }
    }

    @httpPost('/transaction-pin', AuthMiddleware.authenticate(), validationMiddleware(SetTransactionPinDTO))
    async setTransactionPin(@request() req: Request, @response() res: Response) {
        try {
            const user = req.user as IUser;
            const { pin, confirm_pin } = req.body;
            await this.withdrawalService.setTransactionPin(user._id!, pin, confirm_pin);
            return this.success(res, { message: 'Transaction PIN set successfully' }, 'PIN set successfully');
        } catch (error: any) {
            return this.error(res, error.message, error.statusCode || 400, error);
        }
    }

    @httpPut('/transaction-pin', AuthMiddleware.authenticate(), validationMiddleware(ChangeTransactionPinDTO))
    async changeTransactionPin(@request() req: Request, @response() res: Response) {
        try {
            const user = req.user as IUser;
            const { current_pin, new_pin, confirm_new_pin } = req.body;
            if (new_pin !== confirm_new_pin) {
                return this.error(res, 'New PIN and confirm PIN do not match', 400);
            }
            const valid = await this.withdrawalService.verifyTransactionPin(user._id!, current_pin);
            if (!valid) {
                return this.error(res, 'Invalid current PIN', 400);
            }
            await this.withdrawalService.setTransactionPin(user._id!, new_pin, confirm_new_pin);
            return this.success(res, { message: 'Transaction PIN updated successfully' }, 'PIN updated successfully');
        } catch (error: any) {
            return this.error(res, error.message, error.statusCode || 400, error);
        }
    }
}
