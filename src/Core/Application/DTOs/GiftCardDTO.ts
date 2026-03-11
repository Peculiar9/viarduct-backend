import { IsArray, IsNotEmpty, IsNumber, IsOptional, IsString, Min, MinLength, ArrayMinSize, Matches, Length } from 'class-validator';

export class SubmitGiftCardDTO {
    @IsString()
    @IsNotEmpty({ message: 'Card type is required' })
    card_type: string;

    @IsNumber()
    @Min(100, { message: 'Minimum amount is 100 NGN' })
    amount_ngn: number;

    @IsArray()
    @IsString({ each: true })
    @ArrayMinSize(1, { message: 'At least one image URL is required' })
    image_urls: string[];

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
}

export class AdminRejectGiftCardDTO {
    @IsString()
    @IsNotEmpty({ message: 'Reason is required' })
    @MinLength(1, { message: 'Reason must not be empty' })
    reason: string;
}
