import { Request, Response } from 'express';
import { inject } from 'inversify';
import { controller, httpGet, httpPatch, queryParam, request, requestBody, requestParam, response } from 'inversify-express-utils';
import { API_PATH, TYPES } from '../../Core/Types/Constants';
import AuthMiddleware from '../../Middleware/AuthMiddleware';
import { BaseController } from '../BaseController';
import { UserRepository } from '../../Infrastructure/Repository/SQL/users/UserRepository';
import { UtilityService } from '../../Core/Services/UtilityService';
import { ValidationError } from '../../Core/Application/Error/AppError';
import { validationMiddleware } from '../../Middleware/ValidationMiddleware';
import { DeactivateUserDTO } from '../../Core/Application/DTOs/AdminUserDTO';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

@controller(`/${API_PATH}/admin/users`)
export class AdminUserController extends BaseController {
    constructor(@inject(TYPES.UserRepository) private readonly userRepository: UserRepository) {
        super();
    }

    /**
     * List users (admin)
     * GET /api/v1/admin/users?q=john&status=active&is_active=true&limit=50&offset=0
     */
    @httpGet('/', AuthMiddleware.authenticateAdmin())
    async list(
        @queryParam('q') q: string,
        @queryParam('status') status: string,
        @queryParam('is_active') isActive: string,
        @queryParam('limit') limit: string,
        @queryParam('offset') offset: string,
        @request() req: Request,
        @response() res: Response
    ) {
        try {
            const limitNum = Math.min(Math.max(1, parseInt(String(limit), 10) || DEFAULT_LIMIT), MAX_LIMIT);
            const offsetNum = Math.max(0, parseInt(String(offset), 10) || 0);

            const parsedIsActive =
                isActive === undefined || isActive === null || String(isActive).trim() === ''
                    ? undefined
                    : String(isActive).toLowerCase() === 'true';

            const [items, total] = await Promise.all([
                this.userRepository.findForAdminList({
                    q: q || undefined,
                    status: status || undefined,
                    is_active: parsedIsActive,
                    limit: limitNum,
                    offset: offsetNum
                }),
                this.userRepository.countForAdminList({
                    q: q || undefined,
                    status: status || undefined,
                    is_active: parsedIsActive
                })
            ]);

            return this.success(res, { items, total, limit: limitNum, offset: offsetNum }, 'Users retrieved successfully');
        } catch (error: any) {
            return this.error(res, error.message, error.statusCode || 400, error);
        }
    }

    /**
     * Get user by id (admin)
     * GET /api/v1/admin/users/:id
     */
    @httpGet('/:id([0-9a-fA-F-]{36})', AuthMiddleware.authenticateAdmin())
    async getById(@requestParam('id') id: string, @request() req: Request, @response() res: Response) {
        try {
            if (!UtilityService.validateUUID(id)) {
                throw new ValidationError('Invalid user id');
            }
            const user = await this.userRepository.findByIdForAdmin(id);
            if (!user) {
                return this.error(res, 'User not found', 404);
            }
            return this.success(res, user, 'User retrieved successfully');
        } catch (error: any) {
            return this.error(res, error.message, error.statusCode || 400, error);
        }
    }

    /**
     * Deactivate user (admin) - reason required
     * PATCH /api/v1/admin/users/:id/deactivate
     */
    @httpPatch('/:id([0-9a-fA-F-]{36})/deactivate', AuthMiddleware.authenticateAdmin(), validationMiddleware(DeactivateUserDTO))
    async deactivate(
        @requestParam('id') id: string,
        @requestBody() dto: DeactivateUserDTO,
        @request() req: Request,
        @response() res: Response
    ) {
        try {
            if (!UtilityService.validateUUID(id)) {
                throw new ValidationError('Invalid user id');
            }
            const updated = await this.userRepository.deactivateUser(id, dto.reason);
            if (!updated) {
                return this.error(res, 'User not found', 404);
            }
            return this.success(res, { deactivated: true, user_id: id }, 'User deactivated successfully');
        } catch (error: any) {
            return this.error(res, error.message, error.statusCode || 400, error);
        }
    }
}

