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
import { IUserBankAccountService } from '../../../Core/Application/Interface/Services/IUserBankAccountService';
import { TransactionRepository } from '../../Repository/SQL/payment/TransactionRepository';
import { CurrencyRepository } from '../../Repository/SQL/wallet/CurrencyRepository';
import { ValidationError } from '../../../Core/Application/Error/AppError';
import { Console } from '../../Utils/Console';
import {
    RelatedEntityType,
    TransactionType,
    TransactionStatus,
    ITransaction
} from '../../../Core/Application/Interface/Entities/payments/IPayment';

const MIN_AMOUNT_NGN = 100;

@injectable()
export class GiftCardService implements IGiftCardService {
    constructor(
        @inject(TYPES.GiftCardSubmissionRepository) private readonly submissionRepo: IGiftCardSubmissionRepository,
        @inject(TYPES.WithdrawalService) private readonly withdrawalService: IWithdrawalService,
        @inject(TYPES.WalletService) private readonly walletService: IWalletService,
        @inject(TYPES.TransactionRepository) private readonly transactionRepo: TransactionRepository,
        @inject(TYPES.CurrencyRepository) private readonly currencyRepo: CurrencyRepository,
        @inject(TYPES.UserBankAccountService) private readonly bankAccountService: IUserBankAccountService
    ) {}

    async submit(
        userId: string,
        data: {
            card_name: string;
            card_type: 'digital' | 'physical';
            digital_code?: string;
            amount: number;
            currencyId: string;
            image_urls: string[];
            pin: string;
            denomination?: string;
            expiry_date?: string;
            notes?: string;
            reference?: string;
            serial_number?: string;
            country?: string;
            bank_account_id?: string;
            prefered_bank_detail?: {
                recipient_bank_code: string;
                recipient_bank_name: string;
                recipient_account_number: string;
            };
        }
    ): Promise<IGiftCardSubmission> {
        if (!data.card_name || data.card_name.trim() === '') {
            throw new ValidationError('Card name is required');
        }
        if (data.amount < MIN_AMOUNT_NGN) {
            throw new ValidationError(`Minimum amount is ${MIN_AMOUNT_NGN}`);
        }
        if (!data.image_urls || data.image_urls.length === 0) {
            throw new ValidationError('At least one gift card image is required');
        }
        if (!data.currencyId || data.currencyId.trim() === '') {
            throw new ValidationError('Currency is required');
        }
        const currency = await this.currencyRepo.findById(data.currencyId.trim());
        if (!currency) {
            throw new ValidationError('Invalid currency. Please select a valid currency.');
        }

        const hasSavedAccount = !!data.bank_account_id;
        const hasPreferredDetail = !!data.prefered_bank_detail;
        if (hasSavedAccount === hasPreferredDetail) {
            throw new ValidationError(
                hasSavedAccount && hasPreferredDetail
                    ? 'You cannot provide both bank_account_id and prefered_bank_detail at the same time'
                    : 'Provide either bank_account_id or prefered_bank_detail for payout'
            );
        }

        const pinValid = await this.withdrawalService.verifyTransactionPin(userId, data.pin);
        if (!pinValid) {
            throw new ValidationError('Invalid transaction PIN');
        }

        let bankAccountId: string | null = null;
        let recipientBankCode: string;
        let recipientBankName: string;
        let recipientAccountNumber: string;
        let recipientAccountName: string;

        if (data.bank_account_id) {
            const saved = await this.bankAccountService.getUserAccountForIntent(userId, data.bank_account_id);
            bankAccountId = saved._id ?? null;
            recipientBankCode = saved.bank_code;
            recipientBankName = saved.bank_name;
            recipientAccountNumber = saved.account_number;
            recipientAccountName = saved.account_name;
        } else {
            const preferred = data.prefered_bank_detail!;
            const resolved = await this.bankAccountService.resolvePreferredBankDetailForIntent(userId, {
                recipient_account_number: preferred.recipient_account_number,
                recipient_bank_code: preferred.recipient_bank_code,
                recipient_bank_name: preferred.recipient_bank_name
            });
            bankAccountId = resolved.bank_account_id ?? null;
            recipientBankCode = resolved.bank_code;
            recipientBankName = resolved.bank_name;
            recipientAccountNumber = resolved.account_number;
            recipientAccountName = resolved.account_name;
            Console.info('Gift card submit bank resolved', {
                userId,
                source: resolved.source,
                bankAccountId
            });
        }

        const now = new Date().toISOString();
        const submission = await this.submissionRepo.create({
            user_id: userId,
            card_name: data.card_name.trim(),
            card_type: data.card_type,
            digital_code: data.digital_code?.trim() || null,
            amount_ngn: data.amount,
            currency_id: data.currencyId.trim() || null,
            image_urls: data.image_urls,
            denomination: data.denomination?.trim() || null,
            expiry_date: data.expiry_date?.trim() || null,
            notes: data.notes?.trim() || null,
            reference: data.reference?.trim() || null,
            serial_number: data.serial_number?.trim() || null,
            country: data.country?.trim() || null,
            bank_account_id: bankAccountId,
            recipient_bank_code: recipientBankCode,
            recipient_bank_name: recipientBankName,
            recipient_account_number: recipientAccountNumber,
            recipient_account_name: recipientAccountName,
            status: 'pending_validation',
            created_at: now,
            updated_at: now
        });

        Console.info('Gift card submission created', {
            submissionId: submission._id,
            userId,
            card_name: data.card_name,
            amount: data.amount,
            bankAccountId
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
        reason: string,
        amountToCredit: number
    ): Promise<IGiftCardSubmission> {
        const submission = await this.submissionRepo.findById(submissionId);
        if (!submission) {
            throw new ValidationError('Gift card submission not found');
        }
        if (submission.status !== 'pending_validation') {
            throw new ValidationError(`Cannot approve submission with status: ${submission.status}`);
        }

        if (amountToCredit <= 0) {
            throw new ValidationError('Amount to credit must be greater than 0');
        }

        const transactionId = `TXN_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const now = new Date().toISOString();

        await this.walletService.creditUserWallet(submission.user_id, amountToCredit);

        const txRecord: Partial<ITransaction> = {
            transaction_id: transactionId,
            user_id: submission.user_id,
            related_entity_type: RelatedEntityType.GIFTCARD_SALE,
            related_entity_id: submissionId,
            type: TransactionType.PAYMENT,
            amount: amountToCredit,
            currency: 'NGN',
            status: TransactionStatus.COMPLETED,
            description: `Gift card sale (${submission.card_name || submission.card_type}) - ₦${amountToCredit.toFixed(2)}`,
            metadata: {
                gift_card_submission_id: submissionId,
                card_type: submission.card_type,
                approved_by: adminUserId,
                admin_notes: reason,
                submitted_amount: submission.amount_ngn,
                payout_bank_account_id: submission.bank_account_id,
                payout_account_number: submission.recipient_account_number,
                payout_account_name: submission.recipient_account_name,
                payout_bank_code: submission.recipient_bank_code,
                payout_bank_name: submission.recipient_bank_name
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
            admin_notes: reason,
            amount_to_credit: amountToCredit,
            updated_at: now
        });

        Console.info('Gift card submission approved', {
            submissionId,
            userId: submission.user_id,
            amountCredited: amountToCredit,
            adminUserId,
            payoutAccount: submission.recipient_account_number
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
