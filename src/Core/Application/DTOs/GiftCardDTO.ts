import {
    IsArray,
    IsNotEmpty,
    IsNumber,
    IsOptional,
    IsString,
    IsUUID,
    Min,
    MinLength,
    ArrayMinSize,
    Matches,
    Length,
    IsIn,
    Validate,
    ValidateNested,
    ValidationArguments,
    ValidatorConstraint,
    ValidatorConstraintInterface
} from 'class-validator';
import { Type } from 'class-transformer';
import { PreferredBankDetailDTO } from './TradeIntentDTO';

@ValidatorConstraint({ name: 'giftCardBankPayoutSourceExclusive', async: false })
class GiftCardBankPayoutSourceExclusiveConstraint implements ValidatorConstraintInterface {
    validate(_value: unknown, args: ValidationArguments): boolean {
        const dto = args.object as SubmitGiftCardDTO;
        const hasId = Boolean(dto.bank_account_id);
        const hasPreferred = Boolean(dto.prefered_bank_detail);
        return hasId !== hasPreferred;
    }

    defaultMessage(args: ValidationArguments): string {
        const dto = args.object as SubmitGiftCardDTO;
        if (dto.bank_account_id && dto.prefered_bank_detail) {
            return 'You cannot provide both bank_account_id and prefered_bank_detail at the same time';
        }
        return 'Provide either bank_account_id or prefered_bank_detail for payout';
    }
}

export class SubmitGiftCardDTO {
    @Validate(GiftCardBankPayoutSourceExclusiveConstraint)
    @IsString()
    @IsNotEmpty({ message: 'Card name is required' })
    card_name: string;

    @IsString()
    @IsIn(['digital', 'physical'], { message: 'Card type must be digital or physical' })
    card_type: 'digital' | 'physical';

    @IsOptional()
    @IsString()
    digital_code?: string;

    @IsNumber()
    @Min(100, { message: 'Minimum amount is 100' })
    amount: number;

    @IsString()
    @IsNotEmpty({ message: 'Currency ID is required' })
    currencyId: string;

    @IsArray()
    @IsString({ each: true })
    @ArrayMinSize(1, { message: 'At least one image URL is required' })
    image_urls: string[];

    @IsOptional()
    @IsString()
    denomination?: string;

    @IsOptional()
    @IsString()
    expiry_date?: string;

    @IsOptional()
    @IsString()
    notes?: string;

    @IsOptional()
    @IsString()
    reference?: string;

    @IsOptional()
    @IsString()
    serial_number?: string;

    @IsOptional()
    @IsString()
    country?: string;

    /** Saved user bank account id (GET /bank-accounts). Mutually exclusive with prefered_bank_detail. */
    @IsOptional()
    @IsUUID()
    bank_account_id?: string;

    /** New bank details to verify/save. Mutually exclusive with bank_account_id. */
    @IsOptional()
    @ValidateNested()
    @Type(() => PreferredBankDetailDTO)
    prefered_bank_detail?: PreferredBankDetailDTO;

    @IsString()
    @IsNotEmpty({ message: 'Transaction PIN is required' })
    @Length(4, 6, { message: 'PIN must be 4-6 digits' })
    @Matches(/^\d+$/, { message: 'PIN must contain only digits' })
    pin: string;
}

export class AdminApproveGiftCardDTO {
    @IsString()
    @IsNotEmpty({ message: 'Reason is required' })
    @MinLength(1, { message: 'Reason must not be empty' })
    reason: string;

    @IsNumber()
    @Min(1, { message: 'Amount to credit must be at least 1 NGN' })
    amount_to_credit: number;
}

export class AdminRejectGiftCardDTO {
    @IsString()
    @IsNotEmpty({ message: 'Reason is required' })
    @MinLength(1, { message: 'Reason must not be empty' })
    reason: string;
}

export class PurchaseGiftCardDTO {
    @IsNumber()
    @Min(1, { message: 'productId is required' })
    productId: number;

    @IsNumber()
    @Min(0.00000001, { message: 'amount must be greater than 0' })
    amount: number;

    @IsString()
    @IsNotEmpty({ message: 'recipientEmail is required' })
    recipientEmail: string;

    @IsOptional()
    @IsString()
    countryCode?: string;

    @IsOptional()
    @IsIn(['NGN', 'BTC', 'ETH'], { message: 'paymentCurrency must be NGN, BTC, or ETH' })
    paymentCurrency?: 'NGN' | 'BTC' | 'ETH';

    @IsOptional()
    @IsNumber()
    @Min(0.00000001)
    paymentAmount?: number;

    @IsOptional()
    @IsString()
    senderName?: string;

    @IsOptional()
    @IsString()
    productName?: string;

    @IsString()
    @IsNotEmpty({ message: 'Transaction PIN is required' })
    @Length(4, 6, { message: 'PIN must be 4-6 digits' })
    @Matches(/^\d+$/, { message: 'PIN must contain only digits' })
    pin: string;
}
