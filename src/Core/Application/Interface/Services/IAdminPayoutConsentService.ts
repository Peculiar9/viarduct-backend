import { IAdminPayoutConsent } from '../Entities/trading/IAdminPayoutConsent';

export interface IAdminPayoutConsentService {
    createConsent(
        adminId: string,
        options?: { intent_id?: string; expiry_hours?: number }
    ): Promise<IAdminPayoutConsent>;
    listMyConsents(
        adminId: string,
        filters?: { status?: string; limit?: number; offset?: number }
    ): Promise<{ items: IAdminPayoutConsent[]; total: number; limit: number; offset: number }>;
    listAllConsents(filters?: {
        admin_id?: string;
        status?: string;
        limit?: number;
        offset?: number;
    }): Promise<{ items: IAdminPayoutConsent[]; total: number; limit: number; offset: number }>;
    validateAndConsumeConsent(
        adminId: string,
        consentCode: string,
        intentId: string
    ): Promise<IAdminPayoutConsent>;
}
