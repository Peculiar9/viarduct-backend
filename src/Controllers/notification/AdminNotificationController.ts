import { Request, Response } from 'express';
import { inject } from 'inversify';
import { controller, httpGet, httpPatch, request, requestBody, requestParam, response, queryParam } from 'inversify-express-utils';
import { API_PATH, TYPES } from '../../Core/Types/Constants';
import AuthMiddleware from '../../Middleware/AuthMiddleware';
import { BaseController } from '../BaseController';
import { INotificationService } from '../../Core/Application/Interface/Services/INotificationService';
import { MarkNotificationsReadDTO } from '../../Core/Application/DTOs/NotificationDTO';
import { validationMiddleware } from '../../Middleware/ValidationMiddleware';

@controller(`/${API_PATH}/admin/notifications`)
export class AdminNotificationController extends BaseController {
    constructor(
        @inject(TYPES.NotificationService) private readonly notificationService: INotificationService
    ) {
        super();
    }

    /**
     * List notifications for admin review
     * GET /api/v1/admin/notifications?user_id=<uuid>&unread=true&type=verification&title=KYC&limit=50&offset=0
     */
    @httpGet('/', AuthMiddleware.authenticateAdmin())
    async list(
        @queryParam('user_id') userId: string,
        @queryParam('unread') unread: string,
        @queryParam('type') type: string,
        @queryParam('title') title: string,
        @queryParam('limit') limit: string,
        @queryParam('offset') offset: string,
        @request() req: Request,
        @response() res: Response
    ) {
        try {
            const result = await this.notificationService.listForAdmin({
                userId: userId || undefined,
                unreadOnly: String(unread).toLowerCase() === 'true',
                type: type || undefined,
                title: title || undefined,
                limit: limit ? parseInt(limit, 10) : undefined,
                offset: offset ? parseInt(offset, 10) : undefined
            });
            return this.success(res, result, 'Notifications retrieved successfully');
        } catch (error: any) {
            return this.error(res, error.message, error.statusCode || 400, error);
        }
    }

    /**
     * Mark a notification as read by admin
     * PATCH /api/v1/admin/notifications/:id/read
     */
    @httpPatch('/:id/read', AuthMiddleware.authenticateAdmin())
    async markRead(
        @requestParam('id') id: string,
        @request() req: Request,
        @response() res: Response
    ) {
        try {
            const updated = await this.notificationService.markReadByAdmin(id);
            return this.success(res, updated, 'Notification marked as read');
        } catch (error: any) {
            return this.error(res, error.message, error.statusCode || 400, error);
        }
    }

    /**
     * Bulk mark notifications as read by admin
     * PATCH /api/v1/admin/notifications/read?user_id=<uuid>
     * Body: { ids?: string[] } (empty/omitted => mark all, optionally scoped by user_id)
     */
    @httpPatch('/read', AuthMiddleware.authenticateAdmin(), validationMiddleware(MarkNotificationsReadDTO))
    async markReadBulk(
        @queryParam('user_id') userId: string,
        @requestBody() dto: MarkNotificationsReadDTO,
        @request() req: Request,
        @response() res: Response
    ) {
        try {
            const updatedCount = await this.notificationService.markReadByAdminBulk(dto?.ids, userId || undefined);
            return this.success(res, { updated_count: updatedCount }, 'Notifications marked as read');
        } catch (error: any) {
            return this.error(res, error.message, error.statusCode || 400, error);
        }
    }
}

