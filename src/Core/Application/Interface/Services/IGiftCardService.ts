import { IGiftCardSubmission } from '../Entities/giftcard/IGiftCardSubmission';
import { GiftCardSubmissionFiltersForUser, GiftCardSubmissionFiltersForAdmin } from '../../Interface/Repositories/IGiftCardSubmissionRepository';

export interface IGiftCardService {
    submit(userId: string, data: {
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
    }): Promise<IGiftCardSubmission>;
    getMySubmissions(userId: string, filters: GiftCardSubmissionFiltersForUser, limit?: number, offset?: number): Promise<{ items: IGiftCardSubmission[]; total: number }>;
    getSubmissionById(userId: string, submissionId: string): Promise<IGiftCardSubmission | null>;
    listWithFilters(filters: GiftCardSubmissionFiltersForAdmin, limit?: number, offset?: number): Promise<{ items: IGiftCardSubmission[]; total: number }>;
    approve(submissionId: string, adminUserId: string, reason: string, amountToCredit: number): Promise<IGiftCardSubmission>;
    reject(submissionId: string, adminUserId: string, reason: string): Promise<IGiftCardSubmission>;
}
