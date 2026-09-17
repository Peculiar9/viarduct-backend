import {
    GiftCardPaymentCurrency,
    GiftCardPurchaseView
} from '../Entities/giftcard/IGiftCardTransaction';
import { GiftCardProduct } from './IGiftCardProvider';

export interface PurchaseGiftCardRequest {
    productId: number;
    amount: number;
    recipientEmail: string;
    countryCode?: string;
    paymentCurrency?: GiftCardPaymentCurrency;
    /** Wallet debit amount; defaults to `amount` when omitted. */
    paymentAmount?: number;
    senderName?: string;
    productName?: string;
    pin: string;
}

export interface IGiftCardPurchaseService {
    getCatalog(countryCode?: string): Promise<GiftCardProduct[]>;
    purchase(userId: string, request: PurchaseGiftCardRequest): Promise<GiftCardPurchaseView>;
    getMyPurchases(
        userId: string,
        limit?: number,
        offset?: number
    ): Promise<{ items: GiftCardPurchaseView[]; total: number }>;
    getPurchaseById(userId: string, purchaseId: string): Promise<GiftCardPurchaseView | null>;
}
