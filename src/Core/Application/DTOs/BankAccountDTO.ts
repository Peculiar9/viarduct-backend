import { IsBoolean, IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';

export class SaveUserBankAccountDTO {
    @IsString()
    @IsNotEmpty()
    @Matches(/^\d{9,10}$/, { message: 'Account number must be 9 or 10 digits' })
    account_number: string;

    @IsString()
    @IsNotEmpty()
    bank_code: string;

    @IsOptional()
    @IsString()
    bank_name?: string;

    @IsOptional()
    @IsString()
    label?: string;
}

export class CreateCorporateBankAccountDTO {
    @IsString()
    @IsNotEmpty()
    @Matches(/^\d{9,10}$/, { message: 'Account number must be 9 or 10 digits' })
    account_number: string;

    @IsString()
    @IsNotEmpty()
    bank_code: string;

    @IsString()
    @IsNotEmpty()
    bank_name: string;

    @IsString()
    @IsNotEmpty()
    account_name: string;

    @IsOptional()
    @IsString()
    label?: string;

    @IsOptional()
    @IsBoolean()
    is_default?: boolean;
}

export class UpdateCorporateBankAccountDTO {
    @IsOptional()
    @IsString()
    @Matches(/^\d{9,10}$/, { message: 'Account number must be 9 or 10 digits' })
    account_number?: string;

    @IsOptional()
    @IsString()
    bank_code?: string;

    @IsOptional()
    @IsString()
    bank_name?: string;

    @IsOptional()
    @IsString()
    account_name?: string;

    @IsOptional()
    @IsString()
    label?: string;

    @IsOptional()
    @IsBoolean()
    is_active?: boolean;

    @IsOptional()
    @IsBoolean()
    is_default?: boolean;
}
