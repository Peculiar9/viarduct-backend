import { inject, injectable } from 'inversify';
import { TYPES } from '../../../Core/Types/Constants';
import { IBitcoinWebhookService } from '../../../Core/Application/Interface/Services/IBitcoinWebhookService';
import { IBlockchainService } from '../../../Core/Application/Interface/Services/IBlockchainService';
import { IHttpClient } from '../../../Core/Application/Interface/Infrastructure/IHttpClient';
import { HttpClientFactory } from '../../Http/HttpClientFactory';
import { EnvironmentConfig } from '../../Config/EnvironmentConfig';
import { Console } from '../../Utils/Console';
import { BitcoinTransactionRepository } from '../../Repository/SQL/bitcoin/BitcoinTransactionRepository';
import { WalletAccountRepository } from '../../Repository/SQL/wallet/WalletAccountRepository';
import { ServiceError } from '../../../Core/Application/Error/AppError';
import { IBitcoinTransaction } from '../../../Core/Application/Interface/Entities/bitcoin/IBitcoinTransaction';
import { DIContainer } from '../../../Core/DIContainer';
import { ITradingOrderService } from '../../../Core/Application/Interface/Services/ITradingOrderService';
import { ITradingOrderRepository } from '../../../Core/Application/Interface/Repositories/ITradingOrderRepository';
import { IUTXOManagerService } from '../../../Core/Application/Interface/Services/IUTXOManagerService';

@injectable()
export class BitcoinWebhookService implements IBitcoinWebhookService {
    private readonly httpClient: IHttpClient;
    private readonly apiKey: string;
    private readonly baseUrl: string;
    private readonly webhookUrl: string | null;
    private readonly enableWebhooks: boolean;

    constructor(
        @inject(TYPES.HttpClientFactory) httpClientFactory: HttpClientFactory,
        @inject(TYPES.BitcoinTransactionRepository) private readonly bitcoinTransactionRepo: BitcoinTransactionRepository,
        @inject(TYPES.WalletAccountRepository) private readonly walletAccountRepo: WalletAccountRepository,
        @inject(TYPES.BlockchainService) private readonly blockchainService: IBlockchainService
    ) {
        const network = EnvironmentConfig.get('BITCOIN_NETWORK', 'testnet');
        this.baseUrl = network === 'mainnet' 
            ? 'https://api.blockcypher.com/v1/btc/main'
            : 'https://api.blockcypher.com/v1/btc/test3';
        this.apiKey = EnvironmentConfig.get('BLOCKCYPHER_API_KEY', '');
        
        // Dynamic webhook URL resolution
        const explicitWebhookUrl = EnvironmentConfig.get('BITCOIN_WEBHOOK_URL', '');
        const apiBaseUrl = EnvironmentConfig.get('API_BASE_URL', '');
        
        if (explicitWebhookUrl) {
            this.webhookUrl = explicitWebhookUrl.replace(/\/$/, '');
            this.enableWebhooks = true;
            Console.info('Using explicit webhook URL', { webhook_url: this.webhookUrl });
        } else if (apiBaseUrl) {
            this.webhookUrl = apiBaseUrl.replace(/\/$/, '') + '/webhooks/bitcoin';
            this.enableWebhooks = true;
            Console.info('Using webhook URL from API_BASE_URL', { webhook_url: this.webhookUrl });
        } else {
            this.webhookUrl = null;
            const isDevelopment = EnvironmentConfig.isDevelopment() || EnvironmentConfig.isTest();
            
            if (isDevelopment) {
                this.enableWebhooks = false;
                Console.warn('No webhook URL configured. Webhook registration will be skipped.', {
                    hint: 'Set BITCOIN_WEBHOOK_URL (for ngrok) or API_BASE_URL to enable webhooks'
                });
            } else {
                throw new ServiceError('BITCOIN_WEBHOOK_URL or API_BASE_URL must be configured for webhook registration');
            }
        }
        
        this.httpClient = httpClientFactory.createClient({
            baseURL: this.baseUrl,
            timeout: 30000,
            headers: this.apiKey ? { 'Authorization': `Bearer ${this.apiKey}` } : {}
        });

        Console.info('BitcoinWebhookService initialized', {
            network,
            webhook_url: this.webhookUrl,
            enable_webhooks: this.enableWebhooks,
            base_url: this.baseUrl
        });
    }

    async processWebhookEvent(event: any): Promise<void> {
        try {
            Console.info('Processing Bitcoin webhook event', { 
                event_type: event.event,
                hash: event.hash 
            });

            if (event.event === 'tx-confirmation' || event.event === 'unconfirmed-tx') {
                await this.processTransaction(event, event.address);
            } else if (event.event === 'double-spend-tx') {
                Console.warn('Double spend detected', { tx_hash: event.hash });
                if (event.hash) {
                    const existing = await this.bitcoinTransactionRepo.findByTxHash(event.hash);
                    if (existing) {
                        await this.bitcoinTransactionRepo.update(existing._id!, {
                            status: 'failed',
                            metadata: {
                                ...existing.metadata,
                                failure_reason: 'double_spend_detected'
                            }
                        });
                    }
                }
            }
        } catch (error: any) {
            Console.error(error, { message: 'Failed to process webhook event' });
            throw error;
        }
    }

    async registerAddressWebhook(address: string, walletAccountId?: string): Promise<string> {
        try {
            if (!this.enableWebhooks || !this.webhookUrl) {
                Console.info('Webhook registration skipped', {
                    address,
                    reason: 'Webhooks disabled or no webhook URL configured',
                    hint: 'Transactions can still be detected via polling'
                });
                return '';
            }

            const webhookPayload = {
                url: this.webhookUrl,
                event: 'tx-confirmation',
                address: address,
                confirmations: 1
            };

            Console.info('Registering webhook with BlockCypher', {
                address,
                webhook_url: this.webhookUrl
            });

            const response = await this.httpClient.post<any>('/hooks', webhookPayload);
            
            Console.info('Webhook registered successfully', { 
                address, 
                webhook_id: response.id,
                wallet_account_id: walletAccountId 
            });

            // Note: webhook_id is stored by BlockCypher, we can retrieve it later if needed
            // IWalletAccount doesn't have a metadata field, so we skip storing it locally

            return response.id;
        } catch (error: any) {
            Console.error(error, { message: 'Failed to register webhook', address });
            Console.warn('Address created but webhook registration failed. You can manually check transactions via polling.', {
                address,
                error: error.message
            });
            return '';
        }
    }

    async unregisterWebhook(webhookId: string): Promise<void> {
        try {
            if (!webhookId) {
                Console.warn('No webhook ID provided for unregistration');
                return;
            }
            await this.httpClient.delete(`/hooks/${webhookId}`);
            Console.info('Webhook unregistered', { webhook_id: webhookId });
        } catch (error: any) {
            Console.error(error, { message: 'Failed to unregister webhook', webhook_id: webhookId });
            throw error;
        }
    }

    async processTransaction(txData: any, address: string): Promise<void> {
        try {
            const existing = await this.bitcoinTransactionRepo.findByTxHash(txData.hash || txData.tx_hash);
            if (existing) {
                Console.info('Transaction already processed, updating confirmations', { 
                    tx_hash: txData.hash,
                    current_confirmations: existing.confirmations,
                    new_confirmations: txData.confirmations
                });
                if (txData.confirmations !== undefined && txData.confirmations > existing.confirmations) {
                    const newStatus = txData.confirmations >= 1 ? 'confirmed' : 'pending';
                    await this.bitcoinTransactionRepo.update(existing._id!, {
                        confirmations: txData.confirmations,
                        status: newStatus
                    });

                    if (existing.wallet_account_id && newStatus === 'confirmed' && existing.status !== 'confirmed') {
                        const account = await this.walletAccountRepo.findById(existing.wallet_account_id);
                        if (account) {
                            const currentBalance = parseFloat(account.balance?.toString() || '0');
                            const newBalance = currentBalance + existing.amount;
                            await this.walletAccountRepo.update(existing.wallet_account_id, {
                                balance: newBalance,
                                available_balance: newBalance
                            });

                            Console.info('Wallet balance updated after confirmation', {
                                wallet_account_id: existing.wallet_account_id,
                                previous_balance: currentBalance,
                                new_balance: newBalance,
                                amount_added: existing.amount
                            });
                        }
                    }
                }
                return;
            }

            const walletAccount = await this.walletAccountRepo.findByAddress(address);
            
            let amount = 0;
            if (txData.outputs) {
                txData.outputs.forEach((output: any) => {
                    if (output.addresses && output.addresses.includes(address)) {
                        amount += (output.value || 0) / 100000000;
                    }
                });
            }

            if (amount === 0) {
                Console.warn('No amount found for address in transaction', { address, tx_hash: txData.hash });
                return;
            }

            const bitcoinTx = await this.bitcoinTransactionRepo.create({
                tx_hash: txData.hash || txData.tx_hash,
                address: address,
                wallet_account_id: walletAccount?._id,
                amount: amount,
                confirmations: txData.confirmations || 0,
                status: (txData.confirmations || 0) >= 1 ? 'confirmed' : 'pending',
                direction: 'incoming',
                webhook_data: txData,
                block_time: txData.block_time || txData.received,
                metadata: {
                    network: EnvironmentConfig.get('BITCOIN_NETWORK', 'testnet')
                },
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            });

            Console.info('Bitcoin transaction processed', {
                tx_hash: bitcoinTx.tx_hash,
                amount,
                address,
                confirmations: bitcoinTx.confirmations,
                wallet_account_id: walletAccount?._id
            });

            if (walletAccount && bitcoinTx.status === 'confirmed') {
                const currentBalance = parseFloat(walletAccount.balance?.toString() || '0');
                const newBalance = currentBalance + amount;
                await this.walletAccountRepo.update(walletAccount._id!, {
                    balance: newBalance,
                    available_balance: newBalance
                });

                Console.info('Wallet balance updated', {
                    wallet_account_id: walletAccount._id,
                    previous_balance: currentBalance,
                    new_balance: newBalance,
                    amount_added: amount
                });

                // Create UTXOs for this address so user can sell later
                try {
                    const container = DIContainer.getInstance();
                    const utxoManagerService = container.get<IUTXOManagerService>(TYPES.UTXOManagerService);
                    
                    // Find all outputs in this transaction that went to this address
                    if (txData.outputs) {
                        for (let i = 0; i < txData.outputs.length; i++) {
                            const output = txData.outputs[i];
                            if (output.addresses && output.addresses.includes(address)) {
                                // Check if this output is already spent
                                const isSpent = output.spent_by && output.spent_by.length > 0;
                                if (!isSpent) {
                                    // Create UTXO for this output
                                    await utxoManagerService.createUTXOFromTransaction(
                                        bitcoinTx.tx_hash!,
                                        i, // vout index
                                        address,
                                        walletAccount._id
                                    );
                                    Console.info('UTXO created for user address', {
                                        address,
                                        txHash: bitcoinTx.tx_hash,
                                        vout: i,
                                        amount: (output.value || 0) / 100000000
                                    });
                                }
                            }
                        }
                    }
                } catch (utxoError: any) {
                    // Don't fail the transaction processing if UTXO creation fails
                    Console.warn('Failed to create UTXO for user address', {
                        address,
                        txHash: bitcoinTx.tx_hash,
                        error: utxoError.message
                    });
                }

                // Check if there's a pending order for this transaction
                // Use lazy loading to avoid circular dependency
                try {
                    const container = DIContainer.getInstance();
                    const tradingOrderRepo = container.get<ITradingOrderRepository>(TYPES.TradingOrderRepository);
                    const tradingOrderService = container.get<ITradingOrderService>(TYPES.TradingOrderService);
                    
                    // 1. Check for sell orders (incoming to platform address)
                    // This happens when user sends BTC to platform address for sell order
                    const sellOrder = await tradingOrderRepo.findByBitcoinTxHash(bitcoinTx.tx_hash!);
                    if (sellOrder && sellOrder.type === 'sell' && (sellOrder.status === 'processing' || sellOrder.status === 'pending')) {
                        // Complete the sell order
                        await tradingOrderService.processSellOrder(sellOrder._id!, bitcoinTx.tx_hash!);
                        Console.info('Sell order completed via webhook', {
                            orderId: sellOrder._id,
                            txHash: bitcoinTx.tx_hash
                        });
                    }

                    // 2. Check for buy orders (outgoing from platform address)
                    // This happens when platform sends BTC to user address for buy order
                    // Transaction is confirmed, safe to complete the order
                    const buyOrder = await tradingOrderRepo.findByBitcoinTxHashOutgoing(bitcoinTx.tx_hash!);
                    if (buyOrder && buyOrder.type === 'buy' && buyOrder.status === 'processing') {
                        // Complete the buy order (transaction confirmed, safe to credit balances)
                        await tradingOrderService.completeBuyOrderAfterConfirmation(buyOrder._id!);
                        Console.info('Buy order completed via webhook after confirmation', {
                            orderId: buyOrder._id,
                            txHash: bitcoinTx.tx_hash
                        });
                    }
                } catch (orderError: any) {
                    // If order not found or already processed, that's okay
                    Console.warn('Could not process order for transaction', {
                        txHash: bitcoinTx.tx_hash,
                        error: orderError.message
                    });
                }
            }
        } catch (error: any) {
            Console.error(error, { message: 'Failed to process transaction', address });
            throw error;
        }
    }
}