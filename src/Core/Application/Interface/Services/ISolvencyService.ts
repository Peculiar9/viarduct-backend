export type SolvencyPurpose = 'admin' | 'user';

export interface SolvencySnapshot {
    crypto_type: 'BTC' | 'ETH';
    on_chain_hot_wallet_balance: number;
    total_user_liabilities: number;
    pending_payouts: number;
    free_float: number;
    amount_to_send: number;
}

export interface ISolvencyService {
    assertPlatformSolvent(
        cryptoType: 'BTC' | 'ETH',
        amountToSend: number,
        purpose?: SolvencyPurpose
    ): Promise<SolvencySnapshot>;
}
