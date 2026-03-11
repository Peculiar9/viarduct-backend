export interface PaystackInitializeResponse {
    status: boolean;
    message: string;
    data: {
        authorization_url: string;
        access_code: string;
        reference: string;
    };
}

export interface PaystackVerifyResponse {
    status: boolean;
    message: string;
    data: {
        amount: number;
        currency: string;
        transaction_date: string;
        status: string;
        reference: string;
        domain: string;
        metadata: any;
        gateway_response: string;
        message: string;
        channel: string;
        ip_address: string;
        log: any;
        fees: number;
        authorization: {
            authorization_code: string;
            bin: string;
            last4: string;
            exp_month: string;
            exp_year: string;
            channel: string;
            card_type: string;
            bank: string;
            country_code: string;
            brand: string;
            reusable: boolean;
            signature: string;
            account_name: string | null;
        };
        customer: {
            id: number;
            first_name: string;
            last_name: string;
            email: string;
            customer_code: string;
            phone: string | null;
            metadata: any;
            risk_action: string;
        };
        plan: any;
        split: any;
        order_id: any;
        paid_at: string;
        created_at: string;
        requested_amount: number;
        pos_transaction_data: any;
        source: any;
        fees_breakdown: any;
    };
}

export interface IPaystackService {
    /**
     * Initialize a Paystack transaction
     * @param amount Amount in kobo (smallest currency unit)
     * @param email User email
     * @param callbackUrl URL to redirect to after payment
     * @param metadata Optional metadata
     * @returns Paystack initialization response
     */
    initializeTransaction(
        amount: number,
        email: string,
        callbackUrl: string,
        metadata?: Record<string, any>
    ): Promise<PaystackInitializeResponse>;

    /**
     * Verify a Paystack transaction
     * @param reference Transaction reference
     * @returns Paystack verification response
     */
    verifyPayment(reference: string): Promise<PaystackVerifyResponse>;

    /**
     * Charge authorization (renew transaction)
     * @param authorizationCode Authorization code from previous transaction
     * @param email User email
     * @param amount Amount in kobo
     * @param metadata Optional metadata
     * @returns Paystack charge response
     */
    chargeAuthorization(
        authorizationCode: string,
        email: string,
        amount: number,
        metadata?: Record<string, any>
    ): Promise<any>;

    verifyAccountNumber(accountNumber: string, bankCode: string): Promise<PaystackResolveAccountResponse>;
    createTransferRecipient(accountNumber: string, bankCode: string, accountName: string): Promise<PaystackTransferRecipientResponse>;
    initiateTransfer(amountInNaira: number, recipientCode: string, reason?: string): Promise<PaystackTransferResponse>;
    fetchBanks(): Promise<PaystackBanksResponse>;
}

export interface PaystackResolveAccountResponse {
    status: boolean;
    message: string;
    data: { account_number: string; account_name: string; bank_id: number; bank?: { name: string; id: number; code: string } };
}

export interface PaystackTransferRecipientResponse {
    status: boolean;
    message: string;
    data: { recipient_code: string; details: { account_number: string; account_name: string; bank_code: string; bank_name: string } };
}

export interface PaystackTransferResponse {
    status: boolean;
    message: string;
    data: { transfer_code: string; reference: string; status: string };
}

export interface PaystackBanksResponse {
    status: boolean;
    message: string;
    data: Array<{ id: number; name: string; code: string; longcode: string }>;
}

