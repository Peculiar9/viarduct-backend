/**
 * Computed at read time from live spot + tradable crypto balance (not persisted).
 */
export interface IWalletAccountTradingMetadata {
    /** Crypto the user can sell (user_balance − locked). */
    tradable_crypto_amount: number;
    /** NGN value at live spot: tradable_crypto_amount × spot_price_ngn. */
    crypto_equivalent_tradable_amount: number;
    /** Live spot price (NGN per 1 unit of crypto, e.g. CoinGecko). */
    spot_price_ngn: number;
    /** Platform buy rate (NGN/crypto) — what user receives when selling. */
    buy_rate_ngn: number;
    /** Platform sell rate (NGN/crypto) — what user pays when buying. */
    sell_rate_ngn: number;
}
