import { inject, injectable } from 'inversify';
import { TYPES } from '../../../Core/Types/Constants';
import { IUserBankAccountService } from '../../../Core/Application/Interface/Services/IUserBankAccountService';
import { IUserBankAccountRepository } from '../../../Core/Application/Interface/Repositories/IUserBankAccountRepository';
import { IAccountVerificationService } from '../../../Core/Application/Interface/Services/IAccountVerificationService';
import { IUserBankAccount } from '../../../Core/Application/Interface/Entities/bank/IUserBankAccount';
import { NotFoundError, ValidationError } from '../../../Core/Application/Error/AppError';
import { TradeIntentNotificationHelper } from '../trading/TradeIntentNotificationHelper';

@injectable()
export class UserBankAccountService implements IUserBankAccountService {
    constructor(
        @inject(TYPES.UserBankAccountRepository) private readonly bankAccountRepo: IUserBankAccountRepository,
        @inject(TYPES.AccountVerificationService) private readonly accountVerificationService: IAccountVerificationService,
        @inject(TYPES.TradeIntentNotificationHelper) private readonly intentNotifications: TradeIntentNotificationHelper
    ) {}

    async listUserAccounts(userId: string): Promise<IUserBankAccount[]> {
        return this.bankAccountRepo.findByUserId(userId);
    }

    async saveUserAccount(
        userId: string,
        dto: { account_number: string; bank_code: string; bank_name?: string; label?: string }
    ): Promise<IUserBankAccount> {
        const verified = await this.accountVerificationService.verifyAccountNumber(dto.account_number, dto.bank_code);
        if (!verified.status || !verified.data) {
            throw new ValidationError(verified.message || 'Bank account verification failed');
        }

        const accountNumber = verified.data.account_number;
        const bankCode = verified.data.bank?.code ?? dto.bank_code;
        const bankName = verified.data.bank?.name ?? dto.bank_name ?? '';
        const accountName = verified.data.account_name;

        const existing = await this.bankAccountRepo.findUserDuplicate(userId, accountNumber, bankCode);
        if (existing) {
            throw new ValidationError('This bank account is already saved');
        }

        const nowIso = new Date().toISOString();
        const account = await this.bankAccountRepo.create({
            user_id: userId,
            type: 'user',
            account_number: accountNumber,
            bank_code: bankCode,
            bank_name: bankName,
            account_name: accountName,
            label: dto.label ?? null,
            is_active: true,
            is_default: false,
            created_by: userId,
            created_at: nowIso,
            updated_at: nowIso
        });
        void this.intentNotifications.onBankAccountSaved(userId, account);
        return account;
    }

    async deleteUserAccount(userId: string, accountId: string): Promise<void> {
        const account = await this.bankAccountRepo.findById(accountId);
        if (!account || account.type !== 'user' || account.user_id !== userId) {
            throw new NotFoundError('Saved bank account not found');
        }
        await this.bankAccountRepo.update(accountId, { is_active: false, updated_at: new Date().toISOString() });
    }

    async getUserAccountForIntent(userId: string, accountId: string): Promise<IUserBankAccount> {
        const account = await this.bankAccountRepo.findById(accountId);
        if (!account || account.type !== 'user' || account.user_id !== userId || !account.is_active) {
            throw new NotFoundError('Saved bank account not found');
        }
        return account;
    }

    async getBankAccountById(accountId: string): Promise<IUserBankAccount> {
        const account = await this.bankAccountRepo.findById(accountId);
        if (!account || !account.is_active) {
            throw new NotFoundError('Bank account not found');
        }
        return account;
    }

    async getCorporateAccountForBuy(accountId: string): Promise<IUserBankAccount> {
        const account = await this.getBankAccountById(accountId);
        if (account.type !== 'corporate') {
            throw new ValidationError('bank_account_id must reference a Viarduct corporate account');
        }
        return account;
    }

    async getCorporateAccounts(): Promise<IUserBankAccount[]> {
        return this.bankAccountRepo.findCorporateAccounts(true);
    }

    async getDefaultCorporateAccount(): Promise<IUserBankAccount> {
        const account = await this.bankAccountRepo.findActiveCorporateDefault();
        if (!account) {
            throw new NotFoundError('No corporate bank account is configured. Please contact support.');
        }
        return account;
    }

    async adminListCorporateAccounts(): Promise<IUserBankAccount[]> {
        return this.bankAccountRepo.findCorporateAccounts(false);
    }

    async adminCreateCorporateAccount(
        adminId: string,
        dto: {
            account_number: string;
            bank_code: string;
            bank_name: string;
            account_name: string;
            label?: string;
            is_default?: boolean;
        }
    ): Promise<IUserBankAccount> {
        const verified = await this.accountVerificationService.verifyAccountNumber(dto.account_number, dto.bank_code);
        if (!verified.status || !verified.data) {
            throw new ValidationError(verified.message || 'Bank account verification failed');
        }

        const accountNumber = verified.data.account_number;
        const bankCode = verified.data.bank?.code ?? dto.bank_code;
        const bankName = verified.data.bank?.name ?? dto.bank_name;
        const accountName = verified.data.account_name || dto.account_name;

        if (dto.is_default) {
            await this.bankAccountRepo.clearCorporateDefaults();
        }

        const nowIso = new Date().toISOString();
        const hasDefault = (await this.bankAccountRepo.findCorporateAccounts(true)).length === 0;

        return this.bankAccountRepo.create({
            user_id: null,
            type: 'corporate',
            account_number: accountNumber,
            bank_code: bankCode,
            bank_name: bankName,
            account_name: accountName,
            label: dto.label ?? 'Viarduct Corporate Account',
            is_active: true,
            is_default: dto.is_default ?? hasDefault,
            created_by: adminId,
            created_at: nowIso,
            updated_at: nowIso
        });
    }

    async adminUpdateCorporateAccount(
        _adminId: string,
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
    ): Promise<IUserBankAccount> {
        const account = await this.bankAccountRepo.findById(accountId);
        if (!account || account.type !== 'corporate') {
            throw new NotFoundError('Corporate bank account not found');
        }

        const patch: Partial<IUserBankAccount> = {};
        if (dto.label !== undefined) patch.label = dto.label;
        if (dto.is_active !== undefined) patch.is_active = dto.is_active;

        if (dto.account_number !== undefined || dto.bank_code !== undefined) {
            const accountNumber = dto.account_number ?? account.account_number;
            const bankCode = dto.bank_code ?? account.bank_code;
            const verified = await this.accountVerificationService.verifyAccountNumber(accountNumber, bankCode);
            if (!verified.status || !verified.data) {
                throw new ValidationError(verified.message || 'Bank account verification failed');
            }
            patch.account_number = verified.data.account_number;
            patch.bank_code = verified.data.bank?.code ?? bankCode;
            patch.bank_name = dto.bank_name ?? verified.data.bank?.name ?? account.bank_name;
            patch.account_name = dto.account_name ?? verified.data.account_name ?? account.account_name;
        } else {
            if (dto.bank_name !== undefined) patch.bank_name = dto.bank_name;
            if (dto.account_name !== undefined) patch.account_name = dto.account_name;
        }

        if (Object.keys(patch).length === 0 && dto.is_default === undefined) {
            throw new ValidationError('Provide at least one field to update');
        }

        if (dto.is_default) {
            await this.bankAccountRepo.clearCorporateDefaults();
            patch.is_default = true;
        } else if (dto.is_default === false) {
            patch.is_default = false;
        }

        const updated = await this.bankAccountRepo.update(accountId, {
            ...patch,
            updated_at: new Date().toISOString()
        });
        if (!updated) {
            throw new ValidationError('Failed to update corporate bank account');
        }
        return updated;
    }

    async adminDeleteCorporateAccount(accountId: string): Promise<void> {
        const account = await this.bankAccountRepo.findById(accountId);
        if (!account || account.type !== 'corporate') {
            throw new NotFoundError('Corporate bank account not found');
        }
        await this.bankAccountRepo.delete(accountId);
    }
}
