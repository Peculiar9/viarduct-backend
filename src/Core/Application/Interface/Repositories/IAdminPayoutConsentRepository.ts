import { AdminPayoutConsentStatus, IAdminPayoutConsent } from '../Entities/trading/IAdminPayoutConsent';

export interface IAdminPayoutConsentRepository {
    create(entity: IAdminPayoutConsent): Promise<IAdminPayoutConsent>;
    findById(id: string): Promise<IAdminPayoutConsent | null>;
    findByConsentCode(code: string): Promise<IAdminPayoutConsent | null>;
    findByAdminId(
        adminId: string,
        filters?: { status?: AdminPayoutConsentStatus; limit?: number; offset?: number }
    ): Promise<IAdminPayoutConsent[]>;
    findAll(filters?: {
        admin_id?: string;
        status?: AdminPayoutConsentStatus;
        limit?: number;
        offset?: number;
    }): Promise<IAdminPayoutConsent[]>;
    countAll(filters?: { admin_id?: string; status?: AdminPayoutConsentStatus }): Promise<number>;
    update(id: string, entity: Partial<IAdminPayoutConsent>): Promise<IAdminPayoutConsent | null>;
}
