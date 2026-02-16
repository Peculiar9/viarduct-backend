import { Request, Response } from 'express';
import { inject } from 'inversify';
import { controller, httpGet, request, response, requestParam } from 'inversify-express-utils';
import { API_PATH, TYPES } from '../../Core/Types/Constants';
import { ITradingRateService } from '../../Core/Application/Interface/Services/ITradingRateService';
import { BaseController } from '../BaseController';

/**
 * Public Trading Rate Controller
 * No authentication required - anyone can view trading rates
 */
@controller(`/${API_PATH}/trading-rates`)
export class PublicTradingRateController extends BaseController {
    constructor(
        @inject(TYPES.TradingRateService) private readonly tradingRateService: ITradingRateService
    ) {
        super();
    }

    /**
     * Get active trading rate for a crypto type (public endpoint)
     * @route GET /api/v1/trading-rates/active?crypto_type=BTC
     */
    @httpGet('/active')
    async getActiveRate(@request() req: Request, @response() res: Response) {
        try {
            const cryptoType = (req.query.crypto_type as string) || 'BTC';
            const rate = await this.tradingRateService.getActiveRate(cryptoType.toUpperCase());
            return this.success(res, rate, 'Active trading rate retrieved successfully');
        } catch (error: any) {
            return this.error(res, error.message, error.statusCode || 400);
        }
    }

    /**
     * Get all trading rates (public endpoint)
     * @route GET /api/v1/trading-rates
     */
    @httpGet('/')
    async getAllRates(@request() req: Request, @response() res: Response) {
        try {
            const rates = await this.tradingRateService.getAllRates();
            return this.success(res, rates, 'Trading rates retrieved successfully');
        } catch (error: any) {
            return this.error(res, error.message, error.statusCode || 400);
        }
    }

    /**
     * Get trading rate by ID (public endpoint)
     * @route GET /api/v1/trading-rates/:id
     */
    @httpGet('/:id')
    async getRateById(
        @requestParam('id') id: string,
        @request() req: Request,
        @response() res: Response
    ) {
        try {
            const rate = await this.tradingRateService.getRateById(id);
            return this.success(res, rate, 'Trading rate retrieved successfully');
        } catch (error: any) {
            return this.error(res, error.message, error.statusCode || 400);
        }
    }
}

