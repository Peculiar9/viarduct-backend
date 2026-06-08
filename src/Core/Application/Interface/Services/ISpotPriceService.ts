export interface ISpotPriceService {
    /**
     * Returns spot price of 1 BTC in NGN.
     */
    getBtcNgnSpotPrice(): Promise<number>;

    /** Spot price of 1 ETH in NGN. */
    getEthNgnSpotPrice(): Promise<number>;
}

