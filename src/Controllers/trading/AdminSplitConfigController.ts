import { Request, Response } from 'express';
import { inject } from 'inversify';
import { controller, httpGet, httpPut, request, requestBody, response } from 'inversify-express-utils';
import { API_PATH, TYPES } from '../../Core/Types/Constants';
import { ISplitConfigService } from '../../Core/Application/Interface/Services/ISplitConfigService';
import AuthMiddleware from '../../Middleware/AuthMiddleware';
import { BaseController } from '../BaseController';
import { validationMiddleware } from '../../Middleware/ValidationMiddleware';
import { UpsertSplitConfigDTO } from '../../Core/Application/DTOs/SplitConfigDTO';
import { IUser } from '../../Core/Application/Interface/Entities/auth-and-user/IUser';

@controller(`/${API_PATH}/admin/split-config`)
export class AdminSplitConfigController extends BaseController {
    constructor(
        @inject(TYPES.SplitConfigService) private readonly splitConfigService: ISplitConfigService
    ) {
        super();
    }

    /**
     * @route GET /api/v1/admin/split-config
     */
    @httpGet('/', AuthMiddleware.authenticateAdmin())
    async getSplitConfig(@request() _req: Request, @response() res: Response) {
        try {
            const config = await this.splitConfigService.getResolved();
            return this.success(res, config, 'Split config retrieved');
        } catch (error: any) {
            return this.error(res, error.message, error.statusCode || 400, error);
        }
    }

    /**
     * @route PUT /api/v1/admin/split-config
     */
    @httpPut('/', AuthMiddleware.authenticateAdmin(), validationMiddleware(UpsertSplitConfigDTO))
    async upsertSplitConfig(
        @requestBody() dto: UpsertSplitConfigDTO,
        @request() req: Request,
        @response() res: Response
    ) {
        try {
            const admin = req.user as IUser;
            const config = await this.splitConfigService.upsert(admin._id!, {
                platform_fee_percentage: dto.platform_fee_percentage,
                btc_network_fee: dto.btc_network_fee,
                eth_network_fee: dto.eth_network_fee
            });
            return this.success(res, config, 'Split config saved');
        } catch (error: any) {
            return this.error(res, error.message, error.statusCode || 400, error);
        }
    }
}
