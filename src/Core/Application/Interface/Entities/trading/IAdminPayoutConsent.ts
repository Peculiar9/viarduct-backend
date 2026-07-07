export type AdminPayoutConsentStatus = 'unused' | 'used' | 'expired';

export interface IAdminPayoutConsent {
    _id?: string;
    consent_code: string;
    admin_id: string;
    status: AdminPayoutConsentStatus;
    intent_id?: string | null;
    expires_at: string;
    used_at?: string | null;
    used_for_intent_id?: string | null;
    created_at: string;
    updated_at: string;
}
