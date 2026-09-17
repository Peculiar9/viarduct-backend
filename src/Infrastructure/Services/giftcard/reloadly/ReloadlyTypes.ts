export interface ReloadlyTokenResponse {
    access_token: string;
    expires_in: number;
    token_type?: string;
    scope?: string;
}

export interface ReloadlyProductDto {
    productId: number;
    productName: string;
    global?: boolean;
    status?: string;
    supportsPreOrder?: boolean;
    senderFee?: number;
    senderFeePercentage?: number;
    discountPercentage?: number;
    denominationType?: string;
    recipientCurrencyCode?: string;
    minRecipientDenomination?: number | null;
    maxRecipientDenomination?: number | null;
    senderCurrencyCode?: string;
    minSenderDenomination?: number | null;
    maxSenderDenomination?: number | null;
    fixedRecipientDenominations?: number[] | null;
    fixedSenderDenominations?: number[] | null;
    logoUrls?: string[];
    brand?: {
        brandId?: number;
        brandName?: string;
    };
    country?: {
        isoName?: string;
        name?: string;
        currencyCode?: string;
    };
    redeemInstruction?: {
        concise?: string;
        verbose?: string;
    };
}

export interface ReloadlyProductsResponse {
    content?: ReloadlyProductDto[];
    totalElements?: number;
    totalPages?: number;
    number?: number;
    size?: number;
}

export interface ReloadlyOrderRequest {
    productId: number;
    countryCode: string;
    quantity: number;
    unitPrice: number;
    customIdentifier: string;
    recipientEmail: string;
    senderName?: string;
}

export interface ReloadlyOrderResponse {
    transactionId: number | string;
    amount?: number;
    discount?: number;
    currencyCode?: string;
    fee?: number;
    smsFee?: number;
    recipientEmail?: string;
    customIdentifier?: string;
    status?: string;
    product?: {
        productId?: number;
        productName?: string;
        countryCode?: string;
        quantity?: number;
        unitPrice?: number;
        totalPrice?: number;
        currencyCode?: string;
        brand?: {
            brandId?: number;
            brandName?: string;
        };
    };
}

export interface ReloadlyCardDto {
    cardNumber?: string;
    pinCode?: string;
    pin?: string;
    redemptionUrl?: string;
    redeemCode?: string;
    code?: string;
    instructions?: string;
}

export type ReloadlyCardsResponse = ReloadlyCardDto[] | {
    cards?: ReloadlyCardDto[];
    cardNumber?: string;
    pinCode?: string;
    pin?: string;
    redemptionUrl?: string;
    redeemCode?: string;
    code?: string;
    instructions?: string;
};
