import { Request, Response } from 'express';
import { inject } from 'inversify';
import { controller, httpPost, request, response } from 'inversify-express-utils';
import { API_PATH, TYPES } from '../../Core/Types/Constants';
import { IWalletService } from '../../Core/Application/Interface/Services/IWalletService';
import AuthMiddleware from '../../Middleware/AuthMiddleware';
import { BaseController } from '../BaseController';
import { validationMiddleware } from '../../Middleware/ValidationMiddleware';
import { SyncWalletDTO } from '../../Core/Application/DTOs/WalletSyncDTO';
import { IUser } from '../../Core/Application/Interface/Entities/auth-and-user/IUser';

@controller(`/${API_PATH}/wallet`)
export class WalletSyncController extends BaseController {
    constructor(@inject(TYPES.WalletService) private readonly walletService: IWalletService) {
        super();
    }

    /**
     * On-demand sync of confirmed Thresh0ld deposits for a user address.
     * @route POST /api/v1/wallet/sync
     */
    @httpPost('/sync', AuthMiddleware.authenticate(), validationMiddleware(SyncWalletDTO))
    async syncWallet(@request() req: Request, @response() res: Response) {
        try {
            const user = req.user as IUser;
            if (!user._id) {
                return this.error(res, 'User not authenticated', 401);
            }
            const result = await this.walletService.syncUserWallet(user._id, req.body.asset);
            return this.success(res, result, 'Wallet sync completed');
        } catch (error: any) {
            return this.error(res, error.message, error.statusCode || 400, error);
        }
    }
}
