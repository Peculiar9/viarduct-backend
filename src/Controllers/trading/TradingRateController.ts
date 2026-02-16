import { Request, Response } from 'express';
import { inject } from 'inversify';
import { controller, httpPost, httpPatch, request, response, requestBody, requestParam } from 'inversify-express-utils';
import { API_PATH, TYPES } from '../../Core/Types/Constants';
import { ITradingRateService } from '../../Core/Application/Interface/Services/ITradingRateService';
import AuthMiddleware from '../../Middleware/AuthMiddleware';
import { BaseController } from '../BaseController';
import { validationMiddleware } from '../../Middleware/ValidationMiddleware';
import { CreateTradingRateDTO, UpdateTradingRateDTO } from '../../Core/Application/DTOs/TradingRateDTO';
import { IUser } from '../../Core/Application/Interface/Entities/auth-and-user/IUser';

/**
 * Admin Trading Rate Controller
 * Only write operations (create, update) - requires admin authentication
 */
@controller(`/${API_PATH}/admin/trading-rates`)
export class TradingRateController extends BaseController {
    constructor(
        @inject(TYPES.TradingRateService) private readonly tradingRateService: ITradingRateService
    ) {
        super();
    }

    /**
     * Create new trading rate (admin only)
     * @route POST /api/v1/admin/trading-rates
     */
    @httpPost('/', AuthMiddleware.authenticateAdmin(), validationMiddleware(CreateTradingRateDTO))
    async createRate(
        @requestBody() dto: CreateTradingRateDTO,
        @request() req: Request,
        @response() res: Response
    ) {
        try {
            const user = req.user as IUser;
            const rate = await this.tradingRateService.createRate({
                ...dto,
                updated_by: user._id!
            });
            return this.success(res, rate, 'Trading rate created successfully');
        } catch (error: any) {
            return this.error(res, error.message, error.statusCode || 400);
        }
    }

    /**
     * Update trading rate (admin only)
     * Can be used to update rates or deactivate by setting is_active to false
     * @route PATCH /api/v1/admin/trading-rates/:id
     */
    @httpPatch('/:id', AuthMiddleware.authenticateAdmin(), validationMiddleware(UpdateTradingRateDTO))
    async updateRate(
        @requestParam('id') id: string,
        @requestBody() dto: UpdateTradingRateDTO,
        @request() req: Request,
        @response() res: Response
    ) {
        try {
            const user = req.user as IUser;
            const rate = await this.tradingRateService.updateRate(id, dto, user._id!);
            return this.success(res, rate, 'Trading rate updated successfully');
        } catch (error: any) {
            return this.error(res, error.message, error.statusCode || 400);
        }
    }
}

