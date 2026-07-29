import { inject, injectable } from 'inversify';
import { randomBytes } from 'crypto';
import { TYPES } from '../../../Core/Types/Constants';
import { IAdminPayoutConsentService } from '../../../Core/Application/Interface/Services/IAdminPayoutConsentService';
import { IAdminPayoutConsentRepository } from '../../../Core/Application/Interface/Repositories/IAdminPayoutConsentRepository';
import {
    AdminPayoutConsentStatus,
    IAdminPayoutConsent
} from '../../../Core/Application/Interface/Entities/trading/IAdminPayoutConsent';
import { UserRepository } from '../../Repository/SQL/users/UserRepository';
import { ValidationError, NotFoundError } from '../../../Core/Application/Error/AppError';
import { TradeIntentNotificationHelper } from './TradeIntentNotificationHelper';

@injectable()
export class AdminPayoutConsentService implements IAdminPayoutConsentService {
    constructor(
        @inject(TYPES.AdminPayoutConsentRepository)
        private readonly consentRepo: IAdminPayoutConsentRepository,
        @inject(TYPES.UserRepository) private readonly userRepo: UserRepository,
        @inject(TYPES.TradeIntentNotificationHelper) private readonly intentNotifications: TradeIntentNotificationHelper
    ) {}

    async createConsent(
        adminId: string,
        options?: { intent_id?: string; expiry_hours?: number }
    ): Promise<IAdminPayoutConsent> {
        const admin = await this.userRepo.findById(adminId);
        if (!admin) {
            throw new NotFoundError('Admin user not found');
        }

        const expiryHours = options?.expiry_hours ?? Number(process.env.PAYOUT_CONSENT_EXPIRY_HOURS || 72);
        const now = new Date();
        const expiresAt = new Date(now.getTime() + expiryHours * 60 * 60 * 1000);
        const consentCode = await this.generateUniqueConsentCode(admin.first_name, admin.last_name, now);
        const nowIso = now.toISOString();

        const consent = await this.consentRepo.create({
            consent_code: consentCode,
            admin_id: adminId,
            status: 'unused',
            intent_id: options?.intent_id ?? null,
            expires_at: expiresAt.toISOString(),
            used_at: null,
            used_for_intent_id: null,
            created_at: nowIso,
            updated_at: nowIso
        });
        void this.intentNotifications.onConsentCreated(adminId, consent);
        return consent;
    }

    async listMyConsents(
        adminId: string,
        filters: { status?: string; limit?: number; offset?: number } = {}
    ): Promise<{ items: IAdminPayoutConsent[]; total: number; limit: number; offset: number }> {
        const status = this.parseStatus(filters.status);
        const limit = filters.limit ?? 50;
        const offset = filters.offset ?? 0;
        const repoFilters = { admin_id: adminId, status };

        const [items, total] = await Promise.all([
            this.consentRepo.findAll({ ...repoFilters, limit, offset }),
            this.consentRepo.countAll(repoFilters)
        ]);

        return { items: items.map((item) => this.withEffectiveStatus(item)), total, limit, offset };
    }

    async listAllConsents(filters: {
        admin_id?: string;
        status?: string;
        limit?: number;
        offset?: number;
    } = {}): Promise<{ items: IAdminPayoutConsent[]; total: number; limit: number; offset: number }> {
        const status = this.parseStatus(filters.status);
        const limit = filters.limit ?? 50;
        const offset = filters.offset ?? 0;
        const repoFilters = { admin_id: filters.admin_id, status };

        const [items, total] = await Promise.all([
            this.consentRepo.findAll({ ...repoFilters, limit, offset }),
            this.consentRepo.countAll(repoFilters)
        ]);

        return { items: items.map((item) => this.withEffectiveStatus(item)), total, limit, offset };
    }

    async validateAndConsumeConsent(
        adminId: string,
        consentCode: string,
        intentId: string
    ): Promise<IAdminPayoutConsent> {
        const consent = await this.consentRepo.findByConsentCode(consentCode);
        if (!consent) {
            throw new ValidationError('Invalid consent code');
        }

        const effective = this.withEffectiveStatus(consent);
        if (effective.status !== 'unused') {
            throw new ValidationError(`Consent is ${effective.status} and cannot be used`);
        }
        if (consent.admin_id !== adminId) {
            throw new ValidationError('This consent was not created by you');
        }
        if (consent.intent_id && consent.intent_id !== intentId) {
            throw new ValidationError('This consent is bound to a different trade intent');
        }

        const nowIso = new Date().toISOString();
        const updated = await this.consentRepo.update(consent._id!, {
            status: 'used',
            used_at: nowIso,
            used_for_intent_id: intentId,
            updated_at: nowIso
        });
        if (!updated) {
            throw new ValidationError('Failed to consume consent');
        }
        return updated;
    }

    private withEffectiveStatus(consent: IAdminPayoutConsent): IAdminPayoutConsent {
        if (consent.status === 'unused' && new Date(consent.expires_at).getTime() < Date.now()) {
            return { ...consent, status: 'expired' };
        }
        return consent;
    }

    private parseStatus(status?: string): AdminPayoutConsentStatus | undefined {
        if (!status) return undefined;
        if (!['unused', 'used', 'expired'].includes(status)) {
            throw new ValidationError(`Invalid consent status filter: ${status}`);
        }
        return status as AdminPayoutConsentStatus;
    }

    private slugPart(value: string): string {
        const slug = value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
        return slug || 'ADMIN';
    }

    private formatDate(date: Date): string {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}${m}${d}`;
    }

    private async generateUniqueConsentCode(
        firstName: string,
        lastName: string,
        date: Date
    ): Promise<string> {
        for (let attempt = 0; attempt < 8; attempt++) {
            const random = randomBytes(2).toString('hex').toUpperCase();
            const code = `${this.slugPart(firstName)}-${this.formatDate(date)}-${this.slugPart(lastName)}-${random}`;
            const existing = await this.consentRepo.findByConsentCode(code);
            if (!existing) {
                return code;
            }
        }
        throw new ValidationError('Failed to generate unique consent code. Please try again.');
    }
}
