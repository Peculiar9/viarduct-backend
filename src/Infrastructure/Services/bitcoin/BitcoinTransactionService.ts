import { inject, injectable } from 'inversify';
import * as bitcoin from 'bitcoinjs-lib';
import { BIP32Factory } from 'bip32';
import * as ecc from 'tiny-secp256k1';
import * as CryptoJS from 'crypto-js';
import axios from 'axios';
import { TYPES } from '../../../Core/Types/Constants';
import { IBitcoinTransactionService } from '../../../Core/Application/Interface/Services/IBitcoinTransactionService';
import { IBlockchainService } from '../../../Core/Application/Interface/Services/IBlockchainService';
import { IBitcoinWalletService } from '../../../Core/Application/Interface/Services/IBitcoinWalletService';
import { IHttpClient } from '../../../Core/Application/Interface/Infrastructure/IHttpClient';
import { HttpClientFactory } from '../../Http/HttpClientFactory';
import { EnvironmentConfig } from '../../Config/EnvironmentConfig';
import { Console } from '../../Utils/Console';
import { ServiceError } from '../../../Core/Application/Error/AppError';
import { WalletAccountRepository } from '../../Repository/SQL/wallet/WalletAccountRepository';

const bip32 = BIP32Factory(ecc);

// Bitcoin network (mainnet or testnet)
const getNetwork = (): bitcoin.Network => {
    const network = EnvironmentConfig.get('BITCOIN_NETWORK', 'testnet');
    return network === 'mainnet' ? bitcoin.networks.bitcoin : bitcoin.networks.testnet;
};

@injectable()
export class BitcoinTransactionService implements IBitcoinTransactionService {
    private readonly network: bitcoin.Network;
    private readonly httpClient: IHttpClient;
    private readonly baseUrl: string;
    private readonly apiKey: string;

    constructor(
        @inject(TYPES.HttpClientFactory) httpClientFactory: HttpClientFactory,
        @inject(TYPES.BlockchainService) private readonly blockchainService: IBlockchainService,
        @inject(TYPES.BitcoinWalletService) private readonly bitcoinWalletService: IBitcoinWalletService,
        @inject(TYPES.WalletAccountRepository) private readonly walletAccountRepo: WalletAccountRepository
    ) {
        this.network = getNetwork();
        const networkStr = EnvironmentConfig.get('BITCOIN_NETWORK', 'testnet');
        this.baseUrl = networkStr === 'mainnet' 
            ? 'https://api.blockcypher.com/v1/btc/main'
            : 'https://api.blockcypher.com/v1/btc/test3';
        this.apiKey = EnvironmentConfig.get('BLOCKCYPHER_API_KEY', '');
        
        this.httpClient = httpClientFactory.createClient({
            baseURL: this.baseUrl,
            timeout: 30000,
            headers: this.apiKey ? { 'Authorization': `Bearer ${this.apiKey}` } : {}
        });
    }

    async calculateNetworkFee(priority: 'low' | 'medium' | 'high' = 'medium'): Promise<number> {
        try {
            // Get current fee recommendations from BlockCypher
            const response = await this.httpClient.get<any>('/');
            
            let feePerKb: number;
            if (priority === 'low') {
                feePerKb = response.low_fee_per_kb || 10000; // satoshis per KB
            } else if (priority === 'high') {
                feePerKb = response.high_fee_per_kb || 50000;
            } else {
                feePerKb = response.medium_fee_per_kb || 20000;
            }

            // Estimate transaction size (typical P2WPKH transaction is ~140 bytes)
            const estimatedSize = 140; // bytes
            const feeInSatoshis = Math.ceil((feePerKb * estimatedSize) / 1000);
            
            // Convert satoshis to BTC
            const feeInBTC = feeInSatoshis / 100000000;
            
            Console.info('Network fee calculated', {
                priority,
                feePerKb,
                estimatedSize,
                feeInSatoshis,
                feeInBTC
            });

            return feeInBTC;
        } catch (error: any) {
            Console.error(error, { message: 'Failed to calculate network fee' });
            // Fallback to fixed fee
            return 0.00002; // 0.00002 BTC as fallback
        }
    }

    async buildTransaction(
        fromAddress: string,
        toAddress: string,
        amount: number,
        fee?: number
    ): Promise<any> {
        try {
            // Get UTXOs (unspent transaction outputs) for the from address
            const utxos = await this.getUTXOs(fromAddress);
            
            if (utxos.length === 0) {
                throw new ServiceError(`No unspent outputs found for address: ${fromAddress}`);
            }

            // Calculate fee if not provided - ensure valid numbers
            const networkFee = fee ?? await this.calculateNetworkFee();
            const feeInSatoshis = Math.max(1, Math.ceil(Number(networkFee) * 100000000) || 1);
            const amountInSatoshis = Math.floor(Number(amount) * 100000000) || 0;

            // Select UTXOs to cover amount + fee
            let totalInput = 0;
            const selectedUTXOs: any[] = [];
            
            for (const utxo of utxos) {
                selectedUTXOs.push(utxo);
                totalInput += utxo.value;
                
                if (totalInput >= amountInSatoshis + feeInSatoshis) {
                    break;
                }
            }

            if (totalInput < amountInSatoshis + feeInSatoshis) {
                throw new ServiceError(`Insufficient balance. Need ${(amountInSatoshis + feeInSatoshis) / 100000000} BTC, have ${totalInput / 100000000} BTC`);
            }

            // Calculate change - ensure valid integer for BigInt
            const change = Math.floor(totalInput - amountInSatoshis - feeInSatoshis);
            const safeChange = Number.isNaN(change) ? 0 : Math.max(0, change);

            // Build transaction
            const psbt = new bitcoin.Psbt({ network: this.network });

            // Add inputs
            for (const utxo of selectedUTXOs) {
                const v = Math.floor(Number(utxo.value)) || 0;
                psbt.addInput({
                    hash: utxo.tx_hash,
                    index: utxo.tx_output_n,
                    witnessUtxo: {
                        script: Buffer.from(utxo.script, 'hex'),
                        value: BigInt(Number.isNaN(v) ? 0 : v)
                    }
                });
            }

            // Add outputs
            psbt.addOutput({
                address: toAddress,
                value: BigInt(Number.isNaN(amountInSatoshis) ? 0 : amountInSatoshis)
            });

            // Add change output if there's change
            if (safeChange > 0) {
                psbt.addOutput({
                    address: fromAddress,
                    value: BigInt(safeChange)
                });
            }

            Console.info('Transaction built', {
                fromAddress,
                toAddress,
                amount,
                fee: networkFee,
                inputs: selectedUTXOs.length,
                change: change / 100000000
            });

            return {
                psbt,
                utxos: selectedUTXOs,
                fromAddress,
                toAddress,
                amount: amountInSatoshis,
                fee: feeInSatoshis,
                change
            };
        } catch (error: any) {
            Console.error(error, { message: 'Failed to build transaction', fromAddress, toAddress, amount });
            throw error;
        }
    }

    async signTransaction(transaction: any, fromAddress: string): Promise<string> {
        try {
            // Get wallet account to find the derivation path
            const walletAccount = await this.walletAccountRepo.findByAddress(fromAddress);
            if (!walletAccount || !walletAccount._id) {
                throw new ServiceError(`Wallet account not found for address: ${fromAddress}`);
            }

            // Derive private key for this address
            const path = this.derivePathForAccount(walletAccount._id);
            const masterNode = await this.getMasterNode();
            const derivedKey = masterNode.derivePath(path);

            // Sign all inputs
            const psbt = transaction.psbt;
            for (let i = 0; i < transaction.utxos.length; i++) {
                psbt.signInput(i, derivedKey);
            }

            // Finalize and extract transaction
            psbt.finalizeAllInputs();
            const signedTx = psbt.extractTransaction();

            // Convert to hex
            const signedTxHex = signedTx.toHex();

            Console.info('Transaction signed', {
                fromAddress,
                txId: signedTx.getId(),
                inputs: transaction.utxos.length
            });

            return signedTxHex;
        } catch (error: any) {
            Console.error(error, { message: 'Failed to sign transaction', fromAddress });
            throw error;
        }
    }

    async broadcastTransaction(signedTransactionHex: string): Promise<string> {
        try {
            // Try BlockCypher first
            let response: any;
            let txHash: string | undefined;
            
            try {
                response = await this.httpClient.post<any>('/txs/push', {
                    tx: signedTransactionHex
                });

                txHash = response.hash || response.tx?.hash;
                
                if (txHash) {
                    Console.info('Transaction broadcasted via BlockCypher', {
                        txHash,
                        confirmations: response.confirmations || 0
                    });
                    return txHash;
                }
            } catch (blockcypherError: any) {
                Console.warn('BlockCypher broadcast failed, trying Blockstream', {
                    error: blockcypherError?.message || 'Unknown error',
                    errorResponse: blockcypherError?.response?.data
                });
                
                // Fallback to Blockstream
                try {
                    // Blockstream uses /tx endpoint for broadcasting (raw hex)
                    const network = EnvironmentConfig.get('BITCOIN_NETWORK', 'testnet');
                    const blockstreamBaseUrl = network === 'mainnet'
                        ? 'https://blockstream.info/api'
                        : 'https://blockstream.info/testnet/api';
                    
                    const blockstreamResponse = await axios.post(
                        `${blockstreamBaseUrl}/tx`,
                        signedTransactionHex,
                        {
                            headers: { 'Content-Type': 'text/plain' },
                            timeout: 30000
                        }
                    );
                    
                    // Blockstream returns the txid in the response body (as text)
                    // We can also calculate it from the transaction hex
                    const responseData = blockstreamResponse.data;
                    txHash = typeof responseData === 'string' ? responseData.trim() : responseData;
                    
                    // If Blockstream doesn't return the hash, calculate it from the transaction
                    if (!txHash || txHash.length !== 64) {
                        // Calculate txid from the transaction hex
                        const txBuffer = Buffer.from(signedTransactionHex, 'hex');
                        const txHashBuffer = bitcoin.crypto.hash256(txBuffer);
                        // Reverse the buffer (mutates in place) and convert to hex
                        const reversed = Buffer.from(txHashBuffer).reverse();
                        txHash = reversed.toString('hex');
                    }
                    
                    if (txHash) {
                        Console.info('Transaction broadcasted via Blockstream', { txHash });
                        return txHash;
                    }
                } catch (blockstreamError: any) {
                    // Extract detailed error messages
                    const blockcypherMsg = blockcypherError?.response?.data?.error || 
                                         blockcypherError?.response?.data?.message ||
                                         blockcypherError?.message || 
                                         'Unknown BlockCypher error';
                    const blockstreamMsg = blockstreamError?.response?.data || 
                                          blockstreamError?.response?.statusText ||
                                          blockstreamError?.message || 
                                          'Unknown Blockstream error';
                    
                    const broadcastError = new Error(
                        `Both BlockCypher and Blockstream failed to broadcast. ` +
                        `BlockCypher: ${blockcypherMsg}. Blockstream: ${blockstreamMsg}`
                    );
                    Console.error(broadcastError, {
                        blockcypherError: blockcypherMsg,
                        blockstreamError: blockstreamMsg,
                        blockcypherResponse: blockcypherError?.response?.data,
                        blockstreamResponse: blockstreamError?.response?.data,
                        blockstreamStatus: blockstreamError?.response?.status
                    });
                    
                    throw new ServiceError(
                        `Failed to broadcast transaction on both BlockCypher and Blockstream. ` +
                        `BlockCypher: ${blockcypherMsg}. Blockstream: ${blockstreamMsg}`
                    );
                }
            }
            
            // If we get here, no txHash was found
            throw new ServiceError('Failed to get transaction hash from broadcast response');
        } catch (error: any) {
            Console.error(error, { 
                message: 'Failed to broadcast transaction',
                errorType: error?.constructor?.name,
                errorMessage: error?.message,
                errorResponse: error?.response?.data
            });
            
            // Extract error message properly
            let errorMessage = 'Unknown error';
            if (error instanceof ServiceError) {
                errorMessage = error.message;
            } else if (error?.response?.data?.error) {
                errorMessage = error.response.data.error;
            } else if (error?.response?.data?.message) {
                errorMessage = error.response.data.message;
            } else if (error?.message) {
                errorMessage = error.message;
            }
            
            throw new ServiceError(`Failed to broadcast transaction: ${errorMessage}`);
        }
    }

    async sendBitcoin(
        fromAddress: string,
        toAddress: string,
        amount: number,
        priority: 'low' | 'medium' | 'high' = 'medium'
    ): Promise<string> {
        try {
            // Calculate fee
            const fee = await this.calculateNetworkFee(priority);

            // Build transaction
            const transaction = await this.buildTransaction(fromAddress, toAddress, amount, fee);

            // Sign transaction
            const signedTxHex = await this.signTransaction(transaction, fromAddress);

            // Broadcast transaction
            const txHash = await this.broadcastTransaction(signedTxHex);

            Console.info('Bitcoin sent successfully', {
                fromAddress,
                toAddress,
                amount,
                fee,
                txHash
            });

            return txHash;
        } catch (error: any) {
            Console.error(error, { message: 'Failed to send Bitcoin', fromAddress, toAddress, amount });
            throw error;
        }
    }

    /**
     * Safe number for BigInt - ensures valid integer (prevents NaN)
     */
    private safeSatoshis(value: number): number {
        const n = Math.floor(Number(value));
        return Number.isNaN(n) ? 0 : Math.max(0, n);
    }

    /**
     * Build a Bitcoin transaction using specific UTXOs from database
     * This is used when UTXOs are already reserved
     */
    async buildTransactionWithUTXOs(
        fromAddress: string,
        toAddress: string,
        amount: number,
        utxos: Array<{ txid: string; vout: number; amount: number; script?: string }>,
        fee?: number
    ): Promise<any> {
        try {
            if (utxos.length === 0) {
                throw new ServiceError('No UTXOs provided');
            }

            // Calculate fee if not provided - ensure valid numbers
            const networkFee = fee ?? await this.calculateNetworkFee();
            const networkFeeNum = Number(networkFee);
            if (Number.isNaN(networkFeeNum) || networkFeeNum < 0) {
                throw new ServiceError('Invalid network fee');
            }
            let feeInSatoshis = this.safeSatoshis(networkFeeNum * 100000000) || 1;

            const amountNum = Number(amount);
            if (Number.isNaN(amountNum) || amountNum <= 0) {
                throw new ServiceError('Invalid amount for transaction');
            }
            const amountInSatoshis = this.safeSatoshis(amountNum * 100000000);

            // Calculate total input from provided UTXOs
            let totalInput = 0;
            const selectedUTXOs: any[] = [];
            
            for (const utxo of utxos) {
                // Convert amount to satoshis - handle Decimal/string/undefined safely
                const rawAmount = typeof utxo.amount === 'number' ? utxo.amount : parseFloat(String(utxo.amount ?? 0));
                let utxoAmountInBTC: number;
                if (Number.isNaN(rawAmount)) {
                    utxoAmountInBTC = 0;
                } else if (rawAmount > 1 && rawAmount < 21000000 * 100000000) {
                    utxoAmountInBTC = rawAmount / 100000000;
                    Console.warn('UTXO amount appears to be in satoshis, converting to BTC', {
                        original: rawAmount,
                        converted: utxoAmountInBTC,
                        txid: utxo.txid,
                        vout: utxo.vout
                    });
                } else {
                    utxoAmountInBTC = rawAmount;
                }
                
                const utxoValue = this.safeSatoshis(utxoAmountInBTC * 100000000);
                
                selectedUTXOs.push({
                    tx_hash: utxo.txid,
                    tx_output_n: utxo.vout,
                    value: utxoValue,
                    script: utxo.script || '' // Will fetch if not provided
                });
                
                totalInput += utxoValue;
                
                // We have enough when total covers amount + fee
                if (totalInput >= amountInSatoshis + feeInSatoshis) {
                    break;
                }
            }

            if (totalInput < amountInSatoshis + feeInSatoshis) {
                throw new ServiceError(
                    `Insufficient UTXOs. Need ${(amountInSatoshis + feeInSatoshis) / 100000000} BTC, have ${totalInput / 100000000} BTC`
                );
            }

            // Calculate change - ensure valid integer
            let change = this.safeSatoshis(totalInput - amountInSatoshis - feeInSatoshis);

            // Bitcoin dust threshold: 546 satoshis (0.00000546 BTC)
            // If change is dust, add it to the fee instead of creating a dust output
            // Bitcoin network rejects transactions with dust outputs unless fee is 0
            const DUST_THRESHOLD = 546; // satoshis

            if (change > 0 && change < DUST_THRESHOLD) {
                // Change is dust - add it to fee instead of creating output
                Console.info('Change is dust, adding to fee', {
                    change: change,
                    changeInBTC: change / 100000000,
                    originalFee: feeInSatoshis,
                    originalFeeInBTC: feeInSatoshis / 100000000,
                    newFee: feeInSatoshis + change,
                    newFeeInBTC: (feeInSatoshis + change) / 100000000
                });
                feeInSatoshis += change; // Add dust to fee
                change = 0; // No change output
            }

            // Fetch script for UTXOs that don't have it
            // For now, we'll need to get it from blockchain or use a placeholder
            // In production, you'd want to store script in database
            for (const utxo of selectedUTXOs) {
                if (!utxo.script) {
                    const vout = utxo.tx_output_n;

                    // Try BlockCypher transaction details first
                    try {
                        const txResponse = await this.httpClient.get<any>(`/txs/${utxo.tx_hash}`);
                        if (txResponse?.outputs && txResponse.outputs[vout]) {
                            const out = txResponse.outputs[vout];
                            utxo.script = out.script || out.script_hex || '';
                        }
                    } catch (error: any) {
                        Console.warn('Could not fetch script from BlockCypher for UTXO', {
                            txid: utxo.tx_hash,
                            vout,
                            error: error?.message
                        });
                    }

                    // Fallback to Blockstream if still missing
                    if (!utxo.script) {
                        try {
                            const networkStr = EnvironmentConfig.get('BITCOIN_NETWORK', 'testnet');
                            const blockstreamBaseUrl = networkStr === 'mainnet'
                                ? 'https://blockstream.info/api'
                                : 'https://blockstream.info/testnet/api';

                            const blockstreamTx = await axios.get(`${blockstreamBaseUrl}/tx/${utxo.tx_hash}`, {
                                timeout: 30000
                            });
                            const out = blockstreamTx.data?.vout?.[vout];
                            utxo.script = out?.scriptpubkey || '';
                        } catch (error: any) {
                            Console.warn('Could not fetch script from Blockstream for UTXO', {
                                txid: utxo.tx_hash,
                                vout,
                                error: error?.message
                            });
                        }
                    }
                }
            }

            // Build transaction
            const psbt = new bitcoin.Psbt({ network: this.network });

            // Add inputs
            for (const utxo of selectedUTXOs) {
                if (!utxo.script) {
                    throw new ServiceError(
                        `Missing script for UTXO ${utxo.tx_hash}:${utxo.tx_output_n}. ` +
                        'Sync UTXOs again or backfill script from transaction details.'
                    );
                }
                const inputValue = this.safeSatoshis(utxo.value);
                psbt.addInput({
                    hash: utxo.tx_hash,
                    index: typeof utxo.tx_output_n === 'number' ? utxo.tx_output_n : parseInt(String(utxo.tx_output_n ?? 0), 10),
                    witnessUtxo: {
                        script: Buffer.from(utxo.script, 'hex'),
                        value: BigInt(inputValue)
                    }
                });
            }

            // Add outputs - ensure all values are valid integers for BigInt
            psbt.addOutput({
                address: toAddress,
                value: BigInt(this.safeSatoshis(amountInSatoshis))
            });

            // Add change output only if change is above dust threshold
            if (change >= DUST_THRESHOLD) {
                psbt.addOutput({
                    address: fromAddress,
                    value: BigInt(this.safeSatoshis(change))
                });
            }

            Console.info('Transaction built with reserved UTXOs', {
                fromAddress,
                toAddress,
                amount,
                fee: feeInSatoshis / 100000000, // Convert back to BTC for logging
                inputs: selectedUTXOs.length,
                change: change / 100000000,
                dustHandled: change === 0 && (totalInput - amountInSatoshis - feeInSatoshis) < DUST_THRESHOLD
            });

            return {
                psbt,
                utxos: selectedUTXOs,
                fromAddress,
                toAddress,
                amount: amountInSatoshis,
                fee: feeInSatoshis,
                change
            };
        } catch (error: any) {
            Console.error(error, { message: 'Failed to build transaction with UTXOs', fromAddress, toAddress, amount });
            throw error;
        }
    }

    /**
     * Get UTXOs (Unspent Transaction Outputs) for an address
     */
    private async getUTXOs(address: string): Promise<any[]> {
        try {
            const response = await this.httpClient.get<any>(`/addrs/${address}?unspentOnly=true`);
            
            if (response.txrefs) {
                return response.txrefs.map((txref: any) => ({
                    tx_hash: txref.tx_hash,
                    tx_output_n: txref.tx_output_n,
                    value: txref.value,
                    script: txref.script
                }));
            }

            return [];
        } catch (error: any) {
            Console.error(error, { message: 'Failed to get UTXOs', address });
            throw new ServiceError(`Failed to get UTXOs for address: ${error.message}`);
        }
    }

    /**
     * Derive path for wallet account (same logic as BitcoinWalletService)
     */
    private derivePathForAccount(walletAccountId: string): string {
        const hash = this.simpleHash(walletAccountId);
        const accountIndex = parseInt(hash.substring(0, 8), 16) % 2147483647;
        const coinType = this.network === bitcoin.networks.bitcoin ? 0 : 1;
        return `m/44'/${coinType}'/0'/0/${accountIndex}`;
    }

    /**
     * Simple hash function
     */
    private simpleHash(str: string): string {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash).toString(16).padStart(8, '0');
    }

    /**
     * Get master node (need to access BitcoinWalletService's master node)
     * For now, we'll need to decrypt the seed ourselves or inject BitcoinWalletService
     */
    private async getMasterNode(): Promise<any> {
        // We need access to the master node from BitcoinWalletService
        // For now, let's decrypt it here (duplicate logic, but necessary)

        const encryptedSeed = EnvironmentConfig.get('BITCOIN_MASTER_SEED_ENCRYPTED');
        const encryptionKey = EnvironmentConfig.get('BITCOIN_ENCRYPTION_KEY');

        if (!encryptedSeed || !encryptionKey) {
            throw new ServiceError('Bitcoin master seed not configured');
        }

        const decryptedBytes = CryptoJS.AES.decrypt(encryptedSeed, encryptionKey);
        const seedHex = decryptedBytes.toString(CryptoJS.enc.Utf8);

        if (!seedHex) {
            throw new ServiceError('Failed to decrypt Bitcoin master seed');
        }

        return bip32.fromSeed(Buffer.from(seedHex, 'hex'), this.network);
    }
}

