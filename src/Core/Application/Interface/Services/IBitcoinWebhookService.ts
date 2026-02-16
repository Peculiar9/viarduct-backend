export interface IBitcoinWebhookService {
    /**
     * Process incoming webhook from BlockCypher
     */
    processWebhookEvent(event: any): Promise<void>;

    /**
     * Register an address with BlockCypher webhooks
     */
    registerAddressWebhook(address: string, walletAccountId?: string): Promise<string>;

    /**
     * Unregister a webhook
     */
    unregisterWebhook(webhookId: string): Promise<void>;

    /**
     * Process a detected transaction
     */
    processTransaction(txData: any, address: string): Promise<void>;
}