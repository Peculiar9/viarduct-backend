import {
    IsIn,
    IsNotEmpty,
    IsNumber,
    IsOptional,
    IsString,
    IsUUID,
    IsUrl,
    IsArray,
    ArrayMinSize,
    Length,
    Matches,
    Min,
    Validate,
    ValidateIf,
    ValidateNested,
    ValidationArguments,
    ValidatorConstraint,
    ValidatorConstraintInterface
} from 'class-validator';
import { Type } from 'class-transformer';

@ValidatorConstraint({ name: 'bankPayoutSourceExclusive', async: false })
class BankPayoutSourceExclusiveConstraint implements ValidatorConstraintInterface {
    validate(_value: unknown, args: ValidationArguments): boolean {
        const dto = args.object as CreateSellIntentDTO;
        const hasId = Boolean(dto.bank_account_id);
        const hasPreferred = Boolean(dto.prefered_bank_detail);
        return hasId !== hasPreferred;
    }

    defaultMessage(args: ValidationArguments): string {
        const dto = args.object as CreateSellIntentDTO;
        if (dto.bank_account_id && dto.prefered_bank_detail) {
            return 'You cannot provide both bank_account_id and prefered_bank_detail at the same time';
        }
        return 'Provide either bank_account_id or prefered_bank_detail';
    }
}

@ValidatorConstraint({ name: 'buyIntentBankFields', async: false })
class BuyIntentBankFieldsConstraint implements ValidatorConstraintInterface {
    validate(_value: unknown, args: ValidationArguments): boolean {
        const dto = args.object as CreateBuyIntentDTO & {
            prefered_bank_detail?: unknown;
            crypto_amount?: number;
        };
        if (dto.prefered_bank_detail) {
            return false;
        }
        if (dto.crypto_amount !== undefined) {
            return false;
        }
        return true;
    }

    defaultMessage(args: ValidationArguments): string {
        const dto = args.object as CreateBuyIntentDTO & {
            prefered_bank_detail?: unknown;
            crypto_amount?: number;
        };
        if (dto.prefered_bank_detail) {
            return 'prefered_bank_detail is for sell intents only. For buy, pass bank_account_id (Viarduct corporate account from GET /bank-accounts/corporate) or omit it to use the default';
        }
        if (dto.crypto_amount !== undefined) {
            return 'crypto_amount is for sell intents. Use fiat_amount when creating a buy intent';
        }
        return 'Invalid buy intent payload';
    }
}

export class GetTradeQuoteDTO {
    @IsString()
    @IsNotEmpty()
    @IsIn(['buy', 'sell'])
    type: 'buy' | 'sell';

    @IsString()
    @IsNotEmpty()
    @IsIn(['BTC', 'ETH'])
    crypto_type: string;

    @ValidateIf((o) => o.type === 'sell')
    @IsOptional()
    @IsNumber()
    @Min(0.00000001)
    crypto_amount?: number;

    @ValidateIf((o) => o.type === 'buy')
    @IsOptional()
    @IsNumber()
    @Min(1)
    fiat_amount?: number;

    @ValidateIf((o) => o.type === 'buy')
    @IsOptional()
    @IsString()
    external_destination_address?: string;
}

export class PreferredBankDetailDTO {
    @IsString()
    @IsNotEmpty()
    recipient_bank_code: string;

    @IsString()
    @IsNotEmpty()
    recipient_bank_name: string;

    @IsString()
    @IsNotEmpty()
    @Matches(/^\d{9,10}$/, { message: 'Account number must be 9 or 10 digits' })
    recipient_account_number: string;
}

export class CreateSellIntentDTO {
    @Validate(BankPayoutSourceExclusiveConstraint)
    @IsString()
    @IsNotEmpty()
    @IsIn(['BTC', 'ETH'])
    crypto_type: string;

    @IsNumber()
    @Min(0.00000001)
    crypto_amount: number;

    @IsOptional()
    @IsUUID()
    bank_account_id?: string;

    @IsOptional()
    @ValidateNested()
    @Type(() => PreferredBankDetailDTO)
    prefered_bank_detail?: PreferredBankDetailDTO;

    @IsString()
    @IsNotEmpty()
    @Length(4, 6)
    @Matches(/^\d+$/)
    transaction_pin: string;
}

export class CreateBuyIntentDTO {
    @Validate(BuyIntentBankFieldsConstraint)
    @IsString()
    @IsNotEmpty()
    @IsIn(['BTC', 'ETH'])
    crypto_type: string;

    @IsNumber()
    @Min(1)
    fiat_amount: number;

    @IsString()
    @IsNotEmpty()
    external_destination_address: string;

    @IsOptional()
    @IsUUID()
    bank_account_id?: string;

    @IsOptional()
    @IsString()
    fiat_payment_reference?: string;

    @IsString()
    @IsNotEmpty()
    @Length(4, 6)
    @Matches(/^\d+$/)
    transaction_pin: string;
}

export class AdminVerifyFiatDTO {
    @IsOptional()
    @IsString()
    admin_notes?: string;
}

export class AdminConfirmFiatPayoutDTO {
    @IsOptional()
    @IsString()
    admin_notes?: string;

    @IsOptional()
    @IsNumber()
    actual_gas_ngn?: number;
}

export class AdminReleaseCryptoDTO {
    @IsOptional()
    @IsString()
    admin_notes?: string;
}

export class AdminBuyConfirmMetadataDTO {
    @IsString()
    @IsNotEmpty()
    confirmation_note: string;

    @IsNumber()
    @Min(1)
    total_amount_confirmed: number;
}

export class AdminSellConfirmMetadataDTO {
    @IsString()
    @IsNotEmpty()
    confirmation_note: string;

    @IsNumber()
    @Min(0.00000001)
    total_crypto_amount_confirmed: number;

    @IsString()
    @IsNotEmpty()
    tx_reference: string;
}

@ValidatorConstraint({ name: 'adminConfirmMetadataExclusive', async: false })
class AdminConfirmMetadataExclusiveConstraint implements ValidatorConstraintInterface {
    validate(_value: unknown, args: ValidationArguments): boolean {
        const dto = args.object as AdminConfirmIntentDTO;
        const hasBuy = !!dto.buy_metadata;
        const hasSell = !!dto.sell_metadata;

        if (dto.intent_type === 'buy') {
            return hasBuy && !hasSell;
        }
        if (dto.intent_type === 'sell') {
            return hasSell && !hasBuy;
        }
        return false;
    }

    defaultMessage(args: ValidationArguments): string {
        const dto = args.object as AdminConfirmIntentDTO;
        if (dto.intent_type === 'buy' && dto.sell_metadata) {
            return 'Do not send sell_metadata when intent_type is buy';
        }
        if (dto.intent_type === 'sell' && dto.buy_metadata) {
            return 'Do not send buy_metadata when intent_type is sell';
        }
        if (dto.intent_type === 'buy') {
            return 'buy_metadata is required when intent_type is buy';
        }
        return 'sell_metadata is required when intent_type is sell';
    }
}

export class AdminConfirmIntentDTO {
    @Validate(AdminConfirmMetadataExclusiveConstraint)
    @IsUUID()
    @IsNotEmpty()
    intent_id: string;

    @IsString()
    @IsIn(['buy', 'sell'])
    intent_type: 'buy' | 'sell';

    @ValidateIf((o) => o.intent_type === 'buy')
    @ValidateNested()
    @Type(() => AdminBuyConfirmMetadataDTO)
    buy_metadata?: AdminBuyConfirmMetadataDTO;

    @ValidateIf((o) => o.intent_type === 'sell')
    @ValidateNested()
    @Type(() => AdminSellConfirmMetadataDTO)
    sell_metadata?: AdminSellConfirmMetadataDTO;
}

export class VerifyBankAccountDTO {
    @IsString()
    @IsNotEmpty({ message: 'Account number is required' })
    @Matches(/^\d{9,10}$/, { message: 'Account number must be 9 or 10 digits' })
    account_number: string;

    @IsString()
    @IsNotEmpty({ message: 'Bank code is required' })
    bank_code: string;
}

export class TradeIntentProofOfPaymentItemDTO {
    @IsString()
    @IsNotEmpty()
    title: string;

    @IsOptional()
    @IsString()
    description?: string;

    @IsString()
    @IsNotEmpty()
    @IsUrl({}, { message: 'url must be a valid URL' })
    url: string;
}

export class SubmitProofOfPaymentDTO {
    @IsUUID()
    @IsNotEmpty()
    intent_id: string;

    @IsArray()
    @ArrayMinSize(1, { message: 'At least one proof_of_payment item is required' })
    @ValidateNested({ each: true })
    @Type(() => TradeIntentProofOfPaymentItemDTO)
    proof_of_payments: TradeIntentProofOfPaymentItemDTO[];
}

export class AdminSellPayoutMetadataDTO {
    @IsArray()
    @ArrayMinSize(1, { message: 'At least one payout proof is required for sell intents' })
    @ValidateNested({ each: true })
    @Type(() => TradeIntentProofOfPaymentItemDTO)
    proof_of_payment: TradeIntentProofOfPaymentItemDTO[];
}

@ValidatorConstraint({ name: 'adminPayoutMetadataExclusive', async: false })
class AdminPayoutMetadataExclusiveConstraint implements ValidatorConstraintInterface {
    validate(_value: unknown, args: ValidationArguments): boolean {
        const dto = args.object as AdminPayoutIntentDTO;
        const hasSell = !!dto.sell_metadata;
        if (dto.intent_type === 'buy') {
            return !hasSell;
        }
        if (dto.intent_type === 'sell') {
            return hasSell;
        }
        return false;
    }

    defaultMessage(args: ValidationArguments): string {
        const dto = args.object as AdminPayoutIntentDTO;
        if (dto.intent_type === 'buy' && dto.sell_metadata) {
            return 'Do not send sell_metadata when intent_type is buy';
        }
        return 'sell_metadata with proof_of_payment is required when intent_type is sell';
    }
}

export class AdminPayoutIntentDTO {
    @Validate(AdminPayoutMetadataExclusiveConstraint)
    @IsUUID()
    @IsNotEmpty()
    intent_id: string;

    @IsString()
    @IsIn(['buy', 'sell'])
    intent_type: 'buy' | 'sell';

    @IsString()
    @IsNotEmpty()
    consent_code: string;

    @IsString()
    @IsNotEmpty()
    date_of_payment: string;

    @ValidateIf((o) => o.intent_type === 'sell')
    @ValidateNested()
    @Type(() => AdminSellPayoutMetadataDTO)
    sell_metadata?: AdminSellPayoutMetadataDTO;
}

export interface TradeQuoteLineItems {
    spot_price_ngn: number;
    buy_rate: number;
    sell_rate: number;
    rate_used: number;
    gross_crypto_amount: number;
    gross_fiat_amount: number;
    gas_crypto: number;
    gas_ngn: number;
    net_crypto_amount: number;
    net_fiat_payout?: number;
    quote_expires_at: string;
}
