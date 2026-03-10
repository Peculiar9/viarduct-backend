import { IsNotEmpty, IsNumber, IsString, IsUrl, Min, IsEnum, IsOptional } from 'class-validator';

export class InitializePaymentDTO {
    @IsNotEmpty({ message: 'Amount is required' })
    @IsNumber({}, { message: 'Amount must be a number' })
    @Min(1, { message: 'Minimum amount is ₦1' })
    amount: number; // Amount in naira (backend will convert to kobo)

    @IsNotEmpty({ message: 'Payment method is required' })
    @IsEnum(['paystack'], { message: 'Payment method must be paystack' })
    payment_method: 'paystack';

    @IsNotEmpty({ message: 'Redirect URL is required' })
    @IsUrl({ 
        require_protocol: true,
        require_tld: false, 
        allow_underscores: true
    }, { message: 'Redirect URL must be a valid URL (e.g., http://localhost:3000 or https://example.com)' })
    redirect_url: string;
}

export class VerifyPaymentDTO {
    @IsNotEmpty({ message: 'Reference is required' })
    @IsString({ message: 'Reference must be a string' })
    reference: string;
}

/**
 * For mobile/FE-initiated Paystack: FE sends reference + amount after initializing with Paystack SDK.
 * Backend only creates the pending transaction record (no Paystack API call).
 */
export class VerifyInitializationDTO {
    @IsNotEmpty({ message: 'Reference is required' })
    @IsString({ message: 'Reference must be a string' })
    reference: string;

    @IsNotEmpty({ message: 'Amount is required' })
    @IsNumber({}, { message: 'Amount must be a number' })
    @Min(1, { message: 'Minimum amount is ₦1' })
    amount: number; // Amount in naira
}

export interface PaymentInitializeResponseDTO {
    authorization_url: string;
    access_code: string;
    reference: string;
}

export interface PaymentVerifyResponseDTO {
    transaction_id: string;
    reference: string;
    amount: number;
    currency: string;
    status: string;
    message: string;
}

export interface VerifyInitializationResponseDTO {
    reference: string;
    transaction_id: string;
    amount: number;
    status: string;
    message: string;
}

