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
    update(id: string, entity: Partial<IUserBankAccount>): Promise<IUserBankAccount | null>;
    clearCorporateDefaults(): Promise<void>;
    delete(id: string): Promise<boolean>;
}
