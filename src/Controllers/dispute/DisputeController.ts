import { Request, Response } from 'express';
import { inject } from 'inversify';
import { controller, httpGet, httpPost, request, requestBody, requestParam, response, queryParam } from 'inversify-express-utils';
import { API_PATH, TYPES } from '../../Core/Types/Constants';
import AuthMiddleware from '../../Middleware/AuthMiddleware';
import { BaseController } from '../BaseController';
import { IDisputeService } from '../../Core/Application/Interface/Services/IDisputeService';
import { IUser } from '../../Core/Application/Interface/Entities/auth-and-user/IUser';
import { validationMiddleware } from '../../Middleware/ValidationMiddleware';
import { CreateDisputeDTO } from '../../Core/Application/DTOs/DisputeDTO';

@controller(`/${API_PATH}/disputes`)
export class DisputeController extends BaseController {
    constructor(
        @inject(TYPES.DisputeService) private readonly disputeService: IDisputeService
    ) {
        super();
    }

    /**
     * Create dispute (user)
     * POST /api/v1/disputes
     */
    @httpPost('/', AuthMiddleware.authenticate(), validationMiddleware(CreateDisputeDTO))
    async create(@requestBody() dto: CreateDisputeDTO, @request() req: Request, @response() res: Response) {
        try {
            const user = req.user as IUser;
            const dispute = await this.disputeService.create({
                user_id: user._id!,
                title: dto.title,
                content: dto.content,
                evidence: dto.evidence || []
            });
            return this.success(res, dispute, 'Dispute created successfully');
        } catch (error: any) {
            return this.error(res, error.message, error.statusCode || 400, error);
        }
    }

    /**
     * List disputes for user
     * GET /api/v1/disputes?title=...&status=pending&limit=50&offset=0
     */
    @httpGet('/', AuthMiddleware.authenticate())
    async list(
        @queryParam('title') title: string,
        @queryParam('status') status: string,
        @queryParam('limit') limit: string,
        @queryParam('offset') offset: string,
        @request() req: Request,
        @response() res: Response
    ) {
        try {
            const user = req.user as IUser;
            const result = await this.disputeService.listForUser(user._id!, {
                title: title || undefined,
                status: status || undefined,
                limit: limit ? parseInt(limit, 10) : undefined,
                offset: offset ? parseInt(offset, 10) : undefined
            });
            return this.success(res, result, 'Disputes retrieved successfully');
        } catch (error: any) {
            return this.error(res, error.message, error.statusCode || 400, error);
        }
    }

    /**
     * Get dispute by id (user)
     * GET /api/v1/disputes/:id
     */
    @httpGet('/:id', AuthMiddleware.authenticate())
    async getById(
        @requestParam('id') id: string,
        @request() req: Request,
        @response() res: Response
    ) {
        try {
            const user = req.user as IUser;
            const dispute = await this.disputeService.getByIdForUser(user._id!, id);
            return this.success(res, dispute, 'Dispute retrieved successfully');
        } catch (error: any) {
            return this.error(res, error.message, error.statusCode || 400, error);
        }
    }
}

