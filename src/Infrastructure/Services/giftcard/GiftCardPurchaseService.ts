import { inject, injectable } from 'inversify';
import { randomUUID } from 'crypto';
import { TYPES } from '../../../Core/Types/Constants';
import {
    IGiftCardPurchaseService,
    PurchaseGiftCardRequest
} from '../../../Core/Application/Interface/Services/IGiftCardPurchaseService';
import { IGiftCardProvider } from '../../../Core/Application/Interface/Services/IGiftCardProvider';
import { IGiftCardTransactionRepository } from '../../../Core/Application/Interface/Repositories/IGiftCardTransactionRepository';
import {
    GiftCardPaymentCurrency,
    GiftCardPurchaseView,
    IGiftCardTransaction
} from '../../../Core/Application/Interface/Entities/giftcard/IGiftCardTransaction';
import { IWalletService } from '../../../Core/Application/Interface/Services/IWalletService';
import { IWithdrawalService } from '../../../Core/Application/Interface/Services/IWithdrawalService';
import { ValidationError, ServiceError } from '../../../Core/Application/Error/AppError';
import { CryptoService } from '../../../Core/Services/CryptoService';
import { Console } from '../../Utils/Console';

@injectable()
export class GiftCardPurchaseService implements IGiftCardPurchaseService {
    constructor(
        @inject(TYPES.GiftCardProvider) private readonly giftCardProvider: IGiftCardProvider,
        @inject(TYPES.GiftCardTransactionRepository)
        private readonly transactionRepo: IGiftCardTransactionRepository,
        @inject(TYPES.WalletService) private readonly walletService: IWalletService,
        @inject(TYPES.WithdrawalService) private readonly withdrawalService: IWithdrawalService
    ) {}

    async getCatalog(countryCode?: string) {
        return this.giftCardProvider.getCatalog(countryCode);
    }

    async purchase(userId: string, request: PurchaseGiftCardRequest): Promise<GiftCardPurchaseView> {
        if (!request.productId || request.productId <= 0) {
            throw new ValidationError('productId is required');
        }
        if (!(request.amount > 0)) {
            throw new ValidationError('amount must be greater than 0');
        }
        if (!request.recipientEmail?.trim()) {
            throw new ValidationError('recipientEmail is required');
        }
        if (!request.pin?.trim()) {
            throw new ValidationError('Transaction PIN is required');
        }

        const pinValid = await this.withdrawalService.verifyTransactionPin(userId, request.pin);
        if (!pinValid) {
            throw new ValidationError('Invalid transaction PIN');
        }

        const paymentCurrency = this.normalizePaymentCurrency(request.paymentCurrency);
        const paymentAmount = Number(request.paymentAmount ?? request.amount);
        if (!(paymentAmount > 0)) {
            throw new ValidationError('paymentAmount must be greater than 0');
        }

        const customIdentifier = `gc_${userId.slice(0, 8)}_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
        const now = new Date().toISOString();

        // 1) Debit wallet first (NGN or crypto)
        await this.debitPayment(userId, paymentCurrency, paymentAmount);
        let debited = true;

        let record: IGiftCardTransaction;
        try {
            // 2) Create PROCESSING transaction
            record = await this.transactionRepo.create({
                user_id: userId,
                product_id: request.productId,
                product_name: request.productName?.trim() || null,
                country_code: request.countryCode?.toUpperCase() || null,
                unit_price: request.amount,
                quantity: 1,
                payment_currency: paymentCurrency,
                payment_amount: paymentAmount,
                recipient_email: request.recipientEmail.trim().toLowerCase(),
                custom_identifier: customIdentifier,
                provider: this.giftCardProvider.providerName,
                status: 'PROCESSING',
                created_at: now,
                updated_at: now
            });
        } catch (error: any) {
            await this.safeRollback(userId, paymentCurrency, paymentAmount);
            debited = false;
            throw error;
        }

        try {
            // 3) Purchase via Reloadly
            const purchase = await this.giftCardProvider.purchaseCard({
                productId: request.productId,
                amount: request.amount,
                recipientEmail: request.recipientEmail.trim().toLowerCase(),
                customIdentifier,
                countryCode: request.countryCode,
                senderName: request.senderName
            });

            // 4) SUCCESS — encrypt claim details
            const completedAt = new Date().toISOString();
            const updated = await this.transactionRepo.update(record._id!, {
                status: 'SUCCESS',
                provider_transaction_id: purchase.providerTransactionId,
                claim_code_encrypted: purchase.cardNumber
                    ? CryptoService.encryptSensitive(purchase.cardNumber)
                    : null,
                pin_encrypted: purchase.pinCode
                    ? CryptoService.encryptSensitive(purchase.pinCode)
                    : null,
                claim_url_encrypted: purchase.claimUrl
                    ? CryptoService.encryptSensitive(purchase.claimUrl)
                    : null,
                activation_instructions: purchase.activationInstructions || null,
                completed_at: completedAt,
                updated_at: completedAt
            });

            Console.info('Gift card purchase succeeded', {
                purchaseId: record._id,
                userId,
                providerTransactionId: purchase.providerTransactionId
            });

            return this.toView(updated ?? record);
        } catch (error: any) {
            // 5) FAILURE — rollback debit + mark FAILED
            const reason = error?.message || 'Gift card purchase failed';
            Console.error(error, {
                message: 'GiftCardPurchaseService::purchase failed',
                purchaseId: record._id,
                userId
            });

            if (debited) {
                await this.safeRollback(userId, paymentCurrency, paymentAmount);
            }

            const failedAt = new Date().toISOString();
            const failed = await this.transactionRepo.update(record._id!, {
                status: 'FAILED',
                failure_reason: reason,
                completed_at: failedAt,
                updated_at: failedAt
            });

            throw new ServiceError(reason);
        }
    }

    async getMyPurchases(
        userId: string,
        limit: number = 50,
        offset: number = 0
    ): Promise<{ items: GiftCardPurchaseView[]; total: number }> {
        const [items, total] = await Promise.all([
            this.transactionRepo.findByUserId(userId, limit, offset),
            this.transactionRepo.countByUserId(userId)
        ]);
        return {
            items: items.map(item => this.toView(item)),
            total
        };
    }

    async getPurchaseById(userId: string, purchaseId: string): Promise<GiftCardPurchaseView | null> {
        const item = await this.transactionRepo.findById(purchaseId);
        if (!item || item.user_id !== userId) {
            return null;
        }
        return this.toView(item);
    }

    private async debitPayment(
        userId: string,
        currency: GiftCardPaymentCurrency,
        amount: number
    ): Promise<void> {
        if (currency === 'NGN') {
            await this.walletService.debitUserWallet(userId, amount);
            return;
        }
        await this.walletService.debitUserWalletByCurrency(userId, currency, amount);
    }

    private async safeRollback(
        userId: string,
        currency: GiftCardPaymentCurrency,
        amount: number
    ): Promise<void> {
        try {
            if (currency === 'NGN') {
                await this.walletService.creditUserWallet(userId, amount);
            } else {
                await this.walletService.creditUserWalletByCurrency(userId, currency, amount);
            }
            Console.info('Gift card purchase debit rolled back', { userId, currency, amount });
        } catch (rollbackError: any) {
            Console.error(rollbackError, {
                message: 'CRITICAL: failed to roll back gift card wallet debit',
                userId,
                currency,
                amount
            });
        }
    }

    private normalizePaymentCurrency(value?: string): GiftCardPaymentCurrency {
        const normalized = String(value || 'NGN').toUpperCase();
        if (normalized === 'NGN' || normalized === 'BTC' || normalized === 'ETH') {
            return normalized;
        }
        throw new ValidationError('paymentCurrency must be NGN, BTC, or ETH');
    }

    private toView(tx: IGiftCardTransaction): GiftCardPurchaseView {
        return {
            _id: tx._id!,
            product_id: Number(tx.product_id),
            product_name: tx.product_name,
            country_code: tx.country_code,
            unit_price: Number(tx.unit_price),
            quantity: Number(tx.quantity),
            payment_currency: tx.payment_currency,
            payment_amount: Number(tx.payment_amount),
            recipient_email: tx.recipient_email,
            custom_identifier: tx.custom_identifier,
            provider: tx.provider,
            provider_transaction_id: tx.provider_transaction_id,
            status: tx.status,
            claim_code: tx.claim_code_encrypted
                ? CryptoService.decryptSensitive(tx.claim_code_encrypted)
                : null,
            pin: tx.pin_encrypted ? CryptoService.decryptSensitive(tx.pin_encrypted) : null,
            claim_url: tx.claim_url_encrypted
                ? CryptoService.decryptSensitive(tx.claim_url_encrypted)
                : null,
            activation_instructions: tx.activation_instructions,
            failure_reason: tx.failure_reason,
            completed_at: tx.completed_at,
            created_at: tx.created_at,
            updated_at: tx.updated_at
        };
    }
}
