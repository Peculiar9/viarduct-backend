import { IUserBankAccount } from '../Entities/bank/IUserBankAccount';

export interface IUserBankAccountService {
    listUserAccounts(userId: string): Promise<IUserBankAccount[]>;
    saveUserAccount(
        userId: string,
        dto: { account_number: string; bank_code: string; bank_name?: string; label?: string }
    ): Promise<IUserBankAccount>;
    deleteUserAccount(userId: string, accountId: string): Promise<void>;
    getUserAccountForIntent(userId: string, accountId: string): Promise<IUserBankAccount>;
    /**
     * Resolve prefered_bank_detail for sell intents:
     * DB hit for this user → skip Prembly; otherwise verify + upsert saved account.
     */
    resolvePreferredBankDetailForIntent(
        userId: string,
        dto: {
            recipient_account_number: string;
            recipient_bank_code: string;
            recipient_bank_name?: string;
        }
    ): Promise<{
        account_number: string;
        bank_code: string;
        bank_name: string;
        account_name: string;
        source: 'cache' | 'provider';
        bank_account_id?: string;
    }>;
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
