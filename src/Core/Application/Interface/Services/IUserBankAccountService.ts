import { IUserBankAccount } from '../Entities/bank/IUserBankAccount';

export interface IUserBankAccountService {
    listUserAccounts(userId: string): Promise<IUserBankAccount[]>;
    saveUserAccount(
        userId: string,
        dto: { account_number: string; bank_code: string; bank_name?: string; label?: string }
    ): Promise<IUserBankAccount>;
    deleteUserAccount(userId: string, accountId: string): Promise<void>;
    getUserAccountForIntent(userId: string, accountId: string): Promise<IUserBankAccount>;
    getBankAccountById(accountId: string): Promise<IUserBankAccount>;
    getCorporateAccountForBuy(accountId: string): Promise<IUserBankAccount>;

    getCorporateAccounts(): Promise<IUserBankAccount[]>;
    getDefaultCorporateAccount(): Promise<IUserBankAccount>;

    adminListCorporateAccounts(): Promise<IUserBankAccount[]>;
    adminCreateCorporateAccount(
        adminId: string,
        dto: {
            account_number: string;
            bank_code: string;
            bank_name: string;
            account_name: string;
            label?: string;
            is_default?: boolean;
        }
    ): Promise<IUserBankAccount>;
    adminUpdateCorporateAccount(
        adminId: string,
        accountId: string,
        dto: {
            account_number?: string;
            bank_code?: string;
            bank_name?: string;
            account_name?: string;
            label?: string;
            is_active?: boolean;
            is_default?: boolean;
        }
    ): Promise<IUserBankAccount>;
    adminDeleteCorporateAccount(accountId: string): Promise<void>;
}
