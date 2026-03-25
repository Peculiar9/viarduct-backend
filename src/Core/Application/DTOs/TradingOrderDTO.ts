import { IsNumber, IsNotEmpty, Min, IsString, IsIn, IsOptional, Length, Matches } from 'class-validator';
import { Expose } from 'class-transformer';

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

