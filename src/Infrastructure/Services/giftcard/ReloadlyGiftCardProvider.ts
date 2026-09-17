import { inject, injectable } from 'inversify';
import { TYPES } from '../../../Core/Types/Constants';
import {
    GiftCardProduct,
    GiftCardPurchaseParams,
    GiftCardPurchaseResult,
    IGiftCardProvider
} from '../../../Core/Application/Interface/Services/IGiftCardProvider';
import { ServiceError, ValidationError } from '../../../Core/Application/Error/AppError';
import { Console } from '../../Utils/Console';
import { ReloadlyClient } from './reloadly/ReloadlyClient';
import { ReloadlyCardDto, ReloadlyCardsResponse, ReloadlyProductDto } from './reloadly/ReloadlyTypes';

@injectable()
export class ReloadlyGiftCardProvider implements IGiftCardProvider {
    readonly providerName = 'reloadly' as const;

    constructor(
        @inject(TYPES.ReloadlyClient) private readonly client: ReloadlyClient
    ) {}

    async getCatalog(countryCode?: string): Promise<GiftCardProduct[]> {
        const products = await this.client.getProducts(countryCode);
        return products.map(p => this.mapProduct(p));
    }

    async purchaseCard(params: GiftCardPurchaseParams): Promise<GiftCardPurchaseResult> {
        if (!params.productId || params.productId <= 0) {
            throw new ValidationError('productId is required');
        }
        if (!(params.amount > 0)) {
            throw new ValidationError('amount must be greater than 0');
        }
        if (!params.recipientEmail?.trim()) {
            throw new ValidationError('recipientEmail is required');
        }
        if (!params.customIdentifier?.trim()) {
            throw new ValidationError('customIdentifier is required');
        }

        const countryCode = (params.countryCode || 'NG').toUpperCase();
        const quantity = params.quantity && params.quantity > 0 ? params.quantity : 1;

        Console.info('ReloadlyGiftCardProvider: creating order', {
            productId: params.productId,
            amount: params.amount,
            countryCode,
            customIdentifier: params.customIdentifier
        });

        const order = await this.client.createOrder({
            productId: params.productId,
            countryCode,
            quantity,
            unitPrice: params.amount,
            customIdentifier: params.customIdentifier,
            recipientEmail: params.recipientEmail.trim(),
            senderName: params.senderName?.trim() || 'Viarduct'
        });

        const providerTransactionId = String(order.transactionId ?? '');
        if (!providerTransactionId) {
            throw new ServiceError('Reloadly order did not return a transactionId');
        }

        let card: ReloadlyCardDto | null = null;
        try {
            const cardsResponse = await this.client.getOrderCards(providerTransactionId);
            card = this.extractFirstCard(cardsResponse);
        } catch (error: any) {
            // Some products deliver asynchronously; order success still stands.
            Console.warn('ReloadlyGiftCardProvider: redeem code fetch deferred', {
                providerTransactionId,
                message: error?.message
            });
        }

        return {
            providerTransactionId,
            status: String(order.status || 'SUCCESS'),
            amount: Number(order.amount ?? params.amount),
            currencyCode: order.currencyCode || order.product?.currencyCode,
            cardNumber: card?.cardNumber || card?.code || card?.redeemCode || null,
            pinCode: card?.pinCode || card?.pin || null,
            claimUrl: card?.redemptionUrl || null,
            activationInstructions: card?.instructions || null,
            raw: order as unknown as Record<string, unknown>
        };
    }

    private mapProduct(dto: ReloadlyProductDto): GiftCardProduct {
        return {
            productId: dto.productId,
            productName: dto.productName,
            brandName: dto.brand?.brandName,
            countryCode: dto.country?.isoName || '',
            currencyCode: dto.recipientCurrencyCode || dto.country?.currencyCode || '',
            denominationType: dto.denominationType || 'FIXED',
            minAmount: dto.minRecipientDenomination ?? null,
            maxAmount: dto.maxRecipientDenomination ?? null,
            fixedDenominations: dto.fixedRecipientDenominations ?? undefined,
            logoUrl: dto.logoUrls?.[0] ?? null,
            redeemInstructionsConcise: dto.redeemInstruction?.concise ?? null,
            status: dto.status
        };
    }

    private extractFirstCard(response: ReloadlyCardsResponse): ReloadlyCardDto | null {
        if (Array.isArray(response)) {
            return response[0] || null;
        }
        if (response.cards && response.cards.length > 0) {
            return response.cards[0];
        }
        if (response.cardNumber || response.pinCode || response.redemptionUrl || response.code) {
            return response;
        }
        return null;
    }
}
