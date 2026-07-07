import { IsInt, IsOptional, IsUUID, Min } from 'class-validator';

export class CreatePayoutConsentDTO {
    @IsOptional()
    @IsUUID()
    intent_id?: string;

    @IsOptional()
    @IsInt()
    @Min(1)
    expiry_hours?: number;
}
