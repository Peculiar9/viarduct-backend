import { inject, injectable } from 'inversify';
import { TYPES } from '../../../Core/Types/Constants';
import { INotificationService } from '../../../Core/Application/Interface/Services/INotificationService';
import { NotificationType } from '../../../Core/Application/Enums/NotificationType';
import { RoleRepository } from '../../Repository/SQL/roles/RoleRepository';
import { UserRole } from '../../../Core/Application/Enums/UserRole';
import { TableNames } from '../../../Core/Application/Enums/TableNames';
import { ITradeIntent } from '../../../Core/Application/Interface/Entities/trading/ITradeIntent';
import { IAdminPayoutConsent } from '../../../Core/Application/Interface/Entities/trading/IAdminPayoutConsent';

@injectable()
export class TradeIntentNotificationHelper {
    constructor(
        @inject(TYPES.NotificationService) private readonly notificationService: INotificationService,
        @inject(TYPES.RoleRepository) private readonly roleRepository: RoleRepository
    ) {}

    private async safeNotify(input: {
        user_id: string;
        title: string;
        content: string;
        url?: string;
        type: NotificationType;
    }): Promise<void> {
        try {
            await this.notificationService.create(input);
        } catch {
            // Non-blocking: notification failures must not break the main flow.
        }
    }

    private async listAdminUserIds(): Promise<string[]> {
        const [adminRole, superAdminRole] = await Promise.all([
            this.roleRepository.findByName(UserRole.ADMIN),
            this.roleRepository.findByName(UserRole.SUPERADMIN)
        ]);

        const roleIds = [adminRole?._id, superAdminRole?._id].filter(Boolean) as string[];
        if (roleIds.length === 0) return [];

        const rows = await this.roleRepository.executeRawQuery(
            `SELECT DISTINCT u._id
             FROM "${TableNames.USERS}" u
             INNER JOIN "${TableNames.USER_ROLES}" ur ON u._id = ur.user_id
             WHERE ur.role_id = ANY($1::uuid[])`,
            [roleIds]
        );

        return (rows || []).map((row: { _id: string }) => row._id).filter(Boolean);
    }

    async onIntentCreated(intent: ITradeIntent): Promise<void> {
        const intentId = intent._id;
        if (!intentId) return;

        const typeLabel = intent.type === 'buy' ? 'Buy' : 'Sell';
        const crypto = String(intent.crypto_type || '').toUpperCase();

        await this.safeNotify({
            user_id: intent.user_id,
            type: NotificationType.ORDER,
            title: `${typeLabel} intent created`,
            content: `Your ${crypto} ${typeLabel.toLowerCase()} intent has been created and is pending review.`,
            url: `/trade-intents/${intentId}`
        });

        const adminIds = await this.listAdminUserIds();
        await Promise.all(
            adminIds.map((adminId) =>
                this.safeNotify({
                    user_id: adminId,
                    type: NotificationType.ORDER,
                    title: `New ${typeLabel.toLowerCase()} intent`,
                    content: `A user submitted a new ${crypto} ${typeLabel.toLowerCase()} intent.`,
                    url: `/admin/trade-intents/${intentId}`
                })
            )
        );
    }

    async onIntentConfirmed(intent: ITradeIntent, adminId: string): Promise<void> {
        const intentId = intent._id;
        if (!intentId) return;

        const typeLabel = intent.type === 'buy' ? 'buy' : 'sell';
        const crypto = String(intent.crypto_type || '').toUpperCase();

        await this.safeNotify({
            user_id: intent.user_id,
            type: NotificationType.ORDER,
            title: 'Intent confirmed',
            content: `Your ${crypto} ${typeLabel} intent has been confirmed by our team.`,
            url: `/trade-intents/${intentId}`
        });

        await this.safeNotify({
            user_id: adminId,
            type: NotificationType.ORDER,
            title: 'Intent confirmed',
            content: `You confirmed a ${crypto} ${typeLabel} intent.`,
            url: `/admin/trade-intents/${intentId}`
        });
    }

    async onIntentPaidOut(intent: ITradeIntent, adminId: string): Promise<void> {
        const intentId = intent._id;
        if (!intentId) return;

        const typeLabel = intent.type === 'buy' ? 'buy' : 'sell';
        const crypto = String(intent.crypto_type || '').toUpperCase();
        const userMessage =
            intent.type === 'buy'
                ? `Your ${crypto} buy intent has been paid out. Crypto has been sent to your wallet.`
                : `Your ${crypto} sell intent has been paid out. Fiat has been sent to your bank account.`;
        const adminMessage =
            intent.type === 'buy'
                ? `You completed crypto payout for a ${crypto} buy intent.`
                : `You completed fiat payout for a ${crypto} sell intent.`;

        await this.safeNotify({
            user_id: intent.user_id,
            type: NotificationType.ORDER,
            title: 'Intent paid out',
            content: userMessage,
            url: `/trade-intents/${intentId}`
        });

        await this.safeNotify({
            user_id: adminId,
            type: NotificationType.ORDER,
            title: 'Payout completed',
            content: adminMessage,
            url: `/admin/trade-intents/${intentId}`
        });
    }

    async onBankAccountSaved(
        userId: string,
        account: { _id?: string; account_name?: string; bank_name?: string }
    ): Promise<void> {
        const bankLabel = account.bank_name || 'bank';
        const accountName = account.account_name || 'account';

        await this.safeNotify({
            user_id: userId,
            type: NotificationType.TRANSACTION,
            title: 'Bank account saved',
            content: `Your ${bankLabel} account (${accountName}) has been added successfully.`,
            url: account._id ? `/bank-accounts/${account._id}` : '/bank-accounts'
        });
    }

    async onConsentCreated(adminId: string, consent: IAdminPayoutConsent): Promise<void> {
        const intentSuffix = consent.intent_id ? ` for intent ${consent.intent_id}` : '';

        await this.safeNotify({
            user_id: adminId,
            type: NotificationType.ORDER,
            title: 'Payout consent created',
            content: `Your payout consent code ${consent.consent_code} was created${intentSuffix}.`,
            url: '/admin/consents'
        });
    }
}
