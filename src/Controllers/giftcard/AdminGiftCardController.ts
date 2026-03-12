import { Request, Response } from 'express';
import { controller, httpGet, httpPost, request, response, requestParam } from 'inversify-express-utils';
import { inject } from 'inversify';
import { API_PATH, TYPES } from '../../Core/Types/Constants';
import { IGiftCardService } from '../../Core/Application/Interface/Services/IGiftCardService';
import AuthMiddleware from '../../Middleware/AuthMiddleware';
import { BaseController } from '../BaseController';
import { IUser } from '../../Core/Application/Interface/Entities/auth-and-user/IUser';
import { validationMiddleware } from '../../Middleware/ValidationMiddleware';
import { AdminApproveGiftCardDTO, AdminRejectGiftCardDTO } from '../../Core/Application/DTOs/GiftCardDTO';

@controller(`/${API_PATH}/admin/gift-cards`)
export class AdminGiftCardController extends BaseController {
    constructor(
        @inject(TYPES.GiftCardService) private readonly giftCardService: IGiftCardService
    ) {
        super();
    }

    @httpGet('/', AuthMiddleware.authenticateAdmin())
    async list(@request() req: Request, @response() res: Response) {
        try {
            const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit), 10) || 50));
            const offset = Math.max(0, parseInt(String(req.query.offset), 10) || 0);
            const filters = {
                status: req.query.status as string | undefined,
                user_id: req.query.user_id as string | undefined,
                card_name: req.query.card_name as string | undefined,
                card_type: req.query.card_type as string | undefined,
                amount: req.query.amount != null ? Number(req.query.amount) : undefined,
                date_from: req.query.date_from as string | undefined,
                date_to: req.query.date_to as string | undefined,
                transaction_id: req.query.transaction_id as string | undefined,
                validated_by: req.query.validated_by as string | undefined
            };
            const { items, total } = await this.giftCardService.listWithFilters(filters, limit, offset);
            return this.success(res, { items, total, limit, offset }, 'Success');
        } catch (error: any) {
            return this.error(res, error.message, error.statusCode || 400, error);
        }
    }

    @httpPost('/:id/approve', AuthMiddleware.authenticateAdmin(), validationMiddleware(AdminApproveGiftCardDTO))
    async approve(
        @requestParam('id') id: string,
        @request() req: Request,
        @response() res: Response
    ) {
        try {
            const user = req.user as IUser;
            const { reason, amount_to_credit } = req.body;
            const submission = await this.giftCardService.approve(id, user._id!, reason, amount_to_credit);
            return this.success(res, submission, 'Gift card approved and user wallet credited.');
        } catch (error: any) {
            return this.error(res, error.message, error.statusCode || 400, error);
        }
    }

    @httpPost('/:id/reject', AuthMiddleware.authenticateAdmin(), validationMiddleware(AdminRejectGiftCardDTO))
    async reject(
        @requestParam('id') id: string,
        @request() req: Request,
        @response() res: Response
    ) {
        try {
            const user = req.user as IUser;
            const { reason } = req.body;
            const submission = await this.giftCardService.reject(id, user._id!, reason);
            return this.success(res, submission, 'Gift card submission rejected.');
        } catch (error: any) {
            return this.error(res, error.message, error.statusCode || 400, error);
        }
    }
}
