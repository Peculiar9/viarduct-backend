import { Request, Response } from 'express';
import { inject } from 'inversify';
import { controller, httpGet, httpPatch, request, requestBody, requestParam, response, queryParam } from 'inversify-express-utils';
import { API_PATH, TYPES } from '../../Core/Types/Constants';
import AuthMiddleware from '../../Middleware/AuthMiddleware';
import { BaseController } from '../BaseController';
import { IDisputeService } from '../../Core/Application/Interface/Services/IDisputeService';
import { validationMiddleware } from '../../Middleware/ValidationMiddleware';
import { ResolveDisputeDTO } from '../../Core/Application/DTOs/DisputeDTO';

@controller(`/${API_PATH}/admin/disputes`)
export class AdminDisputeController extends BaseController {
    constructor(
        @inject(TYPES.DisputeService) private readonly disputeService: IDisputeService
    ) {
        super();
    }

    /**
     * List disputes (admin)
     * GET /api/v1/admin/disputes?user_id=<uuid>&title=...&status=pending&limit=50&offset=0
     */
    @httpGet('/', AuthMiddleware.authenticateAdmin())
    async list(
        @queryParam('user_id') userId: string,
        @queryParam('title') title: string,
        @queryParam('status') status: string,
        @queryParam('limit') limit: string,
        @queryParam('offset') offset: string,
        @request() req: Request,
        @response() res: Response
    ) {
        try {
            const result = await this.disputeService.listForAdmin({
                userId: userId || undefined,
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
     * Get dispute by id (admin)
     * GET /api/v1/admin/disputes/:id
     */
    @httpGet('/:id', AuthMiddleware.authenticateAdmin())
    async getById(
        @requestParam('id') id: string,
        @request() req: Request,
        @response() res: Response
    ) {
        try {
            const dispute = await this.disputeService.getByIdForAdmin(id);
            return this.success(res, dispute, 'Dispute retrieved successfully');
        } catch (error: any) {
            return this.error(res, error.message, error.statusCode || 400, error);
        }
    }

    /**
     * Resolve dispute (admin)
     * PATCH /api/v1/admin/disputes/:id/resolve
     */
    @httpPatch('/:id/resolve', AuthMiddleware.authenticateAdmin(), validationMiddleware(ResolveDisputeDTO))
    async resolve(
        @requestParam('id') id: string,
        @requestBody() dto: ResolveDisputeDTO,
        @request() req: Request,
        @response() res: Response
    ) {
        try {
            const updated = await this.disputeService.resolve(id, {
                resolve_note: dto.resolve_note,
                resolve_evidence: dto.resolve_evidence
            });
            return this.success(res, updated, 'Dispute resolved successfully');
        } catch (error: any) {
            return this.error(res, error.message, error.statusCode || 400, error);
        }
    }
}

