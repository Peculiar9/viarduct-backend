import { CustodyAsset } from './ICustodyProvider';

export interface OutwardTransactionFeeQuote {
    crypto_type: CustodyAsset;
    live_gas_fee: number;
    platform_profit: number;
    total_user_fee: number;
    used_fallback: boolean;
}

export interface ICustodyService {
    getOutwardTransactionFee(
        cryptoType: CustodyAsset,
        targetAddress: string,
        amount: number
    ): Promise<OutwardTransactionFeeQuote>;
}
