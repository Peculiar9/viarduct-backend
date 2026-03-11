export type WithdrawalRequestStatus = 'draft' | 'ready' | 'processing' | 'completed' | 'failed';

export interface IWithdrawalRequest {
    _id?: string;
    user_id: string;
    recipient_account_number: string;
    recipient_bank_code: string;
    recipient_bank_name: string;
    recipient_account_name: string;
    paystack_recipient_code?: string | null;
    amount: number;
    status: WithdrawalRequestStatus;
    paystack_transfer_code?: string | null;
    failure_reason?: string | null;
    created_at: string;
    updated_at: string;
    completed_at?: string | null;
}
