import { IsNumber, IsOptional, Min, IsString, IsNotEmpty, Matches, IsIn, IsBoolean, Max } from 'class-validator';

export class CreateTradingRateDTO {
    @IsString()
    @IsNotEmpty({ message: 'Crypto type is required' })
    @Matches(/^[A-Z]{2,10}$/, { message: 'Crypto type must be uppercase letters (e.g., BTC, ETH)' })
    crypto_type: string;

    @IsNumber()
    @Min(0, { message: 'Buy margin must be at least 0%' })
    @Max(100, { message: 'Buy margin must be at most 100%' })
    buy_margin_percentage: number;

    @IsNumber()
    @Min(0, { message: 'Sell margin must be at least 0%' })
    @Max(100, { message: 'Sell margin must be at most 100%' })
    sell_margin_percentage: number;

    @IsOptional()
    @IsNumber()
    @Min(0.01, { message: 'Emergency spot price must be greater than 0' })
    emergency_spot_price?: number;

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
    @Min(0)
    @Max(100)
    buy_margin_percentage?: number;

    @IsOptional()
    @IsNumber()
    @Min(0)
    @Max(100)
    sell_margin_percentage?: number;

    @IsOptional()
    @IsNumber()
    @Min(0.01)
    emergency_spot_price?: number;

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

