import { IGiftCardSubmission } from '../Entities/giftcard/IGiftCardSubmission';
import { GiftCardSubmissionFiltersForUser, GiftCardSubmissionFiltersForAdmin } from '../Interface/Repositories/IGiftCardSubmissionRepository';

export interface IGiftCardService {
    submit(userId: string, cardType: string, amountNgn: number, imageUrls: string[], pin: string): Promise<IGiftCardSubmission>;
    getMySubmissions(userId: string, filters: GiftCardSubmissionFiltersForUser, limit?: number, offset?: number): Promise<{ items: IGiftCardSubmission[]; total: number }>;
    getSubmissionById(userId: string, submissionId: string): Promise<IGiftCardSubmission | null>;
    listWithFilters(filters: GiftCardSubmissionFiltersForAdmin, limit?: number, offset?: number): Promise<{ items: IGiftCardSubmission[]; total: number }>;
    approve(submissionId: string, adminUserId: string, notes?: string): Promise<IGiftCardSubmission>;
    reject(submissionId: string, adminUserId: string, reason: string): Promise<IGiftCardSubmission>;
}
