export type GiftCardSubmissionStatus = 'pending_validation' | 'approved' | 'rejected';

export interface IGiftCardSubmission {
    _id?: string;
    user_id: string;
    card_type: string;           // e.g. 'AMAZON', 'STEAM', 'GOOGLE_PLAY'
    amount_ngn: number;          // value in NGN user claims
    image_urls: string[];         // URLs of uploaded gift card images
    status: GiftCardSubmissionStatus;
    admin_notes?: string | null;
    validated_by?: string | null;  // admin user id
    validated_at?: string | null;
    rejection_reason?: string | null;
    transaction_id?: string | null; // wallet transaction id after approval
    created_at: string;
    updated_at: string;
}
