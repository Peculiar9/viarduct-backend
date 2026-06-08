import { IsIn, IsNotEmpty, IsString } from 'class-validator';

export class GeneratePlatformAddressDTO {
    @IsString()
    @IsNotEmpty({ message: 'Crypto type is required' })
    @IsIn(['BTC', 'ETH'], { message: 'Crypto type must be BTC or ETH' })
    crypto_type: 'BTC' | 'ETH';
}
