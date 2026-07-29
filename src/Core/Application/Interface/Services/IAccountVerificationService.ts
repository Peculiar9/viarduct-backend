export interface AccountResolveBankInfo {
    name: string;
    id?: number;
    code: string;
}

export interface AccountResolveResult {
    status: boolean;
    message: string;
    data: {
        account_number: string;
        account_name: string;
        bank_id?: number;
        bank?: AccountResolveBankInfo;
    } | null;
}

export interface BankListItem {
    id: number;
    name: string;
    code: string;
    longcode: string;
}

export interface BanksListResult {
    status: boolean;
    message: string;
    data: BankListItem[];
}

/**
 * Provider-agnostic bank account verification + banks list.
 * Backed by Paystack or Prembly based on ACCOUNT_VERIFICATION.
 */
export interface IAccountVerificationService {
    verifyAccountNumber(accountNumber: string, bankCode: string): Promise<AccountResolveResult>;
    fetchBanks(): Promise<BanksListResult>;
}
