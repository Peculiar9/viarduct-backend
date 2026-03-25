import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class ManualKYCReviewDTO {
    @IsString()
    @IsNotEmpty()
    @IsIn(['approve', 'reject'])
    verdict: 'approve' | 'reject';

    @IsOptional()
    @IsString()
    @IsNotEmpty()
    note?: string;

    @IsOptional()
    @IsString()
    @IsNotEmpty()
    reason?: string;
}

