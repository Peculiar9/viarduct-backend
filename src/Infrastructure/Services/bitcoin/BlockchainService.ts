import { inject, injectable } from 'inversify';
import { TYPES } from '../../../Core/Types/Constants';
import { IBlockchainService } from '../../../Core/Application/Interface/Services/IBlockchainService';
import { HttpClientFactory } from '../../Http/HttpClientFactory';
import { IHttpClient } from '../../../Core/Application/Interface/Infrastructure/IHttpClient';
import { EnvironmentConfig } from '../../Config/EnvironmentConfig';
import { Console } from '../../Utils/Console';

@injectable()
export class BlockchainService implements IBlockchainService {
    private readonly httpClient: IHttpClient;
    private readonly blockstreamClient: IHttpClient;
    private readonly blockcypherClient: IHttpClient;
    private readonly apiKey: string;
    private readonly baseUrl: string;
    private readonly apiProvider: string;
    private readonly network: string;

    constructor(
        @inject(TYPES.HttpClientFactory) httpClientFactory: HttpClientFactory
    ) {
        // Using BlockCypher API (free tier available)
        // Alternative: Blockstream API (no API key needed for testnet)
        this.network = EnvironmentConfig.get('BITCOIN_NETWORK', 'testnet');
        this.apiProvider = EnvironmentConfig.get('BLOCKCHAIN_API_PROVIDER', 'blockcypher');
        
        // BlockCypher URLs
        const blockcypherBaseUrl = this.network === 'mainnet' 
            ? 'https://api.blockcypher.com/v1/btc/main'
            : 'https://api.blockcypher.com/v1/btc/test3';
        const blockcypherApiKey = EnvironmentConfig.get('BLOCKCYPHER_API_KEY', '');

        // Blockstream URLs
        const blockstreamBaseUrl = this.network === 'mainnet'
            ? 'https://blockstream.info/api'
            : 'https://blockstream.info/testnet/api';
        
        if (this.apiProvider === 'blockcypher') {
            this.baseUrl = blockcypherBaseUrl;
            this.apiKey = blockcypherApiKey;
        } else {
            // Blockstream API
            this.baseUrl = blockstreamBaseUrl;
            this.apiKey = '';
        }

        // Primary client (based on config)
        this.httpClient = httpClientFactory.createClient({
            baseURL: this.baseUrl,
            timeout: 30000,
            headers: this.apiKey ? { 'Authorization': `Bearer ${this.apiKey}` } : {}
        });

        // Blockstream client (for fallback)
        this.blockstreamClient = httpClientFactory.createClient({
            baseURL: blockstreamBaseUrl,
            timeout: 30000,
            headers: {}
        });

        // BlockCypher client (for fallback)
        this.blockcypherClient = httpClientFactory.createClient({
            baseURL: blockcypherBaseUrl,
            timeout: 30000,
            headers: blockcypherApiKey ? { 'Authorization': `Bearer ${blockcypherApiKey}` } : {}
        });
    }

    async getAddressBalance(address: string): Promise<number> {
        try {
            if (this.apiProvider === 'blockcypher') {
                const response = await this.httpClient.get<any>(`/addrs/${address}/balance`);
                
                // BlockCypher response format - balance is in satoshis
                if (response.balance !== undefined) {
                    return response.balance / 100000000; // Convert satoshis to BTC
                }
            } else {
                // Blockstream API format
                const response = await this.httpClient.get<any>(`/address/${address}`);
                
                if (response.chain_stats) {
                    const funded = response.chain_stats.funded_txo_sum || 0;
                    const spent = response.chain_stats.spent_txo_sum || 0;
                    return (funded - spent) / 100000000; // Convert satoshis to BTC
                }
            }

            return 0;
        } catch (error: any) {
            Console.error(error, { message: 'Failed to get address balance', address });
            throw error;
        }
    }

    async getAddressTransactions(address: string): Promise<any[]> {
        try {
            if (this.apiProvider === 'blockcypher') {
                const response = await this.httpClient.get<any>(`/addrs/${address}/full`);
                
                // BlockCypher format
                if (response.txs) {
                    return response.txs;
                }
            } else {
                // Blockstream API format
                const response = await this.httpClient.get<any>(`/address/${address}/txs`);
                return Array.isArray(response) ? response : [];
            }

            return [];
        } catch (error: any) {
            Console.error(error, { message: 'Failed to get address transactions', address });
            return [];
        }
    }

    async verifyTransaction(txHash: string): Promise<{
        confirmed: boolean;
        confirmations: number;
        amount: number;
        to: string;
    } | null> {
        let response: any = null;
        let usedBlockstream = false;
        let usedBlockcypher = false;

        // Try primary API provider first
        try {
            if (this.apiProvider === 'blockcypher') {
                response = await this.httpClient.get<any>(`/txs/${txHash}`);
                usedBlockcypher = true;
            } else {
                response = await this.httpClient.get<any>(`/tx/${txHash}`);
                usedBlockstream = true;
            }
            
            // Check if we got a valid response
            if (response && (response.hash || response.txid)) {
                Console.info('Transaction found via primary API', {
                    txHash,
                    provider: this.apiProvider
                });
            } else {
                throw new Error('Invalid response from primary API');
            }
        } catch (primaryError: any) {
            Console.warn('Primary API failed, trying fallback', {
                txHash,
                primaryProvider: this.apiProvider,
                error: primaryError?.message || 'Unknown error'
            });

            // Fallback to the other API
            try {
                if (this.apiProvider === 'blockcypher') {
                    // Primary was BlockCypher, fallback to Blockstream
                    response = await this.blockstreamClient.get<any>(`/tx/${txHash}`);
                    usedBlockstream = true;
                } else {
                    // Primary was Blockstream, fallback to BlockCypher
                    response = await this.blockcypherClient.get<any>(`/txs/${txHash}`);
                    usedBlockcypher = true;
                }
                
                if (response && (response.hash || response.txid)) {
                    Console.info('Transaction found via fallback API', {
                        txHash,
                        fallbackProvider: usedBlockstream ? 'blockstream' : 'blockcypher'
                    });
                } else {
                    throw new Error('Invalid response from fallback API');
                }
            } catch (fallbackError: any) {
                Console.error(fallbackError, {
                    message: 'Both primary and fallback APIs failed to fetch transaction',
                    txHash,
                    primaryProvider: this.apiProvider
                });
                return null;
            }
        }

        // BlockCypher uses 'hash', Blockstream uses 'txid'
        if (!response || (!response.hash && !response.txid)) {
            Console.warn('Transaction response invalid', { txHash });
            return null;
        }

        // Extract transaction details based on which API we used
        const isBlockstream = usedBlockstream || (!usedBlockcypher && this.apiProvider !== 'blockcypher');
        
        let confirmations = 0;
        let confirmed = false;

        if (isBlockstream) {
            // Blockstream format
            if (response.status?.confirmed) {
                // Get current block height to calculate confirmations
                try {
                    const currentBlockResponse = await this.blockstreamClient.get<any>('/blocks/tip/height');
                    // Blockstream returns just a number, not a JSON object
                    const currentBlockHeight = typeof currentBlockResponse === 'number' 
                        ? currentBlockResponse 
                        : parseInt(String(currentBlockResponse), 10);
                    const txBlockHeight = response.status.block_height || 0;
                    confirmations = txBlockHeight > 0 ? Math.max(1, currentBlockHeight - txBlockHeight + 1) : 0;
                    Console.info('Calculated confirmations from Blockstream', {
                        txHash,
                        txBlockHeight,
                        currentBlockHeight,
                        confirmations
                    });
                } catch (error: any) {
                    Console.warn('Could not get current block height, assuming 1 confirmation if confirmed', {
                        txHash,
                        error: error?.message
                    });
                    // If we can't get current block height, assume at least 1 if confirmed
                    confirmations = response.status.block_height > 0 ? 1 : 0;
                }
            } else {
                confirmations = 0;
            }
        } else {
            // BlockCypher format
            confirmations = response.confirmations || 0;
        }
        
        confirmed = confirmations >= 1; // At least 1 confirmation

        // Calculate total output amount
        let amount = 0;
        let to = '';

        if (isBlockstream) {
            // Blockstream format
            if (response.vout) {
                amount = response.vout.reduce((sum: number, output: any) => {
                    return sum + (output.value || 0);
                }, 0);
                to = response.vout?.[0]?.scriptpubkey_address || '';
            }
        } else {
            // BlockCypher format
            if (response.outputs) {
                amount = response.outputs.reduce((sum: number, output: any) => {
                    return sum + (output.value || 0);
                }, 0) / 100000000; // Convert satoshis to BTC
                to = response.outputs?.[0]?.addresses?.[0] || '';
            }
        }

        return {
            confirmed,
            confirmations,
            amount,
            to
        };
    }

    async checkAddressForIncomingTransactions(address: string): Promise<any[]> {
        try {
            const transactions = await this.getAddressTransactions(address);
            
            // Filter for incoming transactions (where address is in outputs)
            const incoming = transactions.filter((tx: any) => {
                if (this.apiProvider === 'blockcypher') {
                    if (tx.outputs) {
                        return tx.outputs.some((output: any) => 
                            output.addresses && output.addresses.includes(address)
                        );
                    }
                } else {
                    // Blockstream format
                    if (tx.vout) {
                        return tx.vout.some((output: any) => 
                            output.scriptpubkey_address === address
                        );
                    }
                }
                return false;
            });

            return incoming;
        } catch (error: any) {
            Console.error(error, { message: 'Failed to check address for transactions', address });
            return [];
        }
    }
}

