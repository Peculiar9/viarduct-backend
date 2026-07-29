import { inject, injectable } from 'inversify';
import { randomUUID } from 'crypto';
import { TYPES } from '../../../Core/Types/Constants';
import {
    ITradeIntentService
} from '../../../Core/Application/Interface/Services/ITradeIntentService';
import { ITradeIntentRepository } from '../../../Core/Application/Interface/Repositories/ITradeIntentRepository';
import { ITradeIntent, TradeIntentStatus, TradeIntentType } from '../../../Core/Application/Interface/Entities/trading/ITradeIntent';
import { ITradeIntentProofOfPayment } from '../../../Core/Application/Interface/Entities/trading/ITradeIntentProofOfPayment';
import { ICustodyProvider } from '../../../Core/Application/Interface/Services/ICustodyProvider';
import { IAccountVerificationService } from '../../../Core/Application/Interface/Services/IAccountVerificationService';
import { IWithdrawalService } from '../../../Core/Application/Interface/Services/IWithdrawalService';
import { UserRepository } from '../../Repository/SQL/users/UserRepository';
import { TradeQuoteLineItems } from '../../../Core/Application/DTOs/TradeIntentDTO';
import { ServiceError, ValidationError } from '../../../Core/Application/Error/AppError';
import { Console } from '../../Utils/Console';
import { TradeQuoteService } from './TradeQuoteService';
import { IUserBankAccountService } from '../../../Core/Application/Interface/Services/IUserBankAccountService';
import { IAdminPayoutConsentService } from '../../../Core/Application/Interface/Services/IAdminPayoutConsentService';
import { TradeIntentNotificationHelper } from './TradeIntentNotificationHelper';

@injectable()
export class TradeIntentService implements ITradeIntentService {
    constructor(
        @inject(TYPES.TradeIntentRepository) private readonly tradeIntentRepo: ITradeIntentRepository,
        @inject(TYPES.TradeQuoteService) private readonly tradeQuoteService: TradeQuoteService,
        @inject(TYPES.CustodyProvider) private readonly custodyProvider: ICustodyProvider,
        @inject(TYPES.AccountVerificationService) private readonly accountVerificationService: IAccountVerificationService,
        @inject(TYPES.WithdrawalService) private readonly withdrawalService: IWithdrawalService,
        @inject(TYPES.UserRepository) private readonly userRepo: UserRepository,
        @inject(TYPES.UserBankAccountService) private readonly bankAccountService: IUserBankAccountService,
        @inject(TYPES.AdminPayoutConsentService) private readonly consentService: IAdminPayoutConsentService,
        @inject(TYPES.TradeIntentNotificationHelper) private readonly intentNotifications: TradeIntentNotificationHelper
    ) {}

    private async assertUserCanTrade(userId: string, transactionPin?: string): Promise<void> {
        const user = await this.userRepo.findById(userId);
        if (!user) {
            throw new ValidationError('User not found');
        }
        if (!user.has_completed_kyc) {
            throw new ValidationError('KYC verification is required before trading');
        }
        if (!user.has_set_transaction_pin) {
            throw new ValidationError('Transaction PIN not set');
        }
        if (transactionPin) {
            const valid = await this.withdrawalService.verifyTransactionPin(userId, transactionPin);
            if (!valid) {
                throw new ValidationError('Invalid transaction PIN');
            }
        }
    }

    private assetFromType(cryptoType: string): 'BTC' | 'ETH' {
        const asset = cryptoType.toUpperCase();
        if (asset !== 'BTC' && asset !== 'ETH') {
            throw new ValidationError('Only BTC and ETH are supported');
        }
        return asset;
    }

    async getQuote(dto: {
        type: 'buy' | 'sell';
        crypto_type: string;
        crypto_amount?: number;
        fiat_amount?: number;
        external_destination_address?: string;
    }): Promise<TradeQuoteLineItems> {
        if (dto.type === 'sell') {
            if (!dto.crypto_amount) {
                throw new ValidationError('crypto_amount is required for sell quotes');
            }
            return this.tradeQuoteService.buildSellQuote(dto.crypto_type, dto.crypto_amount);
        }
        if (!dto.fiat_amount) {
            throw new ValidationError('fiat_amount is required for buy quotes');
        }
        return this.tradeQuoteService.buildBuyQuote(
            dto.crypto_type,
            dto.fiat_amount,
            dto.external_destination_address ?? ''
        );
    }

    async createSellIntent(
        userId: string,
        dto: {
            crypto_type: string;
            crypto_amount: number;
            bank_account_id?: string;
            prefered_bank_detail?: {
                recipient_bank_code: string;
                recipient_bank_name: string;
                recipient_account_number: string;
            };
            transaction_pin: string;
        }
    ): Promise<ITradeIntent> {
        await this.assertUserCanTrade(userId, dto.transaction_pin);
        const asset = this.assetFromType(dto.crypto_type);
        const quote = await this.tradeQuoteService.buildSellQuote(dto.crypto_type, dto.crypto_amount);

        const hasSavedAccount = !!dto.bank_account_id;
        const hasPreferredDetail = !!dto.prefered_bank_detail;
        if (hasSavedAccount === hasPreferredDetail) {
            throw new ValidationError(
                hasSavedAccount && hasPreferredDetail
                    ? 'You cannot provide both bank_account_id and prefered_bank_detail at the same time'
                    : 'Provide either bank_account_id or prefered_bank_detail'
            );
        }

        let resolvedAccountNumber: string;
        let resolvedBankCode: string;
        let resolvedBankName: string;
        let accountName: string;

        if (dto.bank_account_id) {
            const saved = await this.bankAccountService.getUserAccountForIntent(userId, dto.bank_account_id);
            resolvedAccountNumber = saved.account_number;
            resolvedBankCode = saved.bank_code;
            resolvedBankName = saved.bank_name;
            accountName = saved.account_name;
        } else {
            const preferred = dto.prefered_bank_detail!;
            const verified = await this.accountVerificationService.verifyAccountNumber(
                preferred.recipient_account_number,
                preferred.recipient_bank_code
            );
            if (!verified.status || !verified.data) {
                throw new ValidationError(verified.message || 'Bank account verification failed');
            }
            accountName = verified.data.account_name;
            resolvedAccountNumber = verified.data.account_number;
            resolvedBankCode = verified.data.bank?.code ?? preferred.recipient_bank_code;
            resolvedBankName = verified.data.bank?.name ?? preferred.recipient_bank_name ?? '';
        }

        const nowIso = new Date().toISOString();
        const intent = await this.tradeIntentRepo.create({
            user_id: userId,
            type: 'sell',
            status: 'pending',
            crypto_type: asset,
            settlement_mode: 'controlled_p2p',
            spot_price_ngn: quote.spot_price_ngn,
            buy_rate: quote.buy_rate,
            sell_rate: quote.sell_rate,
            rate_used: quote.rate_used,
            quoted_crypto_amount: quote.gross_crypto_amount,
            quoted_fiat_amount: quote.gross_fiat_amount,
            quoted_gas_crypto: quote.gas_crypto,
            quoted_gas_ngn: quote.gas_ngn,
            net_crypto_amount: quote.net_crypto_amount,
            net_fiat_payout: quote.net_fiat_payout,
            quote_expires_at: quote.quote_expires_at,
            recipient_bank_code: resolvedBankCode,
            recipient_bank_name: resolvedBankName,
            recipient_account_number: resolvedAccountNumber,
            recipient_account_name: accountName,
            custody_provider: this.custodyProvider.providerName,
            created_at: nowIso,
            updated_at: nowIso
        });

        const deposit = await this.custodyProvider.createDepositAddress(intent._id!, asset);
        await this.custodyProvider.registerDepositWatcher(deposit.address, intent._id!, asset);

        const updated = await this.tradeIntentRepo.update(intent._id!, {
            deposit_address: deposit.address,
            deposit_derivation_path: deposit.derivationPath,
            updated_at: new Date().toISOString()
        });

        Console.info('Sell trade intent created', {
            intentId: intent._id,
            depositAddress: deposit.address
        });

        const result = updated ?? intent;
        void this.intentNotifications.onIntentCreated(result);
        return result;
    }

    async createBuyIntent(
        userId: string,
        dto: {
            crypto_type: string;
            fiat_amount: number;
            external_destination_address: string;
            bank_account_id?: string;
            fiat_payment_reference?: string;
            transaction_pin: string;
        }
    ): Promise<ITradeIntent> {
        await this.assertUserCanTrade(userId, dto.transaction_pin);
        const asset = this.assetFromType(dto.crypto_type);
        const quote = await this.tradeQuoteService.buildBuyQuote(
            dto.crypto_type,
            dto.fiat_amount,
            dto.external_destination_address
        );

        const corporateAccount = dto.bank_account_id
            ? await this.bankAccountService.getCorporateAccountForBuy(dto.bank_account_id)
            : await this.bankAccountService.getDefaultCorporateAccount();
        const nowIso = new Date().toISOString();
        const intent = await this.tradeIntentRepo.create({
            user_id: userId,
            type: 'buy',
            status: 'pending',
            crypto_type: asset,
            settlement_mode: 'controlled_p2p',
            spot_price_ngn: quote.spot_price_ngn,
            buy_rate: quote.buy_rate,
            sell_rate: quote.sell_rate,
            rate_used: quote.rate_used,
            quoted_crypto_amount: quote.gross_crypto_amount,
            quoted_fiat_amount: quote.gross_fiat_amount,
            quoted_gas_crypto: quote.gas_crypto,
            quoted_gas_ngn: quote.gas_ngn,
            net_crypto_amount: quote.net_crypto_amount,
            quote_expires_at: quote.quote_expires_at,
            external_destination_address: dto.external_destination_address.trim(),
            fiat_amount_expected: dto.fiat_amount,
            fiat_payment_reference: dto.fiat_payment_reference ?? null,
            corporate_bank_account_id: corporateAccount._id ?? null,
            fiat_destination_bank_code: corporateAccount.bank_code,
            fiat_destination_bank_name: corporateAccount.bank_name,
            fiat_destination_account_number: corporateAccount.account_number,
            fiat_destination_account_name: corporateAccount.account_name,
            proof_of_payment: [],
            custody_provider: this.custodyProvider.providerName,
            created_at: nowIso,
            updated_at: nowIso
        });
        void this.intentNotifications.onIntentCreated(intent);
        return intent;
    }

    async getUserIntents(
        userId: string,
        filters: {
            status?: string;
            type?: string;
            crypto_type?: string;
            date_from?: string;
            date_to?: string;
            limit?: number;
            offset?: number;
        } = {}
    ): Promise<{ items: ITradeIntent[]; total: number; limit: number; offset: number }> {
        const limit = filters.limit ?? 50;
        const offset = filters.offset ?? 0;
        const status = this.parseIntentStatus(filters.status);
        const type = this.parseIntentType(filters.type);

        const repoFilters = {
            user_id: userId,
            status,
            type,
            crypto_type: filters.crypto_type,
            date_from: filters.date_from,
            date_to: filters.date_to
        };

        const [items, total] = await Promise.all([
            this.tradeIntentRepo.findWithFilters({ ...repoFilters, limit, offset }),
            this.tradeIntentRepo.countWithFilters(repoFilters)
        ]);

        return {
            items: items.map((intent) => this.normalizeIntent(intent)),
            total,
            limit,
            offset
        };
    }

    async submitProofOfPayment(
        userId: string,
        intentId: string,
        proofs: Array<{ title: string; description?: string; url: string }>
    ): Promise<ITradeIntent> {
        const intent = await this.getIntentById(intentId, userId);
        if (!intent) {
            throw new ValidationError('Trade intent not found');
        }
        if (intent.type !== 'buy') {
            throw new ValidationError('Proof of payment can only be submitted for buy intents');
        }
        if (intent.status !== 'pending') {
            throw new ValidationError('Proof of payment can only be added while the intent is pending');
        }

        const nowIso = new Date().toISOString();
        const newEntries: ITradeIntentProofOfPayment[] = proofs.map((proof) => ({
            id: randomUUID(),
            title: proof.title.trim(),
            description: proof.description?.trim() ?? null,
            url: proof.url.trim(),
            uploaded_at: nowIso
        }));

        const existing = this.normalizeProofOfPayment(intent.proof_of_payment);
        const merged = [...existing, ...newEntries];
        const updated = await this.tradeIntentRepo.update(intentId, {
            proof_of_payment: JSON.stringify(merged) as unknown as ITradeIntentProofOfPayment[],
            updated_at: nowIso
        });
        if (!updated) {
            throw new ServiceError('Failed to save proof of payment');
        }
        return this.normalizeIntent(updated);
    }

    private parseIntentStatus(status?: string): TradeIntentStatus | undefined {
        if (!status) return undefined;
        const allowed: TradeIntentStatus[] = [
            'pending',
            'crypto_detected',
            'fiat_verified',
            'processing',
            'settled',
            'failed',
            'cancelled'
        ];
        if (!allowed.includes(status as TradeIntentStatus)) {
            throw new ValidationError(`Invalid status filter: ${status}`);
        }
        return status as TradeIntentStatus;
    }

    private parseIntentType(type?: string): TradeIntentType | undefined {
        if (!type) return undefined;
        if (type !== 'buy' && type !== 'sell') {
            throw new ValidationError(`Invalid type filter: ${type}`);
        }
        return type;
    }

    private normalizeProofOfPayment(value: unknown): ITradeIntentProofOfPayment[] {
        if (!value) return [];
        if (Array.isArray(value)) return value as ITradeIntentProofOfPayment[];
        if (typeof value === 'string') {
            try {
                const parsed = JSON.parse(value);
                return Array.isArray(parsed) ? parsed : [];
            } catch {
                return [];
            }
        }
        return [];
    }

    private normalizeIntent(intent: ITradeIntent): ITradeIntent {
        return {
            ...intent,
            proof_of_payment: this.normalizeProofOfPayment(intent.proof_of_payment),
            admin_payout_proof: this.normalizeProofOfPayment(intent.admin_payout_proof)
        };
    }

    async getIntentById(id: string, userId?: string): Promise<ITradeIntent | null> {
        const intent = await this.tradeIntentRepo.findById(id);
        if (!intent) {
            return null;
        }
        if (userId && intent.user_id !== userId) {
            throw new ValidationError('Trade intent not found');
        }
        return this.normalizeIntent(intent);
    }

    async cancelIntent(userId: string, intentId: string): Promise<ITradeIntent> {
        const intent = await this.getIntentById(intentId, userId);
        if (!intent) {
            throw new ValidationError('Trade intent not found');
        }
        if (intent.status !== 'pending') {
            throw new ValidationError('Only pending intents can be cancelled');
        }
        const updated = await this.tradeIntentRepo.update(intentId, {
            status: 'cancelled',
            updated_at: new Date().toISOString()
        });
        if (!updated) {
            throw new ServiceError('Failed to cancel trade intent');
        }
        return updated;
    }

    async adminListIntents(filters: {
        status?: string;
        type?: string;
        crypto_type?: string;
        user_id?: string;
        date_from?: string;
        date_to?: string;
        limit?: number;
        offset?: number;
    }): Promise<{ items: ITradeIntent[]; total: number; limit: number; offset: number }> {
        const limit = filters.limit ?? 50;
        const offset = filters.offset ?? 0;
        const status = filters.status ? this.parseIntentStatus(filters.status) : undefined;
        const type = filters.type ? this.parseIntentType(filters.type) : undefined;

        const repoFilters = {
            status,
            type,
            crypto_type: filters.crypto_type,
            user_id: filters.user_id,
            date_from: filters.date_from,
            date_to: filters.date_to
        };

        const [items, total] = await Promise.all([
            this.tradeIntentRepo.findWithFilters({ ...repoFilters, limit, offset }),
            this.tradeIntentRepo.countWithFilters(repoFilters)
        ]);

        return {
            items: items.map((intent) => this.normalizeIntent(intent)),
            total,
            limit,
            offset
        };
    }

    async adminConfirmIntent(
        adminId: string,
        dto: {
            intent_id: string;
            intent_type: 'buy' | 'sell';
            buy_metadata?: {
                confirmation_note: string;
                total_amount_confirmed: number;
            };
            sell_metadata?: {
                confirmation_note: string;
                total_crypto_amount_confirmed: number;
                tx_reference: string;
            };
        }
    ): Promise<ITradeIntent> {
        const intent = await this.tradeIntentRepo.findById(dto.intent_id);
        if (!intent) {
            throw new ValidationError('Trade intent not found');
        }
        if (intent.type !== dto.intent_type) {
            throw new ValidationError(`Intent type mismatch: intent is ${intent.type}, not ${dto.intent_type}`);
        }

        const now = new Date().toISOString();

        if (dto.intent_type === 'buy') {
            if (!dto.buy_metadata) {
                throw new ValidationError('buy_metadata is required for buy intent confirmation');
            }
            if (intent.status !== 'pending') {
                throw new ValidationError('Buy intent can only be confirmed while pending');
            }

            const updated = await this.tradeIntentRepo.update(dto.intent_id, {
                status: 'fiat_verified',
                confirmation_note: dto.buy_metadata.confirmation_note,
                total_amount_confirmed: dto.buy_metadata.total_amount_confirmed,
                admin_confirmed_at: now,
                admin_confirmed_by: adminId,
                fiat_verified_at: now,
                fiat_verified_by: adminId,
                updated_at: now
            });
            if (!updated) {
                throw new ServiceError('Failed to confirm buy intent');
            }
            const normalized = this.normalizeIntent(updated);
            void this.intentNotifications.onIntentConfirmed(normalized, adminId);
            return normalized;
        }

        if (!dto.sell_metadata) {
            throw new ValidationError('sell_metadata is required for sell intent confirmation');
        }
        if (intent.status !== 'pending' && intent.status !== 'crypto_detected') {
            throw new ValidationError('Sell intent can only be confirmed while pending or crypto_detected');
        }

        const updated = await this.tradeIntentRepo.update(dto.intent_id, {
            status: 'crypto_detected',
            confirmation_note: dto.sell_metadata.confirmation_note,
            total_crypto_amount_confirmed: dto.sell_metadata.total_crypto_amount_confirmed,
            confirmation_tx_reference: dto.sell_metadata.tx_reference,
            incoming_tx_hash: dto.sell_metadata.tx_reference,
            incoming_crypto_amount: dto.sell_metadata.total_crypto_amount_confirmed,
            crypto_detected_at: intent.crypto_detected_at ?? now,
            admin_confirmed_at: now,
            admin_confirmed_by: adminId,
            updated_at: now
        });
        if (!updated) {
            throw new ServiceError('Failed to confirm sell intent');
        }
        const normalized = this.normalizeIntent(updated);
        void this.intentNotifications.onIntentConfirmed(normalized, adminId);
        return normalized;
    }

    async adminPayoutIntent(
        adminId: string,
        dto: {
            intent_id: string;
            intent_type: 'buy' | 'sell';
            consent_code: string;
            date_of_payment: string;
            buy_metadata?: {
                outgoing_tx_hash: string;
            };
            sell_metadata?: {
                proof_of_payment: Array<{ title: string; description?: string; url: string }>;
            };
        }
    ): Promise<{
        intent: ITradeIntent;
        payout: {
            payout_status: 'processing' | 'completed';
            receiver_address?: string;
            crypto_amount?: number;
            outgoing_tx_hash?: string;
            fiat_payout_amount?: number;
            date_of_payment: string;
        };
    }> {
        const intent = await this.tradeIntentRepo.findById(dto.intent_id);
        if (!intent) {
            throw new ValidationError('Trade intent not found');
        }
        if (intent.type !== dto.intent_type) {
            throw new ValidationError(`Intent type mismatch: intent is ${intent.type}, not ${dto.intent_type}`);
        }
        if (intent.payout_at) {
            throw new ValidationError('This intent has already been paid out');
        }

        const consent = await this.consentService.validateAndConsumeConsent(
            adminId,
            dto.consent_code,
            dto.intent_id
        );
        const payoutDate = this.parsePayoutDate(dto.date_of_payment);
        const nowIso = new Date().toISOString();
        const isManualMode =
            this.custodyProvider.providerName === 'manual' ||
            (process.env.TRANSACTION_MODE || 'automated').toLowerCase().trim() === 'manual';

        if (dto.intent_type === 'buy') {
            if (intent.status !== 'fiat_verified') {
                throw new ValidationError('Buy intent must be fiat_verified before crypto payout');
            }
            if (!intent.external_destination_address) {
                throw new ServiceError('Missing external destination address');
            }

            const asset = this.assetFromType(intent.crypto_type);
            const amount = Number(intent.net_crypto_amount);

            await this.tradeIntentRepo.update(dto.intent_id, {
                status: 'processing',
                payout_consent_id: consent._id ?? null,
                payout_date: payoutDate,
                payout_by: adminId,
                updated_at: nowIso
            });

            let outgoingTxHash: string;
            let feeCrypto: number | undefined;

            if (isManualMode) {
                const manualTxHash = dto.buy_metadata?.outgoing_tx_hash?.trim();
                if (!manualTxHash) {
                    throw new ValidationError(
                        'buy_metadata.outgoing_tx_hash is required for buy payouts in manual mode'
                    );
                }
                outgoingTxHash = manualTxHash;
                feeCrypto = intent.quoted_gas_crypto ?? undefined;
            } else {
                const broadcast = await this.custodyProvider.broadcastOutbound(
                    asset,
                    intent.external_destination_address,
                    amount
                );
                outgoingTxHash = broadcast.txHash;
                feeCrypto = broadcast.feeCrypto ?? intent.quoted_gas_crypto ?? undefined;
            }

            const updated = await this.tradeIntentRepo.update(dto.intent_id, {
                status: 'settled',
                outgoing_tx_hash: outgoingTxHash,
                actual_gas_crypto: feeCrypto ?? intent.quoted_gas_crypto,
                settled_at: nowIso,
                settled_by: adminId,
                payout_at: nowIso,
                updated_at: nowIso
            });
            if (!updated) {
                throw new ServiceError('Failed to complete buy payout');
            }

            const normalized = this.normalizeIntent(updated);
            void this.intentNotifications.onIntentPaidOut(normalized, adminId);
            return {
                intent: normalized,
                payout: {
                    payout_status: 'completed',
                    receiver_address: intent.external_destination_address,
                    crypto_amount: amount,
                    outgoing_tx_hash: outgoingTxHash,
                    date_of_payment: payoutDate
                }
            };
        }

        if (!dto.sell_metadata?.proof_of_payment?.length) {
            throw new ValidationError('sell_metadata.proof_of_payment is required for sell payout');
        }
        if (intent.status !== 'crypto_detected') {
            throw new ValidationError('Sell intent must be crypto_detected before fiat payout');
        }

        const payoutProof = dto.sell_metadata.proof_of_payment.map((proof) => ({
            id: randomUUID(),
            title: proof.title.trim(),
            description: proof.description?.trim() ?? null,
            url: proof.url.trim(),
            uploaded_at: nowIso
        }));

        const updated = await this.tradeIntentRepo.update(dto.intent_id, {
            status: 'settled',
            admin_payout_proof: JSON.stringify(payoutProof) as unknown as ITradeIntentProofOfPayment[],
            payout_consent_id: consent._id ?? null,
            payout_date: payoutDate,
            payout_at: nowIso,
            payout_by: adminId,
            settled_at: nowIso,
            settled_by: adminId,
            actual_gas_ngn: intent.quoted_gas_ngn,
            updated_at: nowIso
        });
        if (!updated) {
            throw new ServiceError('Failed to complete sell payout');
        }

        const normalized = this.normalizeIntent(updated);
        void this.intentNotifications.onIntentPaidOut(normalized, adminId);
        return {
            intent: normalized,
            payout: {
                payout_status: 'completed',
                fiat_payout_amount: Number(intent.net_fiat_payout ?? intent.quoted_fiat_amount),
                date_of_payment: payoutDate
            }
        };
    }

    async getPayoutStatus(
        intentId: string,
        userId?: string
    ): Promise<{
        intent_id: string;
        type: 'buy' | 'sell';
        status: string;
        payout_status: 'not_started' | 'processing' | 'completed' | 'failed';
        receiver_address?: string | null;
        outgoing_tx_hash?: string | null;
        crypto_amount?: number | null;
        fiat_payout_amount?: number | null;
        date_of_payment?: string | null;
        payout_at?: string | null;
    }> {
        const intent = await this.getIntentById(intentId, userId);
        if (!intent) {
            throw new ValidationError('Trade intent not found');
        }

        let payout_status: 'not_started' | 'processing' | 'completed' | 'failed' = 'not_started';
        if (intent.status === 'failed') {
            payout_status = 'failed';
        } else if (intent.status === 'processing') {
            payout_status = 'processing';
        } else if (intent.payout_at || intent.status === 'settled') {
            payout_status = 'completed';
        }

        return {
            intent_id: intent._id!,
            type: intent.type,
            status: intent.status,
            payout_status,
            receiver_address: intent.type === 'buy' ? intent.external_destination_address ?? null : null,
            outgoing_tx_hash: intent.outgoing_tx_hash ?? null,
            crypto_amount: intent.type === 'buy' ? Number(intent.net_crypto_amount) : null,
            fiat_payout_amount:
                intent.type === 'sell'
                    ? Number(intent.net_fiat_payout ?? intent.quoted_fiat_amount)
                    : null,
            date_of_payment: intent.payout_date ?? null,
            payout_at: intent.payout_at ?? null
        };
    }

    private parsePayoutDate(value: string): string {
        const parsed = new Date(value);
        if (Number.isNaN(parsed.getTime())) {
            throw new ValidationError('date_of_payment must be a valid date (YYYY-MM-DD or ISO string)');
        }
        return parsed.toISOString().slice(0, 10);
    }

    async adminVerifyFiat(adminId: string, intentId: string, adminNotes?: string): Promise<ITradeIntent> {
        const intent = await this.tradeIntentRepo.findById(intentId);
        if (!intent || intent.type !== 'buy') {
            throw new ValidationError('Buy trade intent not found');
        }
        if (intent.status !== 'pending') {
            throw new ValidationError('Intent is not awaiting fiat verification');
        }
        const now = new Date().toISOString();
        const updated = await this.tradeIntentRepo.update(intentId, {
            status: 'fiat_verified',
            fiat_verified_at: now,
            fiat_verified_by: adminId,
            admin_notes: adminNotes ?? intent.admin_notes,
            updated_at: now
        });
        if (!updated) {
            throw new ServiceError('Failed to verify fiat');
        }
        return updated;
    }

    async adminConfirmFiatPayout(
        adminId: string,
        intentId: string,
        adminNotes?: string,
        actualGasNgn?: number
    ): Promise<ITradeIntent> {
        const intent = await this.tradeIntentRepo.findById(intentId);
        if (!intent || intent.type !== 'sell') {
            throw new ValidationError('Sell trade intent not found');
        }
        if (intent.status !== 'crypto_detected') {
            throw new ValidationError('Intent is not ready for fiat payout confirmation');
        }
        const now = new Date().toISOString();
        const updated = await this.tradeIntentRepo.update(intentId, {
            status: 'settled',
            settled_at: now,
            settled_by: adminId,
            admin_notes: adminNotes ?? intent.admin_notes,
            actual_gas_ngn: actualGasNgn ?? intent.quoted_gas_ngn,
            updated_at: now
        });
        if (!updated) {
            throw new ServiceError('Failed to confirm fiat payout');
        }
        return updated;
    }

    async adminReleaseCrypto(adminId: string, intentId: string, adminNotes?: string): Promise<ITradeIntent> {
        const intent = await this.tradeIntentRepo.findById(intentId);
        if (!intent || intent.type !== 'buy') {
            throw new ValidationError('Buy trade intent not found');
        }
        if (intent.status !== 'fiat_verified') {
            throw new ValidationError('Fiat must be verified before releasing crypto');
        }
        if (!intent.external_destination_address) {
            throw new ServiceError('Missing external destination address');
        }

        const asset = this.assetFromType(intent.crypto_type);
        const amount = Number(intent.net_crypto_amount);
        await this.tradeIntentRepo.update(intentId, {
            status: 'processing',
            updated_at: new Date().toISOString()
        });

        const broadcast = await this.custodyProvider.broadcastOutbound(
            asset,
            intent.external_destination_address,
            amount
        );

        const now = new Date().toISOString();
        const updated = await this.tradeIntentRepo.update(intentId, {
            status: 'settled',
            outgoing_tx_hash: broadcast.txHash,
            actual_gas_crypto: broadcast.feeCrypto ?? intent.quoted_gas_crypto,
            settled_at: now,
            settled_by: adminId,
            admin_notes: adminNotes ?? intent.admin_notes,
            updated_at: now
        });
        if (!updated) {
            throw new ServiceError('Failed to finalize crypto release');
        }
        return updated;
    }

    async handleIncomingCryptoDeposit(params: {
        address: string;
        txHash: string;
        amountCrypto: number;
        asset: 'BTC' | 'ETH';
    }): Promise<ITradeIntent | null> {
        const intent = await this.tradeIntentRepo.findByDepositAddress(params.address);
        if (!intent || intent.type !== 'sell') {
            return null;
        }
        if (intent.status !== 'pending' && intent.status !== 'crypto_detected') {
            return intent;
        }
        if (intent.incoming_tx_hash === params.txHash) {
            return intent;
        }

        const minExpected = Number(intent.quoted_crypto_amount) * 0.99;
        if (params.amountCrypto < minExpected) {
            await this.tradeIntentRepo.update(intent._id!, {
                status: 'failed',
                failure_reason: `Underpayment: received ${params.amountCrypto}, expected ${intent.quoted_crypto_amount}`,
                incoming_tx_hash: params.txHash,
                incoming_crypto_amount: params.amountCrypto,
                updated_at: new Date().toISOString()
            });
            return this.tradeIntentRepo.findById(intent._id!);
        }

        const now = new Date().toISOString();
        const updated = await this.tradeIntentRepo.update(intent._id!, {
            status: 'crypto_detected',
            incoming_tx_hash: params.txHash,
            incoming_crypto_amount: params.amountCrypto,
            crypto_detected_at: now,
            updated_at: now
        });
        return updated;
    }

    async verifyBankAccount(
        accountNumber: string,
        bankCode: string
    ): Promise<{
        account_number: string;
        account_name: string;
        bank_code: string;
        bank_name: string;
    }> {
        const resolved = await this.accountVerificationService.verifyAccountNumber(accountNumber, bankCode);
        if (!resolved.status || !resolved.data) {
            throw new ValidationError(resolved.message || 'Could not verify bank account');
        }
        return {
            account_number: resolved.data.account_number,
            account_name: resolved.data.account_name,
            bank_code: bankCode,
            bank_name: resolved.data.bank?.name ?? ''
        };
    }

    async listBanks(name?: string): Promise<Array<{ id: number; name: string; code: string; longcode: string }>> {
        const response = await this.accountVerificationService.fetchBanks();
        if (!response.status || !Array.isArray(response.data)) {
            throw new ServiceError(response.message || 'Failed to fetch banks');
        }

        let banks = [...response.data].sort((a, b) => a.name.localeCompare(b.name));
        const query = name?.trim().toLowerCase();
        if (query) {
            banks = banks.filter(
                (bank) =>
                    bank.name.toLowerCase().includes(query) ||
                    bank.code.includes(query) ||
                    (bank.longcode ?? '').includes(query)
            );
        }
        return banks;
    }
}
