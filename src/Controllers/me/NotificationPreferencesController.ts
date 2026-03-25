import { Request, Response } from 'express';
import { inject } from 'inversify';
import { controller, httpGet, httpPatch, request, requestBody, response } from 'inversify-express-utils';
import { API_PATH, TYPES } from '../../Core/Types/Constants';
import AuthMiddleware from '../../Middleware/AuthMiddleware';
import { BaseController } from '../BaseController';
import { UserRepository } from '../../Infrastructure/Repository/SQL/users/UserRepository';
import { IUser } from '../../Core/Application/Interface/Entities/auth-and-user/IUser';
import { UpdateNotificationPreferencesDTO } from '../../Core/Application/DTOs/NotificationPreferencesDTO';
import { validationMiddleware } from '../../Middleware/ValidationMiddleware';

const DEFAULT_PREFS: Record<string, boolean> = {
    transaction: true,
    verification: true,
    message: true,
    order: true,
    dispute: true,
    system_announcements: true
};

@controller(`/${API_PATH}/me/notification-preferences`)
export class NotificationPreferencesController extends BaseController {
    constructor(@inject(TYPES.UserRepository) private readonly userRepository: UserRepository) {
        super();
    }

    @httpGet('/', AuthMiddleware.authenticate())
    async getMyPreferences(@request() req: Request, @response() res: Response) {
        try {
            const user = req.user as IUser;
            const fresh = await this.userRepository.findById(user._id!);
            const prefs = (fresh?.notification_preferences as any) || {};
            return this.success(res, { preferences: { ...DEFAULT_PREFS, ...prefs } }, 'Notification preferences retrieved');
        } catch (error: any) {
            return this.error(res, error.message, error.statusCode || 400, error);
        }
    }

    @httpPatch('/', AuthMiddleware.authenticate(), validationMiddleware(UpdateNotificationPreferencesDTO))
    async updateMyPreferences(
        @request() req: Request,
        @requestBody() dto: UpdateNotificationPreferencesDTO,
        @response() res: Response
    ) {
        try {
            const user = req.user as IUser;
            const fresh = await this.userRepository.findById(user._id!);
            const existing = (fresh?.notification_preferences as any) || {};

            const next: Record<string, boolean> = {
                ...DEFAULT_PREFS,
                ...existing
            };

            for (const [k, v] of Object.entries(dto || {})) {
                if (typeof v === 'boolean') {
                    next[k] = v;
                }
            }

            const updated = await this.userRepository.updateNotificationPreferences(user._id!, next);
            const prefs = (updated?.notification_preferences as any) || next;
            return this.success(res, { preferences: { ...DEFAULT_PREFS, ...prefs } }, 'Notification preferences updated');
        } catch (error: any) {
            return this.error(res, error.message, error.statusCode || 400, error);
        }
    }
}

