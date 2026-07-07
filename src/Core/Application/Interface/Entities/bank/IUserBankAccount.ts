export type UserBankAccountType = 'user' | 'corporate';

export interface IUserBankAccount {
    _id?: string;
    user_id?: string | null;
    type: UserBankAccountType;
    account_number: string;
    bank_code: string;
    bank_name: string;
    account_name: string;
    label?: string | null;
    is_active: boolean;
    is_default: boolean;
    created_by: string;
    created_at: string;
    updated_at: string;
}
