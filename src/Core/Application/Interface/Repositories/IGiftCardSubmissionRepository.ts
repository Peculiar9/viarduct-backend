import { IGiftCardSubmission } from '../Entities/giftcard/IGiftCardSubmission';

export interface GiftCardSubmissionFiltersForUser {
    card_name?: string;
    card_type?: string;  // 'digital' | 'physical'
    amount?: number;
    status?: string;
    date_from?: string;
    date_to?: string;
}

export interface GiftCardSubmissionFiltersForAdmin {
    status?: string;
    user_id?: string;
    card_name?: string;
    card_type?: string;  // 'digital' | 'physical'
    amount?: number;
    date_from?: string;
    date_to?: string;
    transaction_id?: string;
    validated_by?: string;
}

export interface IGiftCardSubmissionRepository {
    create(entity: IGiftCardSubmission): Promise<IGiftCardSubmission>;
    findById(id: string): Promise<IGiftCardSubmission | null>;
    findByUserId(userId: string, limit?: number, offset?: number): Promise<IGiftCardSubmission[]>;
    findByUserIdWithFilters(userId: string, filters: GiftCardSubmissionFiltersForUser, limit: number, offset: number): Promise<IGiftCardSubmission[]>;
    countByUserIdWithFilters(userId: string, filters: GiftCardSubmissionFiltersForUser): Promise<number>;
    findWithFilters(filters: GiftCardSubmissionFiltersForAdmin, limit: number, offset: number): Promise<IGiftCardSubmission[]>;
    countWithFilters(filters: GiftCardSubmissionFiltersForAdmin): Promise<number>;
    findPending(limit?: number, offset?: number): Promise<IGiftCardSubmission[]>;
    update(id: string, entity: Partial<IGiftCardSubmission>): Promise<IGiftCardSubmission | null>;
}
