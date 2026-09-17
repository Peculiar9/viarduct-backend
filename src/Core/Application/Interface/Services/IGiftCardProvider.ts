export interface GiftCardProduct {
    productId: number;
    productName: string;
    brandName?: string;
    countryCode: string;
    currencyCode: string;
    denominationType: 'FIXED' | 'RANGE' | string;
    minAmount?: number | null;
    maxAmount?: number | null;
    fixedDenominations?: number[];
    logoUrl?: string | null;
    redeemInstructionsConcise?: string | null;
    status?: string;
}

export interface GiftCardPurchaseParams {
    productId: number;
    amount: number;
    recipientEmail: string;
    customIdentifier: string;
    countryCode?: string;
    quantity?: number;
    senderName?: string;
}

export interface GiftCardPurchaseResult {
    providerTransactionId: string;
    status: string;
    amount: number;
    currencyCode?: string;
    cardNumber?: string | null;
    pinCode?: string | null;
    claimUrl?: string | null;
    activationInstructions?: string | null;
    raw?: Record<string, unknown>;
}

export interface IGiftCardProvider {
    readonly providerName: 'reloadly';

    getCatalog(countryCode?: string): Promise<GiftCardProduct[]>;

    purchaseCard(params: GiftCardPurchaseParams): Promise<GiftCardPurchaseResult>;
}
