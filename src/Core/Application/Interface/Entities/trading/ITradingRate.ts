export interface ITradingRate {
    _id?: string;
    crypto_type: string;  // 'BTC', 'ETH', etc. - currency code
    /**
     * Live spot pricing + margin model.
     * buy_rate/sell_rate are derived from spot_price and margins.
     */
    buy_rate: number;  // NGN per crypto (platform buys at this rate) - derived
    sell_rate: number;  // NGN per crypto (platform sells at this rate) - derived
    buy_margin_percentage?: number; // 0-100
    sell_margin_percentage?: number; // 0-100
    last_spot_price?: number | null; // last successful spot price BTC/NGN
    emergency_spot_price?: number | null; // manual fallback if spot fetch fails
    spread_percentage: number; // informational only (computed from derived rates)
    is_active: boolean;
    updated_by: string;
    created_at?: string;
    updated_at?: string; 
    type: string;  // crypto or giftcard
}


