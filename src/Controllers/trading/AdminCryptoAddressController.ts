import { Request, Response } from 'express';
import { inject } from 'inversify';
import {
    controller,
    httpDelete,
    httpGet,
    httpPatch,
    httpPost,
    queryParam,
    request,
    requestBody,
    requestParam,
    response
} from 'inversify-express-utils';
import { API_PATH, TYPES } from '../../Core/Types/Constants';
import { IPlatformCryptoAddressService } from '../../Core/Application/Interface/Services/IPlatformCryptoAddressService';
import AuthMiddleware from '../../Middleware/AuthMiddleware';
import { BaseController } from '../BaseController';
import { validationMiddleware } from '../../Middleware/ValidationMiddleware';
import {
    CreatePlatformCryptoAddressDTO,
    UpdatePlatformCryptoAddressDTO
} from '../../Core/Application/DTOs/PlatformCryptoAddressDTO';
import { IUser } from '../../Core/Application/Interface/Entities/auth-and-user/IUser';

@controller(`/${API_PATH}/admin/crypto-addresses`)
export class AdminCryptoAddressController extends BaseController {
    constructor(
        @inject(TYPES.PlatformCryptoAddressService)
        private readonly cryptoAddressService: IPlatformCryptoAddressService
    ) {
        super();
    }

    /**
     * GET /api/v1/admin/crypto-addresses?asset=BTC&is_active=true
     */
    @httpGet('/', AuthMiddleware.authenticateAdmin())
    async list(
        @queryParam('asset') asset: string | undefined,
        @queryParam('is_active') isActiveRaw: string | undefined,
        @response() res: Response
    ) {
        try {
            let is_active: boolean | undefined;
            if (isActiveRaw !== undefined && isActiveRaw !== '') {
                if (isActiveRaw === 'true') is_active = true;
                else if (isActiveRaw === 'false') is_active = false;
            }
            const items = await this.cryptoAddressService.list({ asset, is_active });
            return this.success(res, items, 'Platform crypto addresses retrieved');
        } catch (error: any) {
            return this.error(res, error.message, error.statusCode || 400, error);
        }
    }

    @httpPost('/', AuthMiddleware.authenticateAdmin(), validationMiddleware(CreatePlatformCryptoAddressDTO))
    async create(
        @requestBody() dto: CreatePlatformCryptoAddressDTO,
        @request() req: Request,
        @response() res: Response
    ) {
        try {
            const admin = req.user as IUser;
            const created = await this.cryptoAddressService.create(admin._id!, dto);
            return this.success(res, created, 'Platform crypto address created');
        } catch (error: any) {
            return this.error(res, error.message, error.statusCode || 400, error);
        }
    }

    @httpPatch('/:id', AuthMiddleware.authenticateAdmin(), validationMiddleware(UpdatePlatformCryptoAddressDTO))
    async update(
        @requestParam('id') id: string,
        @requestBody() dto: UpdatePlatformCryptoAddressDTO,
        @response() res: Response
    ) {
        try {
            const updated = await this.cryptoAddressService.update(id, dto);
            return this.success(res, updated, 'Platform crypto address updated');
        } catch (error: any) {
            return this.error(res, error.message, error.statusCode || 400, error);
        }
    }

    @httpDelete('/:id', AuthMiddleware.authenticateAdmin())
    async remove(@requestParam('id') id: string, @response() res: Response) {
        try {
            await this.cryptoAddressService.softDelete(id);
            return this.success(res, null, 'Platform crypto address deactivated');
        } catch (error: any) {
            return this.error(res, error.message, error.statusCode || 400, error);
        }
    }
}
