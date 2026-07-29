import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class RegisterDeviceTokenDTO {
    @IsString()
    @IsNotEmpty()
    token: string;

    @IsString()
    @IsIn(['android', 'ios', 'web'])
    platform: 'android' | 'ios' | 'web';

    @IsOptional()
    @IsString()
    device_id?: string;
}

export class UnregisterDeviceTokenDTO {
    @IsString()
    @IsNotEmpty()
    token: string;
}
