import { Request, Response } from 'express';
import { inject } from 'inversify';
import { controller, httpGet, httpPatch, httpPost, queryParam, request, requestBody, requestParam, response } from 'inversify-express-utils';
import { API_PATH, TYPES } from '../../Core/Types/Constants';
import AuthMiddleware from '../../Middleware/AuthMiddleware';
import { BaseController } from '../BaseController';
import { validationMiddleware } from '../../Middleware/ValidationMiddleware';
import { CreateSystemAnnouncementDTO, PublishSystemAnnouncementDTO, UpdateSystemAnnouncementDTO } from '../../Core/Application/DTOs/SystemAnnouncementDTO';
import { ISystemAnnouncementService } from '../../Core/Application/Interface/Services/ISystemAnnouncementService';
import { IUser } from '../../Core/Application/Interface/Entities/auth-and-user/IUser';

@controller(`/${API_PATH}/admin/system-announcements`)
export class AdminSystemAnnouncementController extends BaseController {
    constructor(
        @inject(TYPES.SystemAnnouncementService) private readonly systemAnnouncementService: ISystemAnnouncementService
    ) {
        super();
    }

    /**
     * Create draft announcement
     * POST /api/v1/admin/system-announcements
     */
    @httpPost('/', AuthMiddleware.authenticateAdmin(), validationMiddleware(CreateSystemAnnouncementDTO))
    async create(@requestBody() dto: CreateSystemAnnouncementDTO, @request() req: Request, @response() res: Response) {
        try {
            const admin = req.user as IUser;
            const created = await this.systemAnnouncementService.createDraft({
                title: dto.title,
                description: dto.description ?? null,
                content: dto.content,
                url: dto.url ?? null,
                broadcast_channels: dto.broadcast_channels,
                created_by_admin_id: admin._id!
            });
            return this.success(res, created, 'System announcement created');
        } catch (error: any) {
            return this.error(res, error.message, error.statusCode || 400, error);
        }
    }

    /**
     * Update draft announcement
     * PATCH /api/v1/admin/system-announcements/:id
     */
    @httpPatch('/:id([0-9a-fA-F-]{36})', AuthMiddleware.authenticateAdmin(), validationMiddleware(UpdateSystemAnnouncementDTO))
    async update(@requestParam('id') id: string, @requestBody() dto: UpdateSystemAnnouncementDTO, @request() req: Request, @response() res: Response) {
        try {
            const admin = req.user as IUser;
            const updated = await this.systemAnnouncementService.updateDraft(id, admin._id!, {
                title: dto.title,
                description: dto.description ?? undefined,
                content: dto.content,
                url: dto.url ?? undefined,
                broadcast_channels: dto.broadcast_channels
            });
            return this.success(res, updated, 'System announcement updated');
        } catch (error: any) {
            return this.error(res, error.message, error.statusCode || 400, error);
        }
    }

    /**
     * Publish (or schedule) announcement
     * POST /api/v1/admin/system-announcements/:id/publish
     */
    @httpPost('/:id([0-9a-fA-F-]{36})/publish', AuthMiddleware.authenticateAdmin(), validationMiddleware(PublishSystemAnnouncementDTO))
    async publish(@requestParam('id') id: string, @requestBody() dto: PublishSystemAnnouncementDTO, @request() req: Request, @response() res: Response) {
        try {
            const admin = req.user as IUser;
            const updated = await this.systemAnnouncementService.publish(id, admin._id!, {
                scheduled_at: dto.scheduled_at ?? null
            });
            return this.success(res, updated, 'System announcement queued for delivery');
        } catch (error: any) {
            return this.error(res, error.message, error.statusCode || 400, error);
        }
    }

    /**
     * List announcements
     * GET /api/v1/admin/system-announcements?status=draft&limit=50&offset=0
     */
    @httpGet('/', AuthMiddleware.authenticateAdmin())
    async list(
        @queryParam('status') status: string,
        @queryParam('limit') limit: string,
        @queryParam('offset') offset: string,
        @request() req: Request,
        @response() res: Response
    ) {
        try {
            const result = await this.systemAnnouncementService.listForAdmin({
                status: status || undefined,
                limit: limit ? parseInt(limit, 10) : undefined,
                offset: offset ? parseInt(offset, 10) : undefined
            });
            return this.success(res, result, 'System announcements retrieved');
        } catch (error: any) {
            return this.error(res, error.message, error.statusCode || 400, error);
        }
    }

    /**
     * Get announcement with delivery stats
     * GET /api/v1/admin/system-announcements/:id
     */
    @httpGet('/:id([0-9a-fA-F-]{36})', AuthMiddleware.authenticateAdmin())
    async getById(@requestParam('id') id: string, @request() req: Request, @response() res: Response) {
        try {
            const ann = await this.systemAnnouncementService.getByIdForAdmin(id);
            return this.success(res, ann, 'System announcement retrieved');
        } catch (error: any) {
            return this.error(res, error.message, error.statusCode || 400, error);
        }
    }
}

