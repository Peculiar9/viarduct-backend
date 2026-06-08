import { inject, injectable } from 'inversify';
import { HDNodeWallet } from 'ethers';
import * as CryptoJS from 'crypto-js';
import { TYPES } from '../../../Core/Types/Constants';
import { IEthereumWalletService } from '../../../Core/Application/Interface/Services/IEthereumWalletService';
import { WalletAccountRepository } from '../../Repository/SQL/wallet/WalletAccountRepository';
import { WalletRepository } from '../../Repository/SQL/wallet/WalletRepository';
import { CurrencyRepository } from '../../Repository/SQL/wallet/CurrencyRepository';
import { EnvironmentConfig } from '../../Config/EnvironmentConfig';
import { Console } from '../../Utils/Console';
import { ServiceError, ValidationError } from '../../../Core/Application/Error/AppError';

@injectable()
export class EthereumWalletService implements IEthereumWalletService {
    private root: HDNodeWallet | null = null;

    constructor(
        @inject(TYPES.WalletAccountRepository) private readonly walletAccountRepository: WalletAccountRepository,
        @inject(TYPES.WalletRepository) private readonly walletRepository: WalletRepository,
        @inject(TYPES.CurrencyRepository) private readonly currencyRepository: CurrencyRepository
    ) {
        this.initializeRoot();
    }

    private getEncryptedSeed(): string {
        return (
            EnvironmentConfig.get('ETHEREUM_MASTER_SEED_ENCRYPTED', '') ||
            EnvironmentConfig.get('BITCOIN_MASTER_SEED_ENCRYPTED', '')
        );
    }

    private getEncryptionKey(): string {
        return (
            EnvironmentConfig.get('ETHEREUM_ENCRYPTION_KEY', '') ||
            EnvironmentConfig.get('BITCOIN_ENCRYPTION_KEY', '')
        );
    }

    private initializeRoot(): void {
        try {
            const encryptedSeed = this.getEncryptedSeed();
            const encryptionKey = this.getEncryptionKey();

            if (!encryptedSeed || !encryptionKey) {
                Console.warn(
                    'ETHEREUM_MASTER_SEED_ENCRYPTED / ETHEREUM_ENCRYPTION_KEY not set (and no BITCOIN_* fallback). ' +
                        'Generate a 32-byte hex seed, encrypt with CryptoJS AES, then set env vars.'
                );
                const crypto = require('crypto');
                const seedHex = crypto.randomBytes(32).toString('hex');
                Console.warn('Generated ephemeral Ethereum root (dev only — set ETHEREUM_* env)', { seedHex });
                this.root = HDNodeWallet.fromSeed(new Uint8Array(Buffer.from(seedHex, 'hex')));
                return;
            }

            const decryptedBytes = CryptoJS.AES.decrypt(encryptedSeed, encryptionKey);
            const seedHex = decryptedBytes.toString(CryptoJS.enc.Utf8);
            if (!seedHex) {
                throw new ServiceError(
                    'Failed to decrypt Ethereum master seed. ' +
                        'Check ETHEREUM_MASTER_SEED_ENCRYPTED + ETHEREUM_ENCRYPTION_KEY (or BITCOIN_* fallback).'
                );
            }
            const normalized = seedHex.trim();
            const isHexSeed = /^[0-9a-fA-F]{64}$/.test(normalized);
            if (!isHexSeed) {
                throw new ServiceError(
                    'Ethereum master seed must be a 32-byte hex string (64 hex chars) AFTER decryption. ' +
                        `Got length=${normalized.length}. ` +
                        'Re-encrypt the raw hex seed (not mnemonic words) with the matching encryption key.'
                );
            }
            this.root = HDNodeWallet.fromSeed(new Uint8Array(Buffer.from(normalized, 'hex')));
            Console.info('Ethereum HD root initialized');
        } catch (error: any) {
            Console.error(error, { message: 'Failed to initialize Ethereum wallet root' });
            const msg = error?.message || String(error);
            throw new ServiceError(`Failed to initialize Ethereum wallet service: ${msg}`);
        }
    }

    private simpleHash(str: string): string {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = (hash << 5) - hash + char;
            hash = hash & hash;
        }
        return Math.abs(hash).toString(16).padStart(8, '0');
    }

    /** BIP44 Ethereum account index from wallet account id (same pattern as Bitcoin service). */
    private derivePathForAccount(walletAccountId: string): string {
        const hash = this.simpleHash(walletAccountId);
        const accountIndex = parseInt(hash.substring(0, 8), 16) % 2147483647;
        return `m/44'/60'/0'/0/${accountIndex}`;
    }

    async generateAddress(userId: string, walletAccountId: string): Promise<{ address: string }> {
        if (!this.root) {
            throw new ServiceError('Ethereum wallet root not initialized');
        }

        const walletAccount = await this.walletAccountRepository.findById(walletAccountId);
        if (!walletAccount) {
            throw new ValidationError('Wallet account not found');
        }

        const ethCurrency = await this.currencyRepository.findByCode('ETH');
        if (!ethCurrency || walletAccount.currency_id !== ethCurrency._id) {
            throw new ValidationError('Wallet account is not an Ethereum account');
        }

        const wallet = await this.walletRepository.findById(walletAccount.wallet_id);
        if (!wallet) {
            throw new ValidationError('Wallet not found');
        }

        if (userId === 'platform') {
            if (!wallet.is_platform_wallet) {
                throw new ValidationError('Wallet is not a platform wallet');
            }
        } else if (wallet.user_id !== userId) {
            throw new ValidationError('Wallet does not belong to user');
        }

        if (walletAccount.address) {
            return { address: walletAccount.address };
        }

        const path = this.derivePathForAccount(walletAccountId);
        const child = this.root.derivePath(path);
        const address = child.address;

        await this.walletAccountRepository.update(walletAccountId, {
            address,
            address_type: 'eoa'
        } as any);

        Console.info('Ethereum address generated', { userId, walletAccountId, address });
        return { address };
    }

    async getOrGenerateAddress(userId: string, walletAccountId: string): Promise<string> {
        const { address } = await this.generateAddress(userId, walletAccountId);
        return address;
    }

    async initializePlatformWallet(): Promise<void> {
        const platformWallet = await this.walletRepository.findPlatformWallet();
        if (!platformWallet || !platformWallet._id) {
            throw new ServiceError('Platform wallet not found. Please create it first.');
        }

        const ethCurrency = await this.currencyRepository.findByCode('ETH');
        if (!ethCurrency || !ethCurrency._id) {
            throw new ServiceError('ETH currency not found');
        }

        let platformAccount = await this.walletAccountRepository.findByWalletIdAndCurrencyId(
            platformWallet._id,
            ethCurrency._id
        );

        if (!platformAccount) {
            platformAccount = await this.walletAccountRepository.create({
                wallet_id: platformWallet._id,
                currency_id: ethCurrency._id,
                balance: 0,
                available_balance: 0,
                locked_balance: 0,
                user_balance: 0,
                platform_owned_balance: 0,
                total_onchain_balance: 0,
                sweep_threshold: null,
                address: null,
                address_type: null,
                status: 'active'
            } as any);
        }

        if (!platformAccount.address && platformAccount._id) {
            await this.getOrGenerateAddress('platform', platformAccount._id);
        }
    }

    async getDerivedWalletForAccount(walletAccountId: string): Promise<HDNodeWallet> {
        if (!this.root) {
            throw new ServiceError('Ethereum wallet root not initialized');
        }
        const path = this.derivePathForAccount(walletAccountId);
        return this.root.derivePath(path);
    }

    async getPlatformWalletAddress(): Promise<string> {
        const platformWallet = await this.walletRepository.findPlatformWallet();
        if (!platformWallet || !platformWallet._id) {
            throw new ServiceError('Platform wallet not found');
        }

        const ethCurrency = await this.currencyRepository.findByCode('ETH');
        if (!ethCurrency || !ethCurrency._id) {
            throw new ServiceError('ETH currency not found');
        }

        const platformAccount = await this.walletAccountRepository.findByWalletIdAndCurrencyId(
            platformWallet._id,
            ethCurrency._id
        );

        if (!platformAccount || !platformAccount.address) {
            throw new ServiceError('Platform ETH address not initialized. Run platform wallet init / generate address.');
        }

        return platformAccount.address;
    }
}
