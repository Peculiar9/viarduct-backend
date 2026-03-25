import { Type } from 'class-transformer';
import { IsArray, IsNotEmpty, IsOptional, IsString, ValidateNested } from 'class-validator';

export class DisputeEvidenceItemDTO {
    @IsString()
    @IsNotEmpty()
    title: string;

    @IsString()
    @IsNotEmpty()
    url: string;

    @IsOptional()
    @IsString()
    description?: string;
}

export class CreateDisputeDTO {
    @IsString()
    @IsNotEmpty()
    title: string;

    @IsString()
    @IsNotEmpty()
    content: string;

    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => DisputeEvidenceItemDTO)
    evidence?: DisputeEvidenceItemDTO[];
}

export class ResolveDisputeDTO {
    @IsString()
    @IsNotEmpty()
    resolve_note?: string;

    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => DisputeEvidenceItemDTO)
    resolve_evidence?: DisputeEvidenceItemDTO[];
}

