import { inject, injectable } from 'inversify';
import { TYPES } from '../../../Core/Types/Constants';
import {
    IAccountVerificationService,
    AccountResolveResult,
    BanksListResult
} from '../../../Core/Application/Interface/Services/IAccountVerificationService';
import { IPaystackService } from '../../../Core/Application/Interface/Services/IPaystackService';

@injectable()
export class PaystackAccountVerificationService implements IAccountVerificationService {
    constructor(
        @inject(TYPES.PaystackService) private readonly paystackService: IPaystackService
    ) {}

    async verifyAccountNumber(accountNumber: string, bankCode: string): Promise<AccountResolveResult> {
        const response = await this.paystackService.verifyAccountNumber(accountNumber, bankCode);
        return {
            status: response.status,
            message: response.message,
            data: response.data
                ? {
                      account_number: response.data.account_number,
                      account_name: response.data.account_name,
                      bank_id: response.data.bank_id,
                      bank: response.data.bank
                          ? {
                                name: response.data.bank.name,
                                id: response.data.bank.id,
                                code: response.data.bank.code
                            }
                          : undefined
                  }
                : null
        };
    }

    async fetchBanks(): Promise<BanksListResult> {
        const response = await this.paystackService.fetchBanks();
        return {
            status: response.status,
            message: response.message,
            data: (response.data || []).map((bank) => ({
                id: bank.id,
                name: bank.name,
                code: bank.code,
                longcode: bank.longcode ?? ''
            }))
        };
    }
}
