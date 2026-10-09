import { inject, injectable } from 'inversify';
import { TYPES } from '../../../Core/Types/Constants';
import { IWithdrawalService } from '../../../Core/Application/Interface/Services/IWithdrawalService';
import { IWithdrawalRequest } from '../../../Core/Application/Interface/Entities/withdrawal/IWithdrawalRequest';
import { IPaystackService } from '../../../Core/Application/Interface/Services/IPaystackService';
import { IAccountVerificationService } from '../../../Core/Application/Interface/Services/IAccountVerificationService';
import { IWalletService } from '../../../Core/Application/Interface/Services/IWalletService';
import { IWithdrawalRequestRepository } from '../../../Core/Application/Interface/Repositories/IWithdrawalRequestRepository';
import { IUserTransactionPinRepository } from '../../../Core/Application/Interface/Repositories/IUserTransactionPinRepository';
import { IWalletTransactionRepository } from '../../../Core/Application/Interface/Repositories/IWalletTransactionRepository';
import { ICustodyProvider } from '../../../Core/Application/Interface/Services/ICustodyProvider';
import { ICustodyService } from '../../../Core/Application/Interface/Services/ICustodyService';
import { ISolvencyService } from '../../../Core/Application/Interface/Services/ISolvencyService';
import { IWalletTransaction } from '../../../Core/Application/Interface/Entities/wallet/IWalletTransaction';
import { ValidationError, ServiceError } from '../../../Core/Application/Error/AppError';
import { Console } from '../../Utils/Console';
import * as bcrypt from 'bcryptjs';
import { UserRepository } from '../../Repository/SQL/users/UserRepository';
import { resolveNetworkName } from '../trading/getNetworkName';

const PIN_SALT_ROUNDS = 10;

@injectable()
export class WithdrawalService implements IWithdrawalService {
    constructor(
        @inject(TYPES.PaystackService) private readonly paystackService: IPaystackService,
        @inject(TYPES.AccountVerificationService) private readonly accountVerificationService: IAccountVerificationService,
        @inject(TYPES.WalletService) private readonly walletService: IWalletService,
        @inject(TYPES.WithdrawalRequestRepository) private readonly withdrawalRequestRepo: IWithdrawalRequestRepository,
        @inject(TYPES.UserTransactionPinRepository) private readonly transactionPinRepo: IUserTransactionPinRepository,
        @inject(TYPES.UserRepository) private readonly userRepository: UserRepository,
        @inject(TYPES.WalletTransactionRepository)
        private readonly walletTransactionRepo: IWalletTransactionRepository,
        @inject(TYPES.CustodyProvider) private readonly custodyProvider: ICustodyProvider,
        @inject(TYPES.SolvencyService) private readonly solvencyService: ISolvencyService,
        @inject(TYPES.CustodyService) private readonly custodyService: ICustodyService
    ) {}

    async validateAccountAndCreateRequest(userId: string, accountNumber: string, bankCode: string): Promise<{
        withdrawal_request_id: string;
        account_name: string;
        bank_name: string;
    }> {
        const resolve = await this.accountVerificationService.verifyAccountNumber(accountNumber, bankCode);
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

        await this.assertValidTransactionPin(userId, pin);

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
        const response = await this.accountVerificationService.fetchBanks();
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
        await this.userRepository.update(userId, { has_set_transaction_pin: true });
    }

    async verifyTransactionPin(userId: string, pin: string): Promise<boolean> {
        const pinRecord = await this.transactionPinRepo.findByUserId(userId);
        if (!pinRecord) return false;
        return bcrypt.compare(pin, pinRecord.pin_hash);
    }

    private async assertValidTransactionPin(userId: string, pin: string): Promise<void> {
        const pinRecord = await this.transactionPinRepo.findByUserId(userId);
        if (!pinRecord) {
            throw new ValidationError('Transaction PIN not set. Please set your PIN first.');
        }
        const pinValid = await bcrypt.compare(String(pin || ''), pinRecord.pin_hash);
        if (!pinValid) {
            throw new ValidationError('Invalid transaction PIN');
        }
    }

    async withdrawCrypto(
        userId: string,
        cryptoType: string,
        requestedAmount: number,
        destinationAddress: string,
        pin: string
    ): Promise<{
        transaction: IWalletTransaction;
        requested_amount: number;
        network_fee: number;
        estimated_onchain_gas: number;
        platform_profit: number;
        total_deduction: number;
        destination_address: string;
        outgoing_tx_hash: string | null;
    }> {
        const asset = this.assertPayoutAsset(cryptoType);
        await this.assertValidTransactionPin(userId, pin);
        const user = await this.userRepository.findById(userId);
        if (!user) {
            throw new ValidationError('User not found');
        }
        if (!user.has_completed_kyc) {
            throw new ValidationError(
                'KYC verification is required to withdraw crypto. Please complete your KYC verification first.'
            );
        }
        const amount = Number(requestedAmount);
        const toAddress = String(destinationAddress || '').trim();
        if (!(amount > 0)) {
            throw new ValidationError('Withdrawal amount must be greater than 0');
        }
        if (!toAddress) {
            throw new ValidationError('destination_address is required');
        }

        const feeQuote = await this.custodyService.getOutwardTransactionFee(asset, toAddress, amount);
        const estimatedOnChainGas = feeQuote.live_gas_fee;
        const platformProfit = feeQuote.platform_profit;
        const totalUserFee = feeQuote.total_user_fee;
        const totalDeduction = amount + totalUserFee;
        await this.solvencyService.assertPlatformSolvent(asset, amount, 'user');
        const walletAccount = await this.walletService.debitUserCryptoBalance(userId, asset, totalDeduction);

        const now = new Date().toISOString();
        let walletTx: IWalletTransaction;
        try {
            walletTx = await this.walletTransactionRepo.create({
                user_id: userId,
                wallet_account_id: walletAccount._id ?? null,
                crypto_type: asset,
                type: 'WITHDRAWAL',
                status: 'PROCESSING',
                amount,
                network_fee: totalUserFee,
                estimated_onchain_gas: estimatedOnChainGas,
                platform_profit: platformProfit,
                address: toAddress,
                network: resolveNetworkName(asset),
                metadata: {
                    source: 'user_crypto_withdrawal',
                    total_deduction: totalDeduction,
                    used_fallback_fee: feeQuote.used_fallback
                },
                created_at: now,
                updated_at: now
            });
        } catch (error) {
            await this.walletService.creditUserCryptoBalance(userId, asset, totalDeduction);
            throw error;
        }

        try {
            const broadcast = await this.custodyProvider.broadcastOutbound(asset, toAddress, amount);
            const completed =
                (await this.walletTransactionRepo.update(walletTx._id!, {
                    status: 'COMPLETED',
                    outgoing_tx_hash: broadcast.txHash || null,
                    metadata: {
                        ...(walletTx.metadata || {}),
                        thresh0ld_tx_hash: broadcast.txHash,
                        custody_provider: this.custodyProvider.providerName
                    },
                    updated_at: new Date().toISOString()
                })) || walletTx;

            Console.info('Crypto withdrawal completed', {
                userId,
                asset,
                requestedAmount: amount,
                networkFee: totalUserFee,
                estimatedOnChainGas,
                platformProfit,
                totalDeduction,
                txHash: broadcast.txHash
            });

            return {
                transaction: completed,
                requested_amount: amount,
                network_fee: totalUserFee,
                estimated_onchain_gas: estimatedOnChainGas,
                platform_profit: platformProfit,
                total_deduction: totalDeduction,
                destination_address: toAddress,
                outgoing_tx_hash: broadcast.txHash || null
            };
        } catch (error: any) {
            try {
                await this.walletService.creditUserCryptoBalance(userId, asset, totalDeduction);
            } catch (refundError: any) {
                Console.error(refundError, {
                    message: 'Failed to refund crypto withdrawal after payout error',
                    userId,
                    asset,
                    totalDeduction
                });
            }
            await this.walletTransactionRepo.update(walletTx._id!, {
                status: 'FAILED',
                metadata: {
                    ...(walletTx.metadata || {}),
                    failure: error?.message || String(error),
                    refunded: true,
                    total_deduction: totalDeduction
                },
                updated_at: new Date().toISOString()
            });
            Console.error(error, { message: 'Crypto withdrawal payout failed', userId, asset });
            throw error;
        }
    }

    private assertPayoutAsset(cryptoType: string): 'BTC' | 'ETH' {
        const asset = String(cryptoType || '').trim().toUpperCase();
        if (asset === 'USDT') {
            throw new ValidationError(
                'USDT on-chain withdrawals are not enabled. Use BTC or ETH.'
            );
        }
        if (asset !== 'BTC' && asset !== 'ETH') {
            throw new ValidationError('crypto_type must be BTC or ETH');
        }
        return asset;
    }
}
