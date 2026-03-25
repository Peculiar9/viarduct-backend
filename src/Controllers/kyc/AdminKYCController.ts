import { Request, Response } from 'express';
import { inject } from 'inversify';
import { controller, httpGet, httpPatch, queryParam, request, requestBody, requestParam, response } from 'inversify-express-utils';
import { API_PATH, TYPES } from '../../Core/Types/Constants';
import AuthMiddleware from '../../Middleware/AuthMiddleware';
import { BaseController } from '../BaseController';
import { UserKYCRepository } from '../../Infrastructure/Repository/SQL/auth/UserKYCRepository';
import { TransactionManager } from '../../Infrastructure/Repository/SQL/Abstractions/TransactionManager';
import { UtilityService } from '../../Core/Services/UtilityService';
import { NotFoundError, ValidationError } from '../../Core/Application/Error/AppError';
import { ManualKYCReviewDTO } from '../../Core/Application/DTOs/AdminKYCDTO';
import { validationMiddleware } from '../../Middleware/ValidationMiddleware';
import { UserRepository } from '../../Infrastructure/Repository/SQL/users/UserRepository';
import { KYCStage } from '../../Core/Application/Interface/Entities/auth-and-user/IVerification';
import { INotificationService } from '../../Core/Application/Interface/Services/INotificationService';
import { NotificationType } from '../../Core/Application/Enums/NotificationType';
import { IUser } from '../../Core/Application/Interface/Entities/auth-and-user/IUser';

@controller(`/${API_PATH}/admin/kyc`)
export class AdminKYCController extends BaseController {
    constructor(
        @inject(TYPES.UserKYCRepository) private readonly userKYCRepository: UserKYCRepository,
        @inject(TYPES.UserRepository) private readonly userRepository: UserRepository,
        @inject(TYPES.TransactionManager) private readonly transactionManager: TransactionManager,
        @inject(TYPES.NotificationService) private readonly notificationService: INotificationService
    ) {
        super();
    }

    /**
     * List KYC records (admin)
     * GET /api/v1/admin/kyc?status=pending&user_id=<uuid>&limit=50&offset=0
     */
    @httpGet('/', AuthMiddleware.authenticateAdmin())
    async list(
        @queryParam('status') status: string,
        @queryParam('user_id') userId: string,
        @queryParam('limit') limit: string,
        @queryParam('offset') offset: string,
        @request() req: Request,
        @response() res: Response
    ) {
        try {
            const normalizedStatus = status ? String(status).toLowerCase() : undefined;
            const limitNum = limit ? parseInt(limit, 10) : 50;
            const offsetNum = offset ? parseInt(offset, 10) : 0;

            if (userId && !UtilityService.validateUUID(userId)) {
                throw new ValidationError('Invalid user_id');
            }

            const [items, total] = await Promise.all([
                this.userKYCRepository.listForAdmin({
                    status: normalizedStatus,
                    userId: userId || undefined,
                    limit: Number.isFinite(limitNum) ? limitNum : 50,
                    offset: Number.isFinite(offsetNum) ? offsetNum : 0
                }),
                this.userKYCRepository.countForAdmin({
                    status: normalizedStatus,
                    userId: userId || undefined
                })
            ]);

            return this.success(res, { items, total, limit: limitNum, offset: offsetNum }, 'KYC records retrieved successfully');
        } catch (error: any) {
            return this.error(res, error.message, error.statusCode || 400, error);
        }
    }

    /**
     * Get KYC record by id (admin) - includes user
     * GET /api/v1/admin/kyc/:id
     */
    @httpGet('/:id([0-9a-fA-F-]{36})', AuthMiddleware.authenticateAdmin())
    async getById(
        @requestParam('id') id: string,
        @request() req: Request,
        @response() res: Response
    ) {
        try {
            if (!UtilityService.validateUUID(id)) {
                throw new ValidationError('Invalid kyc id');
            }

            const record = await this.userKYCRepository.findWithUserById(id);
            if (!record) {
                throw new NotFoundError('KYC record not found');
            }
            return this.success(res, record, 'KYC record retrieved successfully');
        } catch (error: any) {
            return this.error(res, error.message, error.statusCode || 400, error);
        }
    }

    /**
     * KYC stats (admin)
     * GET /api/v1/admin/kyc/stats
     */
    @httpGet('/stats', AuthMiddleware.authenticateAdmin())
    async stats(@request() req: Request, @response() res: Response) {
        try {
            const stats = await this.userKYCRepository.getAdminKYCStats(21);

            const pctIncrease = (curr: number, prev: number) => {
                if (prev <= 0) return curr > 0 ? 100 : 0;
                return ((curr - prev) / prev) * 100;
            };
            const pctDecrease = (curr: number, prev: number) => {
                if (prev <= 0) return 0;
                if (curr >= prev) return 0;
                return ((prev - curr) / prev) * 100;
            };

            return this.success(
                res,
                {
                    totals: stats.totals,
                    approved_last_3_weeks: {
                        count: stats.last_window.approved,
                        percentage_increment: pctIncrease(stats.last_window.approved, stats.previous_window.approved)
                    },
                    rejected_last_3_weeks: {
                        count: stats.last_window.rejected,
                        percentage_decrement: pctDecrease(stats.last_window.rejected, stats.previous_window.rejected)
                    }
                },
                'KYC stats retrieved successfully'
            );
        } catch (error: any) {
            return this.error(res, error.message, error.statusCode || 400, error);
        }
    }

    /**
     * Manually verify a user's KYC (admin)
     * PATCH /api/v1/admin/kyc/:id/verify
     * Body: { verdict: "approve" | "reject", reason?: string, note?: string }
     */
    @httpPatch('/:id([0-9a-fA-F-]{36})/verify', AuthMiddleware.authenticateAdmin(), validationMiddleware(ManualKYCReviewDTO))
    async manualReview(
        @requestParam('id') id: string,
        @requestBody() dto: ManualKYCReviewDTO,
        @request() req: Request,
        @response() res: Response
    ) {
        let started = false;
        try {
            if (!UtilityService.validateUUID(id)) {
                throw new ValidationError('Invalid kyc id');
            }
            const admin = req.user as IUser;
            if (!admin?._id) {
                throw new ValidationError('Admin not authenticated');
            }

            await this.transactionManager.beginTransaction();
            started = true;

            const existing = await this.userKYCRepository.findById(id);
            if (!existing) {
                throw new NotFoundError('KYC record not found');
            }

            if (dto.verdict === 'reject' && (!dto.reason || String(dto.reason).trim() === '')) {
                throw new ValidationError('reason is required when verdict is reject');
            }

            const updated = await this.userKYCRepository.adminReviewById({
                kycId: id,
                adminId: admin._id,
                verdict: dto.verdict,
                note: dto?.note ?? null,
                reason: dto?.reason ?? null
            });
            if (!updated) {
                throw new NotFoundError('KYC record not found');
            }

            if (dto.verdict === 'approve') {
                await this.userRepository.update(updated.user_id, {
                    has_completed_kyc: true,
                    kyc_stage: KYCStage.COMPLETED
                } as any);
            } else {
                await this.userRepository.update(updated.user_id, {
                    has_completed_kyc: false,
                    kyc_stage: KYCStage.REVIEW
                } as any);
            }

            await this.transactionManager.commit();
            started = false;

            try {
                await this.notificationService.create({
                    user_id: updated.user_id,
                    type: NotificationType.VERIFICATION,
                    title: dto.verdict === 'approve' ? 'KYC approved' : 'KYC rejected',
                    content: dto.verdict === 'approve'
                        ? 'Your KYC has been approved successfully.'
                        : `Your KYC was rejected. Reason: ${String(dto.reason).trim()}`,
                    url: '/kyc'
                });
            } catch {
                // ignore
            }

            return this.success(
                res,
                updated,
                dto.verdict === 'approve' ? 'KYC approved successfully' : 'KYC rejected successfully'
            );
        } catch (error: any) {
            if (started) {
                try {
                    await this.transactionManager.rollback();
                } catch {
                    // ignore
                }
            }
            return this.error(res, error.message, error.statusCode || 400, error);
        }
    }
}

