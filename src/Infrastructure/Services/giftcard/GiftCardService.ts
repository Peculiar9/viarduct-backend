import { inject, injectable } from 'inversify';
import { TYPES } from '../../../Core/Types/Constants';
import { IGiftCardService } from '../../../Core/Application/Interface/Services/IGiftCardService';
import { IGiftCardSubmission } from '../../../Core/Application/Interface/Entities/giftcard/IGiftCardSubmission';
import {
    IGiftCardSubmissionRepository,
    GiftCardSubmissionFiltersForUser,
    GiftCardSubmissionFiltersForAdmin
} from '../../../Core/Application/Interface/Repositories/IGiftCardSubmissionRepository';
import { IWithdrawalService } from '../../../Core/Application/Interface/Services/IWithdrawalService';
import { IWalletService } from '../../../Core/Application/Interface/Services/IWalletService';
import { TransactionRepository } from '../../Repository/SQL/payment/TransactionRepository';
import { ValidationError, ServiceError } from '../../../Core/Application/Error/AppError';
import { Console } from '../../Utils/Console';
import {
    RelatedEntityType,
    TransactionType,
    TransactionStatus
} from '../../../Core/Application/Interface/Entities/payments/IPayment';
import { ITransaction } from '../../../Core/Application/Interface/Entities/payments/IPayment';

const MIN_AMOUNT_NGN = 100;

@injectable()
export class GiftCardService implements IGiftCardService {
    constructor(
        @inject(TYPES.GiftCardSubmissionRepository) private readonly submissionRepo: IGiftCardSubmissionRepository,
        @inject(TYPES.WithdrawalService) private readonly withdrawalService: IWithdrawalService,
        @inject(TYPES.WalletService) private readonly walletService: IWalletService,
        @inject(TYPES.TransactionRepository) private readonly transactionRepo: TransactionRepository
    ) {}

    async submit(
        userId: string,
        cardType: string,
        amountNgn: number,
        imageUrls: string[],
        pin: string
    ): Promise<IGiftCardSubmission> {
        if (!cardType || cardType.trim() === '') {
            throw new ValidationError('Card type is required');
        }
        if (amountNgn < MIN_AMOUNT_NGN) {
            throw new ValidationError(`Minimum amount is ${MIN_AMOUNT_NGN} NGN`);
        }
        if (!imageUrls || imageUrls.length === 0) {
            throw new ValidationError('At least one gift card image is required');
        }

        const pinValid = await this.withdrawalService.verifyTransactionPin(userId, pin);
        if (!pinValid) {
            throw new ValidationError('Invalid transaction PIN');
        }

        const now = new Date().toISOString();
        const submission = await this.submissionRepo.create({
            user_id: userId,
            card_type: cardType.trim(),
            amount_ngn: amountNgn,
            image_urls: imageUrls,
            status: 'pending_validation',
            created_at: now,
            updated_at: now
        });

        Console.info('Gift card submission created', {
            submissionId: submission._id,
            userId,
            cardType,
            amountNgn
        });
        return submission;
    }

    async getMySubmissions(
        userId: string,
        filters: GiftCardSubmissionFiltersForUser,
        limit: number = 50,
        offset: number = 0
    ): Promise<{ items: IGiftCardSubmission[]; total: number }> {
        const [items, total] = await Promise.all([
            this.submissionRepo.findByUserIdWithFilters(userId, filters, limit, offset),
            this.submissionRepo.countByUserIdWithFilters(userId, filters)
        ]);
        return { items, total };
    }

    async getSubmissionById(userId: string, submissionId: string): Promise<IGiftCardSubmission | null> {
        const submission = await this.submissionRepo.findById(submissionId);
        if (!submission || submission.user_id !== userId) {
            return null;
        }
        return submission;
    }

    async listWithFilters(
        filters: GiftCardSubmissionFiltersForAdmin,
        limit: number = 50,
        offset: number = 0
    ): Promise<{ items: IGiftCardSubmission[]; total: number }> {
        const [items, total] = await Promise.all([
            this.submissionRepo.findWithFilters(filters, limit, offset),
            this.submissionRepo.countWithFilters(filters)
        ]);
        return { items, total };
    }

    async approve(
        submissionId: string,
        adminUserId: string,
        notes?: string
    ): Promise<IGiftCardSubmission> {
        const submission = await this.submissionRepo.findById(submissionId);
        if (!submission) {
            throw new ValidationError('Gift card submission not found');
        }
        if (submission.status !== 'pending_validation') {
            throw new ValidationError(`Cannot approve submission with status: ${submission.status}`);
        }

        const amountNgn = Number(submission.amount_ngn);
        if (amountNgn <= 0) {
            throw new ValidationError('Invalid submission amount');
        }

        const transactionId = `TXN_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const now = new Date().toISOString();

        await this.walletService.creditUserWallet(submission.user_id, amountNgn);

        const txRecord: Partial<ITransaction> = {
            transaction_id: transactionId,
            user_id: submission.user_id,
            related_entity_type: RelatedEntityType.GIFTCARD_SALE,
            related_entity_id: submissionId,
            type: TransactionType.PAYMENT,
            amount: amountNgn,
            currency: 'NGN',
            status: TransactionStatus.COMPLETED,
            description: `Gift card sale (${submission.card_type}) - ₦${amountNgn.toFixed(2)}`,
            metadata: {
                gift_card_submission_id: submissionId,
                card_type: submission.card_type,
                approved_by: adminUserId,
                admin_notes: notes
            },
            completed_at: now,
            created_at: now,
            updated_at: now
        };
        await this.transactionRepo.create(txRecord as ITransaction);

        const updated = await this.submissionRepo.update(submissionId, {
            status: 'approved',
            validated_by: adminUserId,
            validated_at: now,
            transaction_id: transactionId,
            admin_notes: notes ?? undefined,
            updated_at: now
        });

        Console.info('Gift card submission approved', {
            submissionId,
            userId: submission.user_id,
            amountNgn,
            adminUserId
        });
        return updated!;
    }

    async reject(
        submissionId: string,
        adminUserId: string,
        reason: string
    ): Promise<IGiftCardSubmission> {
        const submission = await this.submissionRepo.findById(submissionId);
        if (!submission) {
            throw new ValidationError('Gift card submission not found');
        }
        if (submission.status !== 'pending_validation') {
            throw new ValidationError(`Cannot reject submission with status: ${submission.status}`);
        }
        if (!reason || reason.trim() === '') {
            throw new ValidationError('Rejection reason is required');
        }

        const now = new Date().toISOString();
        const updated = await this.submissionRepo.update(submissionId, {
            status: 'rejected',
            validated_by: adminUserId,
            validated_at: now,
            rejection_reason: reason.trim(),
            updated_at: now
        });

        Console.info('Gift card submission rejected', {
            submissionId,
            userId: submission.user_id,
            adminUserId
        });
        return updated!;
    }
}
