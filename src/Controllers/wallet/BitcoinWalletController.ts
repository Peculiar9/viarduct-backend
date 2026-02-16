import { Request, Response } from 'express';
import { inject } from 'inversify';
import { controller, httpGet, request, response } from 'inversify-express-utils';
import { API_PATH, TYPES } from '../../Core/Types/Constants';
import { IWalletService } from '../../Core/Application/Interface/Services/IWalletService';
import AuthMiddleware from '../../Middleware/AuthMiddleware';
import { BaseController } from '../BaseController';
import { IUser } from '../../Core/Application/Interface/Entities/auth-and-user/IUser';

@controller(`/${API_PATH}/wallet`)
export class BitcoinWalletController extends BaseController {
    constructor(
        @inject(TYPES.WalletService) private readonly walletService: IWalletService
    ) {
        super();
    }

    /**
     * Get or generate Bitcoin address for authenticated user
     * @route GET /api/v1/wallet/bitcoin/address
     */
    @httpGet('/bitcoin/address', AuthMiddleware.authenticate())
    async getBitcoinAddress(
        @request() req: Request,
        @response() res: Response
    ) {
        try {
            const user = req.user as IUser;
            if (!user._id) {
                return this.error(res, 'User not authenticated', 401);
            }

            const address = await this.walletService.generateBitcoinAddress(user._id);
            
            return this.success(res, { address }, 'Bitcoin address retrieved successfully');
        } catch (error: any) {
            console.error('Error getting Bitcoin address:', error);
            return this.error(res, error.message, error.statusCode || 400);
        }
    }
}

