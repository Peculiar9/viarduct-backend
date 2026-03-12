export type GiftCardSubmissionStatus = 'pending_validation' | 'approved' | 'rejected';
export type GiftCardFormType = 'digital' | 'physical';

export interface IGiftCardSubmission {
    _id?: string;
    user_id: string;
    card_name?: string | null;    // e.g. 'AMAZON' (stored as text, nullable for legacy rows)
    card_type: GiftCardFormType;   // 'digital' | 'physical'
    digital_code?: string | null;  // code for digital cards
    amount_ngn: number;  // stored in DB; API exposes as "amount"
    currency_id?: string | null;  // FK to currencies (user's chosen currency)
    image_urls: string[];
    denomination?: string | null; // optional e.g. '$50'
    expiry_date?: string | null;  // optional ISO date
    notes?: string | null;        // optional user note
    reference?: string | null;    // e.g. GC_8921AB2
    serial_number?: string | null; // e.g. A89D2231X
    country?: string | null;      // e.g. US
    status: GiftCardSubmissionStatus;
    admin_notes?: string | null;
    validated_by?: string | null;
    validated_at?: string | null;
    rejection_reason?: string | null;
    transaction_id?: string | null;
    amount_to_credit?: number | null;  // Amount credited to user when approved (set by admin)
    created_at: string;
    updated_at: string;
}
