import { inject, injectable } from 'inversify';
import { TYPES } from '../../../Core/Types/Constants';
import { IWithdrawalService } from '../../../Core/Application/Interface/Services/IWithdrawalService';
import { IWithdrawalRequest } from '../../../Core/Application/Interface/Entities/withdrawal/IWithdrawalRequest';
import { IPaystackService } from '../../../Core/Application/Interface/Services/IPaystackService';
import { IWalletService } from '../../../Core/Application/Interface/Services/IWalletService';
import { IWithdrawalRequestRepository } from '../../../Core/Application/Interface/Repositories/IWithdrawalRequestRepository';
import { IUserTransactionPinRepository } from '../../../Core/Application/Interface/Repositories/IUserTransactionPinRepository';
import { ValidationError, ServiceError } from '../../../Core/Application/Error/AppError';
import { Console } from '../../Utils/Console';
import * as bcrypt from 'bcryptjs';

const PIN_SALT_ROUNDS = 10;

@injectable()
export class WithdrawalService implements IWithdrawalService {
    constructor(
        @inject(TYPES.PaystackService) private readonly paystackService: IPaystackService,
        @inject(TYPES.WalletService) private readonly walletService: IWalletService,
        @inject(TYPES.WithdrawalRequestRepository) private readonly withdrawalRequestRepo: IWithdrawalRequestRepository,
        @inject(TYPES.UserTransactionPinRepository) private readonly transactionPinRepo: IUserTransactionPinRepository
    ) {}

    async validateAccountAndCreateRequest(userId: string, accountNumber: string, bankCode: string): Promise<{
        withdrawal_request_id: string;
        account_name: string;
        bank_name: string;
    }> {
        const resolve = await this.paystackService.verifyAccountNumber(accountNumber, bankCode);
        if (!resolve.status || !resolve.data) {
            throw new ValidationError(resolve.message || 'Account verification failed');
        }
        const accountName = resolve.data.account_name;
        const bankName = resolve.data.bank?.name || '';

        const withdrawal = await this.withdrawalRequestRepo.create({
            user_id: userId,
            recipient_account_number: accountNumber,
            recipient_bank_code: bankCode,
            recipient_bank_name: bankName,
            recipient_account_name: accountName,
            amount: 0,
            status: 'draft',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        });

        return {
            withdrawal_request_id: withdrawal._id!,
            account_name: accountName,
            bank_name: bankName
        };
    }

    async setAmount(userId: string, withdrawalRequestId: string, amount: number): Promise<{
        summary: { recipient_account_name: string; amount: number };
    }> {
        const withdrawal = await this.withdrawalRequestRepo.findById(withdrawalRequestId);
        if (!withdrawal) {
            throw new ValidationError('Withdrawal request not found');
        }
        if (withdrawal.user_id !== userId) {
            throw new ValidationError('Unauthorized');
        }
        if (withdrawal.status !== 'draft') {
            throw new ValidationError('Withdrawal request is no longer in draft');
        }

        const wallet = await this.walletService.getUserWalletWithAccounts(userId);
        if (!wallet) {
            throw new ServiceError('Wallet not found');
        }
        const ngnAccount = wallet.accounts.find(a => a.currency?.code === 'NGN');
        if (!ngnAccount) {
            throw new ServiceError('NGN account not found');
        }
        const availableBalance = parseFloat(String(ngnAccount.available_balance ?? 0));
        if (availableBalance < amount) {
            throw new ValidationError(`Insufficient balance. Need ${amount} NGN, have ${availableBalance} NGN`);
        }

        await this.withdrawalRequestRepo.update(withdrawalRequestId, {
            amount,
            status: 'ready',
            updated_at: new Date().toISOString()
        });

        return {
            summary: {
                recipient_account_name: withdrawal.recipient_account_name,
                amount
            }
        };
    }

    async confirmWithdrawal(userId: string, withdrawalRequestId: string, pin: string): Promise<IWithdrawalRequest> {
        const withdrawal = await this.withdrawalRequestRepo.findById(withdrawalRequestId);
        if (!withdrawal) {
            throw new ValidationError('Withdrawal request not found');
        }
        if (withdrawal.user_id !== userId) {
            throw new ValidationError('Unauthorized');
        }
        if (withdrawal.status !== 'ready') {
            throw new ValidationError('Withdrawal request must be in ready state. Complete amount step first.');
        }

        const pinRecord = await this.transactionPinRepo.findByUserId(userId);
        if (!pinRecord) {
            throw new ValidationError('Transaction PIN not set. Please set your PIN first.');
        }
        const pinValid = await bcrypt.compare(pin, pinRecord.pin_hash);
        if (!pinValid) {
            throw new ValidationError('Invalid transaction PIN');
        }

        if (!withdrawal.amount || withdrawal.amount <= 0) {
            throw new ValidationError('Invalid amount');
        }

        await this.withdrawalRequestRepo.update(withdrawalRequestId, {
            status: 'processing',
            updated_at: new Date().toISOString()
        });

        let recipientCode = withdrawal.paystack_recipient_code;
        if (!recipientCode) {
            const recipient = await this.paystackService.createTransferRecipient(
                withdrawal.recipient_account_number,
                withdrawal.recipient_bank_code,
                withdrawal.recipient_account_name
            );
            recipientCode = recipient.data.recipient_code;
            await this.withdrawalRequestRepo.update(withdrawalRequestId, {
                paystack_recipient_code: recipientCode,
                updated_at: new Date().toISOString()
            });
        }

        try {
            const transfer = await this.paystackService.initiateTransfer(
                withdrawal.amount,
                recipientCode,
                'Wallet withdrawal'
            );

            await this.walletService.debitUserWallet(userId, withdrawal.amount);

            const completed = await this.withdrawalRequestRepo.update(withdrawalRequestId, {
                status: 'completed',
                paystack_transfer_code: transfer.data.transfer_code,
                completed_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            });

            Console.info('Withdrawal completed', { userId, withdrawalRequestId, amount: withdrawal.amount });
            return completed!;
        } catch (error: any) {
            await this.withdrawalRequestRepo.update(withdrawalRequestId, {
                status: 'failed',
                failure_reason: error.message,
                updated_at: new Date().toISOString()
            });
            Console.error(error, { message: 'Withdrawal failed', userId, withdrawalRequestId });
            throw error;
        }
    }

    async getBanks(): Promise<Array<{ id: number; name: string; code: string }>> {
        const response = await this.paystackService.fetchBanks();
        if (!response.status || !response.data) {
            throw new ServiceError('Failed to fetch banks');
        }
        return response.data
            .filter(b => b.code)
            .map(b => ({ id: b.id, name: b.name, code: b.code }));
    }

    async setTransactionPin(userId: string, pin: string, confirmPin: string): Promise<void> {
        if (pin !== confirmPin) {
            throw new ValidationError('PIN and confirm PIN do not match');
        }
        const existing = await this.transactionPinRepo.findByUserId(userId);
        const pinHash = await bcrypt.hash(pin, PIN_SALT_ROUNDS);
        const now = new Date().toISOString();
        if (existing) {
            await this.transactionPinRepo.update(userId, pinHash);
        } else {
            await this.transactionPinRepo.create({
                user_id: userId,
                pin_hash: pinHash,
                created_at: now,
                updated_at: now
            });
        }
    }

    async verifyTransactionPin(userId: string, pin: string): Promise<boolean> {
        const pinRecord = await this.transactionPinRepo.findByUserId(userId);
        if (!pinRecord) return false;
        return bcrypt.compare(pin, pinRecord.pin_hash);
    }
}
