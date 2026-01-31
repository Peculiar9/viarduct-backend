export interface ICurrency {
    _id?: string;
    code: string;              // 'NGN', 'BTC', 'ETH', 'USD'
    name: string;              // 'Nigerian Naira', 'Bitcoin'
    symbol: string;            // '₦', '₿', '$'
    type: 'fiat' | 'crypto';   // Currency type
    decimals: number;          // 2 for NGN, 8 for BTC
    is_active: boolean;
    created_at?: string;
    updated_at?: string;
}

