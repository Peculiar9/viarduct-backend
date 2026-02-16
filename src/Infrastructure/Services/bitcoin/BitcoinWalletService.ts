import { inject, injectable } from 'inversify';
import * as bitcoin from 'bitcoinjs-lib';
import { BIP32Factory } from 'bip32';
import * as ecc from 'tiny-secp256k1';
import { TYPES } from '../../../Core/Types/Constants';
import { IBitcoinWalletService } from '../../../Core/Application/Interface/Services/IBitcoinWalletService';
import { WalletAccountRepository } from '../../Repository/SQL/wallet/WalletAccountRepository';
import { WalletRepository } from '../../Repository/SQL/wallet/WalletRepository';
import { CurrencyRepository } from '../../Repository/SQL/wallet/CurrencyRepository';
import { EnvironmentConfig } from '../../Config/EnvironmentConfig';
import { Console } from '../../Utils/Console';
import { ServiceError, ValidationError } from '../../../Core/Application/Error/AppError';
import * as CryptoJS from 'crypto-js';
import { IBitcoinWebhookService } from '../../../Core/Application/Interface/Services/IBitcoinWebhookService';

const bip32 = BIP32Factory(ecc);

// Bitcoin network (mainnet or testnet)
const getNetwork = (): bitcoin.Network => {
    const network = EnvironmentConfig.get('BITCOIN_NETWORK', 'testnet');
    return network === 'mainnet' ? bitcoin.networks.bitcoin : bitcoin.networks.testnet;
};

@injectable()
export class BitcoinWalletService implements IBitcoinWalletService {
    private readonly network: bitcoin.Network;
    private masterNode: any = null; 

    constructor(
        @inject(TYPES.WalletAccountRepository) private readonly walletAccountRepository: WalletAccountRepository,
        @inject(TYPES.WalletRepository) private readonly walletRepository: WalletRepository,
        @inject(TYPES.CurrencyRepository) private readonly currencyRepository: CurrencyRepository,
        @inject(TYPES.BitcoinWebhookService) private readonly bitcoinWebhookService: IBitcoinWebhookService
    ) {
        this.network = getNetwork();
        this.initializeMasterNode();
    }

    /**
     * Initialize master node from encrypted seed
     * In production, this should be stored securely (encrypted in DB or environment variable)
     */
    private initializeMasterNode(): void {
        try {
            // Get master seed from environment (encrypted)
            const encryptedSeed = EnvironmentConfig.get('BITCOIN_MASTER_SEED_ENCRYPTED');
            const encryptionKey = EnvironmentConfig.get('BITCOIN_ENCRYPTION_KEY');

            if (!encryptedSeed || !encryptionKey) {
                Console.warn('BITCOIN_MASTER_SEED_ENCRYPTED or BITCOIN_ENCRYPTION_KEY not found. Generating new seed...');
                // Generate a new seed (ONLY FOR DEVELOPMENT - in production, you must set this)
                const seed = this.generateNewSeed();
                Console.warn('Generated new seed. Save this securely:', { seed });
                this.masterNode = bip32.fromSeed(Buffer.from(seed, 'hex'), this.network);
                return;
            }

            // Decrypt the seed
            const decryptedBytes = CryptoJS.AES.decrypt(encryptedSeed, encryptionKey);
            const seedHex = decryptedBytes.toString(CryptoJS.enc.Utf8);

            if (!seedHex) {
                throw new ServiceError('Failed to decrypt Bitcoin master seed');
            }

            this.masterNode = bip32.fromSeed(Buffer.from(seedHex, 'hex'), this.network);
            Console.info('Bitcoin master node initialized successfully');
        } catch (error: any) {
            Console.error(error, { message: 'Failed to initialize Bitcoin master node' });
            throw new ServiceError('Failed to initialize Bitcoin wallet service');
        }
    }

    /**
     * Generate a new random seed (for initial setup only)
     */
    private generateNewSeed(): string {
        const crypto = require('crypto');
        return crypto.randomBytes(32).toString('hex');
    }

    /**
     * Derive a unique path for a user's wallet account
     * Format: m/44'/0'/0'/0/{walletAccountIdHash}
     * Using BIP44 standard
     */
    private derivePathForAccount(walletAccountId: string): string {
        // Create a deterministic index from walletAccountId
        // Using first 8 characters of UUID hash as account index
        const hash = this.simpleHash(walletAccountId);
        const accountIndex = parseInt(hash.substring(0, 8), 16) % 2147483647; // Max BIP32 index
        
        // BIP44: m / purpose' / coin_type' / account' / change / address_index
        // Bitcoin testnet: coin_type = 1, mainnet: coin_type = 0
        const coinType = this.network === bitcoin.networks.bitcoin ? 0 : 1;
        return `m/44'/${coinType}'/0'/0/${accountIndex}`;
    }

    /**
     * Simple hash function for deterministic account indexing
     */
    private simpleHash(str: string): string {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return Math.abs(hash).toString(16).padStart(8, '0');
    }

    /**
     * Generate Bitcoin address from derived key
     */
    private generateAddressFromKey(derivedKey: any, addressType: 'p2pkh' | 'p2wpkh' = 'p2wpkh'): {
        address: string;
        addressType: string;
    } {
        const { address } = bitcoin.payments[addressType]({
            pubkey: derivedKey.publicKey,
            network: this.network,
        });

        if (!address) {
            throw new ServiceError('Failed to generate Bitcoin address');
        }

        return {
            address,
            addressType: addressType === 'p2wpkh' ? 'p2wpkh' : 'p2pkh'
        };
    }

    async generateAddress(userId: string, walletAccountId: string): Promise<{
        address: string;
        addressType: 'p2pkh' | 'p2sh' | 'p2wpkh' | 'p2wsh';
    }> {
        try {
            // Verify wallet account exists and belongs to user
            const walletAccount = await this.walletAccountRepository.findById(walletAccountId);
            if (!walletAccount) {
                throw new ValidationError('Wallet account not found');
            }

            // Verify it's a BTC account
            const btcCurrency = await this.currencyRepository.findByCode('BTC');
            if (!btcCurrency || walletAccount.currency_id !== btcCurrency._id) {
                throw new ValidationError('Wallet account is not a Bitcoin account');
            }

            // Verify wallet belongs to user (or is platform wallet)
            const wallet = await this.walletRepository.findById(walletAccount.wallet_id);
            if (!wallet) {
                throw new ValidationError('Wallet not found');
            }
            
            // For platform wallet, userId will be 'platform' and wallet.user_id will be null
            if (userId === 'platform') {
                if (!wallet.is_platform_wallet) {
                    throw new ValidationError('Wallet is not a platform wallet');
                }
            } else {
                // For regular users, verify wallet belongs to user
                if (wallet.user_id !== userId) {
                    throw new ValidationError('Wallet does not belong to user');
                }
            }

            // Check if address already exists
            if (walletAccount.address) {
                return {
                    address: walletAccount.address,
                    addressType: (walletAccount.address_type || 'p2wpkh') as any
                };
            }

            // Derive key for this account
            const path = this.derivePathForAccount(walletAccountId);
            const derivedKey = this.masterNode.derivePath(path);

            // Generate address (using native segwit - bech32)
            const { address, addressType } = this.generateAddressFromKey(derivedKey, 'p2wpkh');

            // Update wallet account with generated address
            await this.walletAccountRepository.update(walletAccountId, {
                address: address,
                address_type: addressType
            } as any);

            Console.info('Bitcoin address generated', {
                userId,
                walletAccountId,
                address,
                addressType
            });

            // Register webhook for the address
            try {
                await this.bitcoinWebhookService.registerAddressWebhook(address, walletAccountId);
            } catch (error: any) {
                Console.warn('Failed to register webhook, but address was created', { 
                    address, 
                    error: error.message 
                });
            }

            return { address, addressType: addressType as any };
        } catch (error: any) {
            Console.error(error, { message: 'Failed to generate Bitcoin address', userId, walletAccountId });
            throw error;
        }
    }

    async getOrGenerateAddress(userId: string, walletAccountId: string): Promise<string> {
        const result = await this.generateAddress(userId, walletAccountId);
        return result.address;
    }

    async initializePlatformWallet(): Promise<void> {
        try {
            // Check if platform wallet exists
            const platformWallet = await this.walletRepository.findPlatformWallet();
            
            if (!platformWallet || !platformWallet._id) {
                throw new ServiceError('Platform wallet not found. Please create it first.');
            }

            // Get BTC currency
            const btcCurrency = await this.currencyRepository.findByCode('BTC');
            if (!btcCurrency || !btcCurrency._id) {
                throw new ServiceError('BTC currency not found');
            }

            // Get or create platform BTC account
            let platformAccount = await this.walletAccountRepository.findByWalletIdAndCurrencyId(
                platformWallet._id,
                btcCurrency._id
            );

            if (!platformAccount) {
                // Create platform BTC account
                const accountData: any = {
                    wallet_id: platformWallet._id,
                    currency_id: btcCurrency._id,
                    balance: 0,
                    available_balance: 0,
                    locked_balance: 0,
                    status: 'active'
                };
                platformAccount = await this.walletAccountRepository.create(accountData);
            }

            // Generate address if not exists
            if (!platformAccount.address) {
                const path = this.derivePathForAccount('platform_' + platformAccount._id);
                const derivedKey = this.masterNode.derivePath(path);
                const { address, addressType } = this.generateAddressFromKey(derivedKey, 'p2wpkh');

                await this.walletAccountRepository.update(platformAccount._id!, {
                    address: address,
                    address_type: addressType
                } as any);

                Console.info('Platform wallet address generated', { address, addressType });

                // Register webhook for platform wallet address
                try {
                    await this.bitcoinWebhookService.registerAddressWebhook(address, platformAccount._id);
                } catch (error: any) {
                    Console.warn('Failed to register webhook for platform wallet, but address was created', { 
                        address, 
                        error: error.message 
                    });
                }
            }
        } catch (error: any) {
            Console.error(error, { message: 'Failed to initialize platform wallet' });
            throw error;
        }
    }

    async getPlatformWalletAddress(): Promise<string> {
        const platformWallet = await this.walletRepository.findPlatformWallet();
        if (!platformWallet || !platformWallet._id) {
            throw new ServiceError('Platform wallet not found');
        }

        const btcCurrency = await this.currencyRepository.findByCode('BTC');
        if (!btcCurrency || !btcCurrency._id) {
            throw new ServiceError('BTC currency not found');
        }

        const platformAccount = await this.walletAccountRepository.findByWalletIdAndCurrencyId(
            platformWallet._id,
            btcCurrency._id
        );

        if (!platformAccount || !platformAccount.address) {
            throw new ServiceError('Platform wallet address not initialized. Call initializePlatformWallet() first.');
        }

        return platformAccount.address;
    }
}

