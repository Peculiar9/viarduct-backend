import { Request, Response } from 'express';
import { controller, httpGet, request, response } from 'inversify-express-utils';
import { inject } from 'inversify';
import { API_PATH, TYPES } from '../../Core/Types/Constants';
import { CurrencyRepository } from '../../Infrastructure/Repository/SQL/wallet/CurrencyRepository';
import { BaseController } from '../BaseController';

/**
 * Public currency list (no auth).
 * Filterable by type (fiat | crypto) and name (partial match).
 */
@controller(`/${API_PATH}/currencies`)
export class CurrencyController extends BaseController {
    constructor(
        @inject(TYPES.CurrencyRepository) private readonly currencyRepository: CurrencyRepository
    ) {
        super();
    }

    @httpGet('/')
    async list(@request() req: Request, @response() res: Response) {
        try {
            const type = req.query.type as 'fiat' | 'crypto' | undefined;
            const name = req.query.name as string | undefined;
            const filters: { type?: 'fiat' | 'crypto'; name?: string } = {};
            if (type === 'fiat' || type === 'crypto') filters.type = type;
            if (name != null && String(name).trim() !== '') filters.name = String(name).trim();
            const currencies = await this.currencyRepository.findWithFilters(filters);
            return this.success(res, currencies, 'Success');
        } catch (error: any) {
            return this.error(res, error.message, error.statusCode || 400, error);
        }
    }
}
