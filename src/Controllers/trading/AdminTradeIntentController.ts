import { Request, Response } from 'express';
import { inject } from 'inversify';
import {
    controller,
    httpGet,
    httpPost,
    queryParam,
    request,
    requestBody,
    requestParam,
    response
} from 'inversify-express-utils';
import { API_PATH, TYPES } from '../../Core/Types/Constants';
import { ITradeIntentService } from '../../Core/Application/Interface/Services/ITradeIntentService';
import AuthMiddleware from '../../Middleware/AuthMiddleware';
import { BaseController } from '../BaseController';
import { validationMiddleware } from '../../Middleware/ValidationMiddleware';
import {
    AdminConfirmFiatPayoutDTO,
    AdminConfirmIntentDTO,
    AdminPayoutIntentDTO,
    AdminReleaseCryptoDTO,
    AdminVerifyFiatDTO
} from '../../Core/Application/DTOs/TradeIntentDTO';
import { IUser } from '../../Core/Application/Interface/Entities/auth-and-user/IUser';

@controller(`/${API_PATH}/admin/trade-intents`)
export class AdminTradeIntentController extends BaseController {
    constructor(@inject(TYPES.TradeIntentService) private readonly tradeIntentService: ITradeIntentService) {
        super();
    }

    @httpGet('/', AuthMiddleware.authenticateAdmin())
    async listIntents(
        @queryParam('status') status: string,
        @queryParam('type') type: string,
        @queryParam('crypto_type') cryptoType: string,
        @queryParam('user_id') userId: string,
        @queryParam('date_from') dateFrom: string,
        @queryParam('date_to') dateTo: string,
        @queryParam('limit') limit: string,
        @queryParam('offset') offset: string,
        @response() res: Response
    ) {
        try {
            const result = await this.tradeIntentService.adminListIntents({
                status,
                type,
                crypto_type: cryptoType,
                user_id: userId,
                date_from: dateFrom,
                date_to: dateTo,
                limit: limit ? parseInt(limit, 10) : 50,
                offset: offset ? parseInt(offset, 10) : 0
            });
            return this.success(res, result, 'Trade intents retrieved');
        } catch (error: any) {
            return this.error(res, error.message, error.statusCode || 400, error);
        }
    }

    @httpPost('/confirm', AuthMiddleware.authenticateAdmin(), validationMiddleware(AdminConfirmIntentDTO))
    async confirmIntent(@requestBody() dto: AdminConfirmIntentDTO, @request() req: Request, @response() res: Response) {
        try {
            const admin = req.user as IUser;
            const intent = await this.tradeIntentService.adminConfirmIntent(admin._id!, dto);
            return this.success(res, intent, 'Trade intent confirmed');
        } catch (error: any) {
            return this.error(res, error.message, error.statusCode || 400, error);
        }
    }

    @httpPost('/payout', AuthMiddleware.authenticateAdmin(), validationMiddleware(AdminPayoutIntentDTO))
    async payoutIntent(@requestBody() dto: AdminPayoutIntentDTO, @request() req: Request, @response() res: Response) {
        try {
            const admin = req.user as IUser;
            const result = await this.tradeIntentService.adminPayoutIntent(admin._id!, dto);
            return this.success(res, result, 'Trade intent payout completed');
        } catch (error: any) {
            return this.error(res, error.message, error.statusCode || 400, error);
        }
    }

    @httpGet('/:id/payout-status', AuthMiddleware.authenticateAdmin())
    async getPayoutStatus(@requestParam('id') id: string, @response() res: Response) {
        try {
            const status = await this.tradeIntentService.getPayoutStatus(id);
            return this.success(res, status, 'Payout status retrieved');
        } catch (error: any) {
            return this.error(res, error.message, error.statusCode || 400, error);
        }
    }

    @httpGet('/:id', AuthMiddleware.authenticateAdmin())
    async getIntent(@requestParam('id') id: string, @response() res: Response) {
        try {
            const intent = await this.tradeIntentService.getIntentById(id);
            if (!intent) {
                return this.error(res, 'Trade intent not found', 404);
            }
            return this.success(res, intent, 'Trade intent retrieved');
        } catch (error: any) {
            return this.error(res, error.message, error.statusCode || 400);
        }
    }

    @httpPost('/:id/verify-fiat', AuthMiddleware.authenticateAdmin(), validationMiddleware(AdminVerifyFiatDTO))
    async verifyFiat(
        @requestParam('id') id: string,
        @requestBody() dto: AdminVerifyFiatDTO,
        @request() req: Request,
        @response() res: Response
    ) {
        try {
            const admin = req.user as IUser;
            const intent = await this.tradeIntentService.adminVerifyFiat(admin._id!, id, dto.admin_notes);
            return this.success(res, intent, 'Fiat payment verified');
        } catch (error: any) {
            return this.error(res, error.message, error.statusCode || 400);
        }
    }

    @httpPost('/:id/confirm-fiat-payout', AuthMiddleware.authenticateAdmin(), validationMiddleware(AdminConfirmFiatPayoutDTO))
    async confirmFiatPayout(
        @requestParam('id') id: string,
        @requestBody() dto: AdminConfirmFiatPayoutDTO,
        @request() req: Request,
        @response() res: Response
    ) {
        try {
            const admin = req.user as IUser;
            const intent = await this.tradeIntentService.adminConfirmFiatPayout(
                admin._id!,
                id,
                dto.admin_notes,
                dto.actual_gas_ngn
            );
            return this.success(res, intent, 'Fiat payout confirmed');
        } catch (error: any) {
            return this.error(res, error.message, error.statusCode || 400);
        }
    }

    @httpPost('/:id/release-crypto', AuthMiddleware.authenticateAdmin(), validationMiddleware(AdminReleaseCryptoDTO))
    async releaseCrypto(
        @requestParam('id') id: string,
        @requestBody() dto: AdminReleaseCryptoDTO,
        @request() req: Request,
        @response() res: Response
    ) {
        try {
            const admin = req.user as IUser;
            const intent = await this.tradeIntentService.adminReleaseCrypto(admin._id!, id, dto.admin_notes);
            return this.success(res, intent, 'Crypto released on-chain');
        } catch (error: any) {
            return this.error(res, error.message, error.statusCode || 400);
        }
    }
}
