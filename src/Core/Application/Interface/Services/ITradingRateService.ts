import { ITradingRate } from '../Interface/Entities/trading/ITradingRate';

export interface ITradingRateService {
    /**
     * Get the active trading rate for a crypto type
     */
    getActiveRate(cryptoType: string): Promise<ITradingRate>;

    /**
     * Create a new trading rate (deactivates previous for same crypto type)
     */
    createRate(data: {
        crypto_type: string;
        buy_rate: number;
        sell_rate: number;
        spread_percentage?: number;
        type?: string;
        updated_by: string;
    }): Promise<ITradingRate>;

    /**
     * Update existing rate
     */
    updateRate(id: string, data: Partial<ITradingRate>, updatedBy: string): Promise<ITradingRate>;

    /**
     * Get all rates (for admin)
     */
    getAllRates(): Promise<ITradingRate[]>;

    /**
     * Get rate by ID (for admin)
     */
    getRateById(id: string): Promise<ITradingRate>;

    /**
     * Calculate NGN amount for buying crypto
     */
    calculateBuyAmount(cryptoType: string, cryptoAmount: number): Promise<number>;

    /**
     * Calculate NGN amount for selling crypto
     */
    calculateSellAmount(cryptoType: string, cryptoAmount: number): Promise<number>;
}

