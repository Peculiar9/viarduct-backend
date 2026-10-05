import {
    IsNumber,
    IsNotEmpty,
    Min,
    IsString,
    IsIn,
    IsOptional,
    Length,
    Matches,
    IsUUID,
    IsArray,
    ArrayMinSize,
    ValidateNested,
    ValidateIf,
    IsUrl,
    Validate,
    ValidationArguments,
    ValidatorConstraint,
    ValidatorConstraintInterface
} from 'class-validator';
import { Expose, Type } from 'class-transformer';
import { PreferredBankDetailDTO } from './TradeIntentDTO';

@ValidatorConstraint({ name: 'sellOrderBankPayoutExclusive', async: false })
class SellOrderBankPayoutExclusiveConstraint implements ValidatorConstraintInterface {
    validate(_value: unknown, args: ValidationArguments): boolean {
        const dto = args.object as CreateSellOrderDTO;
        const hasId = Boolean(dto.bank_account_id);
        const hasPreferred = Boolean(dto.prefered_bank_detail);
        return hasId !== hasPreferred;
    }

    defaultMessage(args: ValidationArguments): string {
        const dto = args.object as CreateSellOrderDTO;
        if (dto.bank_account_id && dto.prefered_bank_detail) {
            return 'You cannot provide both bank_account_id and prefered_bank_detail at the same time';
        }
        return 'Provide either bank_account_id or prefered_bank_detail';
    }
}

export class CreateBuyOrderDTO {
    @IsString()
    @IsNotEmpty({ message: 'Crypto type is required' })
    @IsIn(['BTC', 'ETH'], { message: 'Crypto type must be BTC or ETH' })
    crypto_type: string;

    @IsNumber()
    @IsOptional()
    @IsNumber()
    @Min(0.00000001, { message: 'Crypto amount must be greater than 0' })
    crypto_amount: number;

    @IsOptional()
    @IsNumber()
    @Min(1, { message: 'Crypto purchase amount must be at least 1' })
    crypto_purchase_amount?: number;

    @IsString()
    @IsNotEmpty({ message: 'Transaction PIN is required' })
    @Length(4, 6, { message: 'PIN must be 4-6 digits' })
    @Matches(/^\d+$/, { message: 'PIN must contain only digits' })
    transaction_pin: string;
}

export class CreateSellOrderDTO {
    @Validate(SellOrderBankPayoutExclusiveConstraint)
    @IsString()
    @IsNotEmpty({ message: 'Crypto type is required' })
    @IsIn(['BTC', 'ETH'], { message: 'Crypto type must be BTC or ETH' })
    crypto_type: string;

    @IsNumber()
    @IsOptional()
    @IsNumber()
    @Min(0.00000001, { message: 'Crypto amount must be greater than 0' })
    crypto_amount: number;

    @IsOptional()
    @IsNumber()
    @Min(1, { message: 'Crypto purchase amount must be at least 1' })
    crypto_purchase_amount?: number;

    @IsOptional()
    @IsUUID()
    bank_account_id?: string;

    @IsOptional()
    @ValidateNested()
    @Type(() => PreferredBankDetailDTO)
    prefered_bank_detail?: PreferredBankDetailDTO;

    @IsString()
    @IsNotEmpty({ message: 'Transaction PIN is required' })
    @Length(4, 6, { message: 'PIN must be 4-6 digits' })
    @Matches(/^\d+$/, { message: 'PIN must contain only digits' })
    transaction_pin: string;
}

export class ProcessBuyOrderDTO {
    @IsOptional()
    @IsString()
    payment_reference?: string; // Optional - for tracking external payments
}

export class CompleteBuyOrderDTO {
    @Expose()
    @IsString()
    @IsNotEmpty({ message: 'Order ID is required' })
    order_id: string;
}

export class SellOrderPayoutProofDTO {
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

export class AdminReviewSellOrderPayoutDTO {
    @IsString()
    @IsIn(['approve', 'reject'], { message: 'verdict must be approve or reject' })
    verdict: 'approve' | 'reject';

    @IsUUID()
    @IsNotEmpty({ message: 'orderId is required' })
    orderId: string;

    @ValidateIf((dto: AdminReviewSellOrderPayoutDTO) => dto.verdict === 'approve')
    @IsArray()
    @ArrayMinSize(1, { message: 'proof_of_payments is required when verdict is approve' })
    @ValidateNested({ each: true })
    @Type(() => SellOrderPayoutProofDTO)
    proof_of_payments?: SellOrderPayoutProofDTO[];
}

export class CreateUTXOFromTxDTO {
    @IsString()
    @IsNotEmpty({ message: 'Transaction hash is required' })
    tx_hash: string;

    @IsOptional()
    @IsNumber()
    vout?: number; // Optional - if not provided, will find all outputs for platform address

    @IsOptional()
    @IsString()
    address?: string; // Optional - if not provided, will use platform BTC address
}

export class StoreChangeUTXODTO {
    @IsString()
    @IsNotEmpty({ message: 'Transaction hash is required' })
    tx_hash: string;

    @IsOptional()
    @IsString()
    address?: string; // Optional - if not provided, will use platform BTC address
}

