import { Request, Response } from 'express';
import { inject } from 'inversify';
import {
    controller,
    httpGet,
    httpPost,
    queryParam,
    request,
    requestBody,
    response
} from 'inversify-express-utils';
import { API_PATH, TYPES } from '../../Core/Types/Constants';
import { IAdminPayoutConsentService } from '../../Core/Application/Interface/Services/IAdminPayoutConsentService';
import AuthMiddleware from '../../Middleware/AuthMiddleware';
import { BaseController } from '../BaseController';
import { validationMiddleware } from '../../Middleware/ValidationMiddleware';
import { CreatePayoutConsentDTO } from '../../Core/Application/DTOs/PayoutConsentDTO';
import { IUser } from '../../Core/Application/Interface/Entities/auth-and-user/IUser';
import { UserRole } from '../../Core/Application/Enums/UserRole';

@controller(`/${API_PATH}/admin/consents`)
export class AdminPayoutConsentController extends BaseController {
    constructor(
        @inject(TYPES.AdminPayoutConsentService) private readonly consentService: IAdminPayoutConsentService
    ) {
        super();
    }

    @httpPost('/', AuthMiddleware.authenticateAdmin(), validationMiddleware(CreatePayoutConsentDTO))
    async createConsent(@requestBody() dto: CreatePayoutConsentDTO, @request() req: Request, @response() res: Response) {
        try {
            const admin = req.user as IUser;
            const consent = await this.consentService.createConsent(admin._id!, {
                intent_id: dto.intent_id,
                expiry_hours: dto.expiry_hours
            });
            return this.success(res, consent, 'Payout consent created');
        } catch (error: any) {
            return this.error(res, error.message, error.statusCode || 400, error);
        }
    }

    @httpGet('/mine', AuthMiddleware.authenticateAdmin())
    async listMyConsents(
        @queryParam('status') status: string,
        @queryParam('limit') limit: string,
        @queryParam('offset') offset: string,
        @request() req: Request,
        @response() res: Response
    ) {
        try {
            const admin = req.user as IUser;
            const result = await this.consentService.listMyConsents(admin._id!, {
                status,
                limit: limit ? parseInt(limit, 10) : 50,
                offset: offset ? parseInt(offset, 10) : 0
            });
            return this.success(res, result, 'Consents retrieved');
        } catch (error: any) {
            return this.error(res, error.message, error.statusCode || 400, error);
        }
    }

    @httpGet('/', AuthMiddleware.authenticateAdmin())
    async listAllConsents(
        @queryParam('admin_id') adminId: string,
        @queryParam('status') status: string,
        @queryParam('limit') limit: string,
        @queryParam('offset') offset: string,
        @request() req: Request,
        @response() res: Response
    ) {
        try {
            const admin = req.user as IUser;
            const isSuperAdmin = admin.roles?.includes(UserRole.SUPERADMIN);
            if (!isSuperAdmin) {
                return this.error(res, 'Only superadmin can list all consents', 403);
            }

            const result = await this.consentService.listAllConsents({
                admin_id: adminId,
                status,
                limit: limit ? parseInt(limit, 10) : 50,
                offset: offset ? parseInt(offset, 10) : 0
            });
            return this.success(res, result, 'All consents retrieved');
        } catch (error: any) {
            return this.error(res, error.message, error.statusCode || 400, error);
        }
    }
}
