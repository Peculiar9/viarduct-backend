import { IsArray, IsNotEmpty, IsNumber, IsOptional, IsString, Min, MinLength, ArrayMinSize, Matches, Length, IsIn } from 'class-validator';

export class SubmitGiftCardDTO {
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
