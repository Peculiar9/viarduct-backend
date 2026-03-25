import { ITradingOrder, TradingOrderType } from '../Entities/trading/ITradingOrder';

export interface ITradingOrderService {
    /**
     * Create a buy order (user buys BTC with NGN)
     */
    createBuyOrder(userId: string, data: {
        crypto_type: string;
        crypto_amount?: number;
        crypto_purchase_amount?: number;
        transaction_pin: string;
    }): Promise<ITradingOrder>;

    /**
     * Create a sell order (user sells BTC for NGN)
     */
    createSellOrder(userId: string, data: {
        crypto_type: string;
        crypto_amount?: number;
        crypto_purchase_amount?: number;
        transaction_pin: string;
    }): Promise<ITradingOrder>;

    /**
     * Get user's orders
     */
    getUserOrders(userId: string, limit?: number, offset?: number): Promise<ITradingOrder[]>;

    /**
     * Get order by ID
     */
    getOrderById(orderId: string, userId?: string): Promise<ITradingOrder>;

    /**
     * Cancel an order
     */
    cancelOrder(orderId: string, userId: string): Promise<ITradingOrder>;

    /**
     * Process buy order (after payment confirmation)
     * Payment reference is optional - used for tracking external payments
     */
    processBuyOrder(orderId: string, paymentReference?: string): Promise<ITradingOrder>;

    /**
     * Process sell order (after BTC transaction confirmation)
     */
    processSellOrder(orderId: string, bitcoinTxHash: string): Promise<ITradingOrder>;

    /**
     * Complete an order (finalize balance updates)
     */
    completeOrder(orderId: string): Promise<ITradingOrder>;

    /**
     * Complete buy order after confirmation (called by webhook)
     * This is called when the Bitcoin transaction is confirmed on the blockchain
     */
    completeBuyOrderAfterConfirmation(orderId: string): Promise<ITradingOrder>;
}

