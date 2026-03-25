import { Request, Response } from 'express';
import { inject } from 'inversify';
import { controller, httpGet, httpPatch, request, requestBody, requestParam, response, queryParam } from 'inversify-express-utils';
import { API_PATH, TYPES } from '../../Core/Types/Constants';
import AuthMiddleware from '../../Middleware/AuthMiddleware';
import { BaseController } from '../BaseController';
import { INotificationService } from '../../Core/Application/Interface/Services/INotificationService';
import { IUser } from '../../Core/Application/Interface/Entities/auth-and-user/IUser';
import { MarkNotificationsReadDTO } from '../../Core/Application/DTOs/NotificationDTO';
import { validationMiddleware } from '../../Middleware/ValidationMiddleware';

@controller(`/${API_PATH}/notifications/my-notification`)
export class NotificationController extends BaseController {
    constructor(
        @inject(TYPES.NotificationService) private readonly notificationService: INotificationService
    ) {
        super();
    }

    /**
     * List notifications for current user
     * GET /api/v1/notifications/my-notification?unread=true&type=order&title=kyc&limit=50&offset=0
     */
    @httpGet('/', AuthMiddleware.authenticate())
    async list(
        @queryParam('unread') unread: string,
        @queryParam('type') type: string,
        @queryParam('title') title: string,
        @queryParam('limit') limit: string,
        @queryParam('offset') offset: string,
        @request() req: Request,
        @response() res: Response
    ) {
        try {
            const user = req.user as IUser;
            const result = await this.notificationService.listForUser(user._id!, {
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
     * Mark a notification as read for user
     * PATCH /api/v1/notifications/my-notification/:id/read
     */
    @httpPatch('/:id/read', AuthMiddleware.authenticate())
    async markRead(
        @requestParam('id') id: string,
        @request() req: Request,
        @response() res: Response
    ) {
        try {
            const user = req.user as IUser;
            const updated = await this.notificationService.markReadByUser(user._id!, id);
            return this.success(res, updated, 'Notification marked as read');
        } catch (error: any) {
            return this.error(res, error.message, error.statusCode || 400, error);
        }
    }

    /**
     * Bulk mark notifications as read for user
     * PATCH /api/v1/notifications/my-notification/read
     * Body: { ids?: string[] }  (empty/omitted => mark all)
     */
    @httpPatch('/read', AuthMiddleware.authenticate(), validationMiddleware(MarkNotificationsReadDTO))
    async markReadBulk(
        @requestBody() dto: MarkNotificationsReadDTO,
        @request() req: Request,
        @response() res: Response
    ) {
        try {
            const user = req.user as IUser;
            const updatedCount = await this.notificationService.markReadByUserBulk(user._id!, dto?.ids);
            return this.success(res, { updated_count: updatedCount }, 'Notifications marked as read');
        } catch (error: any) {
            return this.error(res, error.message, error.statusCode || 400, error);
        }
    }
}

