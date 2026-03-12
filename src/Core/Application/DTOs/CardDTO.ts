import { IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateCardDTO {
    @IsString()
    @IsNotEmpty({ message: 'Name is required' })
    @MinLength(1)
    name: string;

    @IsOptional()
    @IsString()
    description?: string;

    @IsOptional()
    @IsString()
    url?: string;
}

export class UpdateCardDTO {
    @IsOptional()
    @IsString()
    @MinLength(1, { message: 'Name must not be empty' })
    name?: string;

    @IsOptional()
    @IsString()
    description?: string;

    @IsOptional()
    @IsString()
    url?: string;
}
