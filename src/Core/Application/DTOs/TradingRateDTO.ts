import { IsNumber, IsOptional, Min, IsString, IsNotEmpty, Matches, IsIn, IsBoolean } from 'class-validator';

export class CreateTradingRateDTO {
    @IsString()
    @IsNotEmpty({ message: 'Crypto type is required' })
    @Matches(/^[A-Z]{2,10}$/, { message: 'Crypto type must be uppercase letters (e.g., BTC, ETH)' })
    crypto_type: string;

    @IsNumber()
    @Min(0.01, { message: 'Buy rate must be greater than 0' })
    buy_rate: number;

    @IsNumber()
    @Min(0.01, { message: 'Sell rate must be greater than 0' })
    sell_rate: number;

    @IsOptional()
    @IsNumber()
    @Min(0)
    spread_percentage?: number;

    @IsOptional()
    @IsString()
    @IsIn(['crypto', 'giftcard'], { message: 'Type must be either crypto or giftcard' })
    type?: string;
}

export class UpdateTradingRateDTO {
    @IsOptional()
    @IsString()
    @Matches(/^[A-Z]{2,10}$/, { message: 'Crypto type must be uppercase letters (e.g., BTC, ETH)' })
    crypto_type?: string;

    @IsOptional()
    @IsNumber()
    @Min(0.01)
    buy_rate?: number;

    @IsOptional()
    @IsNumber()
    @Min(0.01)
    sell_rate?: number;

    @IsOptional()
    @IsNumber()
    @Min(0)
    spread_percentage?: number;

    @IsOptional()
    @IsString()
    @IsIn(['crypto', 'giftcard'], { message: 'Type must be either crypto or giftcard' })
    type?: string;

    @IsOptional()
    @IsBoolean({ message: 'is_active must be a boolean value' })
    is_active?: boolean;
}

