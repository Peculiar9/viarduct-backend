import { IsIn, IsNotEmpty, IsString } from 'class-validator';

export class SyncWalletDTO {
    @IsString()
    @IsNotEmpty({ message: 'asset is required' })
    @IsIn(['BTC', 'ETH'], { message: 'asset must be BTC or ETH' })
    asset: 'BTC' | 'ETH';
}
