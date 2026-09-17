export interface ISpotPriceService {
    /** Spot price of 1 BTC in NGN. */
    getBtcNgnSpotPrice(): Promise<number>;

    /** Spot price of 1 ETH in NGN. */
    getEthNgnSpotPrice(): Promise<number>;

    /** Spot price of 1 BTC in USD (Binance BTCUSDT). */
    getBtcUsdSpotPrice(): Promise<number>;

    /** Spot price of 1 ETH in USD (Binance ETHUSDT). */
    getEthUsdSpotPrice(): Promise<number>;
}
