export interface IOrderCompletionJob {
    /**
     * Start the background job
     */
    start(): void;

    /**
     * Stop the background job
     */
    stop(): void;

    /**
     * Process pending orders once (for manual triggering)
     */
    processPendingOrders(): Promise<void>;
}

