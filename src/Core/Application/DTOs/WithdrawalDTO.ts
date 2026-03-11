import { IsNotEmpty, IsNumber, IsString, Min, Length, Matches } from 'class-validator';

export class ValidateAccountDTO {
    @IsString()
    @IsNotEmpty({ message: 'Account number is required' })
    account_number: string;

    @IsString()
    @IsNotEmpty({ message: 'Bank code is required' })
    bank_code: string;
}

export class SetAmountDTO {
    @IsNumber()
    @Min(100, { message: 'Minimum withdrawal amount is 100 NGN' })
    amount: number;
}

export class ConfirmWithdrawalDTO {
    @IsString()
    @IsNotEmpty({ message: 'Transaction PIN is required' })
    @Length(4, 6, { message: 'PIN must be 4-6 digits' })
    @Matches(/^\d+$/, { message: 'PIN must contain only digits' })
    pin: string;
}

export class SetTransactionPinDTO {
    @IsString()
    @IsNotEmpty({ message: 'PIN is required' })
    @Length(4, 6, { message: 'PIN must be 4-6 digits' })
    @Matches(/^\d+$/, { message: 'PIN must contain only digits' })
    pin: string;

    @IsString()
    @IsNotEmpty({ message: 'Confirm PIN is required' })
    @Length(4, 6, { message: 'Confirm PIN must be 4-6 digits' })
    @Matches(/^\d+$/, { message: 'Confirm PIN must contain only digits' })
    confirm_pin: string;
}

export class ChangeTransactionPinDTO {
    @IsString()
    @IsNotEmpty({ message: 'Current PIN is required' })
    current_pin: string;

    @IsString()
    @IsNotEmpty({ message: 'New PIN is required' })
    @Length(4, 6, { message: 'PIN must be 4-6 digits' })
    @Matches(/^\d+$/, { message: 'PIN must contain only digits' })
    new_pin: string;

    @IsString()
    @IsNotEmpty({ message: 'Confirm new PIN is required' })
    confirm_new_pin: string;
}
