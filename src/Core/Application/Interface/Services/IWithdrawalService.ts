import { IWithdrawalRequest } from '../Entities/withdrawal/IWithdrawalRequest';
import { IWalletTransaction } from '../Entities/wallet/IWalletTransaction';

export interface IWithdrawalService {
    validateAccountAndCreateRequest(userId: string, accountNumber: string, bankCode: string): Promise<{
        withdrawal_request_id: string;
        account_name: string;
        bank_name: string;
    }>;
    setAmount(userId: string, withdrawalRequestId: string, amount: number): Promise<{
        summary: { recipient_account_name: string; amount: number };
    }>;
    confirmWithdrawal(userId: string, withdrawalRequestId: string, pin: string): Promise<IWithdrawalRequest>;
    getBanks(): Promise<Array<{ id: number; name: string; code: string }>>;
    setTransactionPin(userId: string, pin: string, confirmPin: string): Promise<void>;
    verifyTransactionPin(userId: string, pin: string): Promise<boolean>;
    withdrawCrypto(
        userId: string,
        cryptoType: string,
        requestedAmount: number,
        destinationAddress: string
    ): Promise<{
        transaction: IWalletTransaction;
        requested_amount: number;
        network_fee: number;
        estimated_onchain_gas: number;
        platform_profit: number;
        total_deduction: number;
        destination_address: string;
        outgoing_tx_hash: string | null;
    }>;
}
