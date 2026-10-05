import { Type } from 'class-transformer';
import { IsNumber, IsOptional, Max, Min } from 'class-validator';

export class UpsertSplitConfigDTO {
    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(0, { message: 'platform_fee_percentage must be between 0 and 100' })
    @Max(100, { message: 'platform_fee_percentage must be between 0 and 100' })
    platform_fee_percentage?: number;

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(0, { message: 'btc_network_fee must be between 0 and 100' })
    @Max(100, { message: 'btc_network_fee must be between 0 and 100' })
    btc_network_fee?: number;

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(0, { message: 'eth_network_fee must be between 0 and 100' })
    @Max(100, { message: 'eth_network_fee must be between 0 and 100' })
    eth_network_fee?: number;
}
