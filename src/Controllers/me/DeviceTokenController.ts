import { Request, Response } from 'express';
import { inject } from 'inversify';
import {
    controller,
    httpDelete,
    httpPost,
    request,
    requestBody,
    response
} from 'inversify-express-utils';
import { API_PATH, TYPES } from '../../Core/Types/Constants';
import { IUserDeviceTokenService } from '../../Core/Application/Interface/Services/IUserDeviceTokenService';
import AuthMiddleware from '../../Middleware/AuthMiddleware';
import { BaseController } from '../BaseController';
import { validationMiddleware } from '../../Middleware/ValidationMiddleware';
import {
    RegisterDeviceTokenDTO,
    UnregisterDeviceTokenDTO
} from '../../Core/Application/DTOs/DeviceTokenDTO';
import { IUser } from '../../Core/Application/Interface/Entities/auth-and-user/IUser';

@controller(`/${API_PATH}/me/device-tokens`)
export class DeviceTokenController extends BaseController {
    constructor(
        @inject(TYPES.UserDeviceTokenService)
        private readonly deviceTokenService: IUserDeviceTokenService
    ) {
        super();
    }

    /**
     * POST /api/v1/me/device-tokens
     * Register or refresh an FCM device token for the authenticated user.
     */
    @httpPost('/', AuthMiddleware.authenticate(), validationMiddleware(RegisterDeviceTokenDTO))
    async register(
        @requestBody() dto: RegisterDeviceTokenDTO,
        @request() req: Request,
        @response() res: Response
    ) {
        try {
            const user = req.user as IUser;
            const saved = await this.deviceTokenService.register(user._id!, dto);
            return this.success(res, saved, 'Device token registered');
        } catch (error: any) {
            return this.error(res, error.message, error.statusCode || 400, error);
        }
    }

    /**
     * DELETE /api/v1/me/device-tokens
     * Soft-deactivate an FCM device token (e.g. on logout).
     */
    @httpDelete('/', AuthMiddleware.authenticate(), validationMiddleware(UnregisterDeviceTokenDTO))
    async unregister(
        @requestBody() dto: UnregisterDeviceTokenDTO,
        @request() req: Request,
        @response() res: Response
    ) {
        try {
            const user = req.user as IUser;
            await this.deviceTokenService.unregister(user._id!, dto.token);
            return this.success(res, null, 'Device token unregistered');
        } catch (error: any) {
            return this.error(res, error.message, error.statusCode || 400, error);
        }
    }
}
