import { IsBoolean, IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreatePlatformCryptoAddressDTO {
    @IsString()
    @IsIn(['BTC', 'ETH', 'btc', 'eth'])
    asset: string;

    @IsString()
    @IsNotEmpty()
    address: string;

    @IsOptional()
    @IsString()
    label?: string;
}

export class UpdatePlatformCryptoAddressDTO {
    @IsOptional()
    @IsString()
    label?: string;

    @IsOptional()
    @IsBoolean()
    is_active?: boolean;
}
