import { IUserBankAccount } from '../Entities/bank/IUserBankAccount';

export interface IUserBankAccountRepository {
    create(entity: IUserBankAccount): Promise<IUserBankAccount>;
    findById(id: string): Promise<IUserBankAccount | null>;
    findByUserId(userId: string): Promise<IUserBankAccount[]>;
    findCorporateAccounts(activeOnly?: boolean): Promise<IUserBankAccount[]>;
    findActiveCorporateDefault(): Promise<IUserBankAccount | null>;
    findUserDuplicate(
        userId: string,
        accountNumber: string,
        bankCode: string
    ): Promise<IUserBankAccount | null>;
    /** Includes inactive rows (for cache reuse / reactivation). bankCode optional = match by account number only. */
    findUserAccountByNumberAndCode(
        userId: string,
        accountNumber: string,
        bankCode?: string
    ): Promise<IUserBankAccount | null>;
    findPreviousPayoutBankByAccountNumber(
        userId: string,
        accountNumber: string
    ): Promise<{
        account_number: string;
        bank_code: string;
        bank_name: string;
        account_name: string;
        bank_account_id?: string;
    } | null>;
    update(id: string, entity: Partial<IUserBankAccount>): Promise<IUserBankAccount | null>;
    clearCorporateDefaults(): Promise<void>;
    delete(id: string): Promise<boolean>;
}
