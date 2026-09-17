export type GiftCardPurchaseStatus = 'PROCESSING' | 'SUCCESS' | 'FAILED';
export type GiftCardPaymentCurrency = 'NGN' | 'BTC' | 'ETH';

export interface IGiftCardTransaction {
    _id?: string;
    user_id: string;
    product_id: number;
    product_name?: string | null;
    country_code?: string | null;
    unit_price: number;
    quantity: number;
    payment_currency: GiftCardPaymentCurrency;
    payment_amount: number;
    recipient_email: string;
    custom_identifier: string;
    provider: string;
    provider_transaction_id?: string | null;
    status: GiftCardPurchaseStatus;
    claim_code_encrypted?: string | null;
    pin_encrypted?: string | null;
    claim_url_encrypted?: string | null;
    activation_instructions?: string | null;
    failure_reason?: string | null;
    completed_at?: string | null;
    created_at: string;
    updated_at: string;
}

/** Safe response shape returned to the purchasing user (decrypted claim details). */
export interface GiftCardPurchaseView {
    _id: string;
    product_id: number;
    product_name?: string | null;
    country_code?: string | null;
    unit_price: number;
    quantity: number;
    payment_currency: GiftCardPaymentCurrency;
    payment_amount: number;
    recipient_email: string;
    custom_identifier: string;
    provider: string;
    provider_transaction_id?: string | null;
    status: GiftCardPurchaseStatus;
    claim_code?: string | null;
    pin?: string | null;
    claim_url?: string | null;
    activation_instructions?: string | null;
    failure_reason?: string | null;
    completed_at?: string | null;
    created_at: string;
    updated_at: string;
}
