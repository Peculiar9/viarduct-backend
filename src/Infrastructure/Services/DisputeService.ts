import { inject, injectable } from 'inversify';
import { TYPES } from '../../Core/Types/Constants';
import { DisputeRepository } from '../Repository/SQL/disputes/DisputeRepository';
import { IDisputeService, CreateDisputeInput, DisputeListResult, ResolveDisputeInput } from '../../Core/Application/Interface/Services/IDisputeService';
import { IDispute, DisputeEvidenceItem } from '../../Core/Application/Interface/Entities/disputes/IDispute';
import { DisputeStatus } from '../../Core/Application/Enums/DisputeStatus';
import { NotFoundError, ValidationError } from '../../Core/Application/Error/AppError';
import { INotificationService } from '../../Core/Application/Interface/Services/INotificationService';
import { NotificationType } from '../../Core/Application/Enums/NotificationType';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

@injectable()
export class DisputeService implements IDisputeService {
    constructor(
        @inject(TYPES.DisputeRepository) private readonly disputeRepository: DisputeRepository,
        @inject(TYPES.NotificationService) private readonly notificationService: INotificationService
    ) {}

    async create(input: CreateDisputeInput): Promise<IDispute> {
        if (!input.user_id) throw new ValidationError('user_id is required');
        if (!input.title || String(input.title).trim() === '') throw new ValidationError('title is required');
        if (!input.content || String(input.content).trim() === '') throw new ValidationError('content is required');

        // NOTE: node-postgres serializes JS arrays as Postgres arrays (e.g. TEXT[]),
        // which breaks JSONB columns. For JSONB arrays we must pass JSON strings.
        const evidenceJson = JSON.stringify(Array.isArray(input.evidence) ? (input.evidence as DisputeEvidenceItem[]) : []);

        const entity: IDispute = {
            user_id: input.user_id,
            title: String(input.title).trim(),
            content: String(input.content).trim(),
            evidence: evidenceJson as any,
            status: DisputeStatus.PENDING,
            resolve_note: null,
            resolve_evidence: null
        };

        const created = await this.disputeRepository.create(entity);

        // Notification (non-blocking)
        try {
            await this.notificationService.create({
                user_id: input.user_id,
                type: NotificationType.DISPUTE,
                title: 'Dispute created',
                content: `Your dispute "${created.title}" has been created and is pending review.`,
                url: `/disputes/${created._id}`
            });
        } catch {
            // ignore notification errors
        }

        return created;
    }

    async listForUser(userId: string, options: { title?: string; status?: DisputeStatus | string; limit?: number; offset?: number }): Promise<DisputeListResult> {
        if (!userId) throw new ValidationError('userId is required');

        const limit = Math.min(Math.max(1, Number(options.limit ?? DEFAULT_LIMIT)), MAX_LIMIT);
        const offset = Math.max(0, Number(options.offset ?? 0));
        const title = options.title ? String(options.title) : undefined;
        const status = options.status ? String(options.status) : undefined;

        const [items, total] = await Promise.all([
            this.disputeRepository.findForUser(userId, { title, status, limit, offset }),
            this.disputeRepository.countForUser(userId, { title, status })
        ]);

        return { items, total, limit, offset };
    }

    async getByIdForUser(userId: string, disputeId: string): Promise<IDispute> {
        if (!userId) throw new ValidationError('userId is required');
        if (!disputeId) throw new ValidationError('disputeId is required');

        const dispute = await this.disputeRepository.findById(disputeId);
        if (!dispute || dispute.user_id !== userId) throw new NotFoundError('Dispute not found');
        return dispute;
    }

    async listForAdmin(options: { userId?: string; title?: string; status?: DisputeStatus | string; limit?: number; offset?: number }): Promise<DisputeListResult> {
        const limit = Math.min(Math.max(1, Number(options.limit ?? DEFAULT_LIMIT)), MAX_LIMIT);
        const offset = Math.max(0, Number(options.offset ?? 0));
        const title = options.title ? String(options.title) : undefined;
        const status = options.status ? String(options.status) : undefined;
        const userId = options.userId ? String(options.userId) : undefined;

        const [items, total] = await Promise.all([
            this.disputeRepository.findForAdmin({ userId, title, status, limit, offset }),
            this.disputeRepository.countForAdmin({ userId, title, status })
        ]);

        return { items, total, limit, offset };
    }

    async getByIdForAdmin(disputeId: string): Promise<IDispute> {
        if (!disputeId) throw new ValidationError('disputeId is required');
        const dispute = await this.disputeRepository.findById(disputeId);
        if (!dispute) throw new NotFoundError('Dispute not found');
        return dispute;
    }

    async resolve(disputeId: string, input: ResolveDisputeInput): Promise<IDispute> {
        if (!disputeId) throw new ValidationError('disputeId is required');
        if (!input.resolve_note || String(input.resolve_note).trim() === '') {
            throw new ValidationError('resolve_note is required');
        }

        const existing = await this.disputeRepository.findById(disputeId);
        if (!existing) throw new NotFoundError('Dispute not found');

        const resolveEvidenceJson = input.resolve_evidence === undefined
            ? undefined
            : (JSON.stringify(Array.isArray(input.resolve_evidence) ? input.resolve_evidence : []) as any);

        const updated = await this.disputeRepository.update(disputeId, {
            status: DisputeStatus.RESOLVED,
            resolve_note: input.resolve_note ?? null,
            resolve_evidence: resolveEvidenceJson ?? null
        });

        if (!updated) throw new NotFoundError('Dispute not found');

        // Notification (non-blocking)
        try {
            await this.notificationService.create({
                user_id: updated.user_id,
                type: NotificationType.DISPUTE,
                title: 'Dispute resolved',
                content: `Your dispute "${updated.title}" has been resolved.`,
                url: `/disputes/${updated._id}`
            });
        } catch {
            // ignore notification errors
        }

        return updated;
    }
}

