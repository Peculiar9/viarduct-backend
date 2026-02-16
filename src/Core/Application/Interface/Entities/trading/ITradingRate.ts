export interface ITradingRate {
    _id?: string;
    crypto_type: string;  // 'BTC', 'ETH', etc. - currency code
    buy_rate: number;  // NGN per crypto (platform buys at this rate)
    sell_rate: number;  // NGN per crypto (platform sells at this rate)
    spread_percentage: number;
    is_active: boolean;
    updated_by: string;
    created_at?: string;
    updated_at?: string; 
    type: string;  // crypto or giftcard
}


