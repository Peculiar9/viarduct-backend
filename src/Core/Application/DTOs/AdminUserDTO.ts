import { IsNotEmpty, IsString } from 'class-validator';

export class DeactivateUserDTO {
    @IsString()
    @IsNotEmpty()
    reason: string;
}

