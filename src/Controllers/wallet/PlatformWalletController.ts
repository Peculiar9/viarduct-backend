import { Request, Response } from 'express';
import { inject } from 'inversify';
import { controller, httpGet, httpPost, request, response, requestBody, requestParam } from 'inversify-express-utils';
import { API_PATH, TYPES } from '../../Core/Types/Constants';
import { IWalletService } from '../../Core/Application/Interface/Services/IWalletService';
import { IBlockchainService } from '../../Core/Application/Interface/Services/IBlockchainService';
import { IBitcoinWebhookService } from '../../Core/Application/Interface/Services/IBitcoinWebhookService';
import { IUTXOManagerService } from '../../Core/Application/Interface/Services/IUTXOManagerService';
import { IUTXORepository } from '../../Core/Application/Interface/Repositories/IUTXORepository';
import { WalletAccountRepository } from '../../Infrastructure/Repository/SQL/wallet/WalletAccountRepository';
import AuthMiddleware from '../../Middleware/AuthMiddleware';
import { BaseController } from '../BaseController';
import { Console } from '../../Infrastructure/Utils/Console';
import { validationMiddleware } from '../../Middleware/ValidationMiddleware';
import { GeneratePlatformAddressDTO } from '../../Core/Application/DTOs/PlatformWalletDTO';
import { CreateUTXOFromTxDTO, StoreChangeUTXODTO } from '../../Core/Application/DTOs/TradingOrderDTO';
import { ITradingOrderRepository } from '../../Core/Application/Interface/Repositories/ITradingOrderRepository';
import { HttpClientFactory } from '../../Infrastructure/Http/HttpClientFactory';
import { EnvironmentConfig } from '../../Infrastructure/Config/EnvironmentConfig';
import { IHttpClient } from '../../Core/Application/Interface/Infrastructure/IHttpClient';
import { PlatformBtcSweepJob } from '../../Infrastructure/Services/bitcoin/PlatformBtcSweepJob';
import { PlatformEthSweepJob } from '../../Infrastructure/Services/ethereum/PlatformEthSweepJob';
import { IEthereumWalletService } from '../../Core/Application/Interface/Services/IEthereumWalletService';
import { IEthereumBlockchainService } from '../../Core/Application/Interface/Services/IEthereumBlockchainService';
import { IEthereumDepositService } from '../../Core/Application/Interface/Services/IEthereumDepositService';

@controller(`/${API_PATH}/admin/platform`)
export class PlatformWalletController extends BaseController {
    private readonly blockcypherClient: IHttpClient;
    private readonly blockstreamClient: IHttpClient;

    constructor(
        @inject(TYPES.WalletService) private readonly walletService: IWalletService,
        @inject(TYPES.BlockchainService) private readonly blockchainService: IBlockchainService,
        @inject(TYPES.BitcoinWebhookService) private readonly bitcoinWebhookService: IBitcoinWebhookService,
        @inject(TYPES.UTXOManagerService) private readonly utxoManagerService: IUTXOManagerService,
        @inject(TYPES.UTXORepository) private readonly utxoRepo: IUTXORepository,
        @inject(TYPES.WalletAccountRepository) private readonly walletAccountRepo: WalletAccountRepository,
        @inject(TYPES.TradingOrderRepository) private readonly tradingOrderRepo: ITradingOrderRepository,
        @inject(TYPES.HttpClientFactory) private readonly httpClientFactory: HttpClientFactory,
        @inject(TYPES.PlatformBtcSweepJob) private readonly platformBtcSweepJob: PlatformBtcSweepJob,
        @inject(TYPES.PlatformEthSweepJob) private readonly platformEthSweepJob: PlatformEthSweepJob,
        @inject(TYPES.EthereumWalletService) private readonly ethereumWalletService: IEthereumWalletService,
        @inject(TYPES.EthereumBlockchainService)
        private readonly ethereumBlockchainService: IEthereumBlockchainService,
        @inject(TYPES.EthereumDepositService) private readonly ethereumDepositService: IEthereumDepositService
    ) {
        super();
        
        // Initialize clients for fetching on-chain UTXOs
        const network = EnvironmentConfig.get('BITCOIN_NETWORK', 'testnet');
        const blockcypherBaseUrl = network === 'mainnet' 
            ? 'https://api.blockcypher.com/v1/btc/main'
            : 'https://api.blockcypher.com/v1/btc/test3';
        const blockstreamBaseUrl = network === 'mainnet'
            ? 'https://blockstream.info/api'
            : 'https://blockstream.info/testnet/api';
        
        this.blockcypherClient = httpClientFactory.createClient({
            baseURL: blockcypherBaseUrl,
            timeout: 30000,
            headers: EnvironmentConfig.get('BLOCKCYPHER_API_KEY', '') 
                ? { 'Authorization': `Bearer ${EnvironmentConfig.get('BLOCKCYPHER_API_KEY', '')}` } 
                : {}
        });
        
        this.blockstreamClient = httpClientFactory.createClient({
            baseURL: blockstreamBaseUrl,
            timeout: 30000,
            headers: {}
        });
    }

    /**
     * Admin: Preview platform BTC sweep plan (dry run)
     * @route GET /api/v1/admin/platform/sweep-btc/preview
     */
    @httpGet('/sweep-btc/preview', AuthMiddleware.authenticateAdmin())
    async previewPlatformBtcSweep(
        @response() res: Response
    ) {
        try {
            const result = await this.platformBtcSweepJob.runNow({ dryRun: true });
            return this.success(res, result, 'Sweep preview generated successfully');
        } catch (error: any) {
            Console.error(error, { message: 'Failed to preview platform BTC sweep' });
            return this.error(res, error.message, error.statusCode || 400);
        }
    }

    /**
     * Admin: Trigger platform BTC sweep immediately (broadcasts transactions)
     * @route POST /api/v1/admin/platform/sweep-btc/run
     */
    @httpPost('/sweep-btc/run', AuthMiddleware.authenticateAdmin())
    async runPlatformBtcSweep(
        @response() res: Response
    ) {
        try {
            const result = await this.platformBtcSweepJob.runNow({ dryRun: false });
            return this.success(res, result, 'BTC sweep triggered successfully');
        } catch (error: any) {
            Console.error(error, { message: 'Failed to run platform BTC sweep' });
            return this.error(res, error.message, error.statusCode || 400);
        }
    }

    /**
     * Admin: Preview platform ETH sweep plan (dry run)
     * @route GET /api/v1/admin/platform/sweep-eth/preview
     */
    @httpGet('/sweep-eth/preview', AuthMiddleware.authenticateAdmin())
    async previewPlatformEthSweep(@response() res: Response) {
        try {
            const result = await this.platformEthSweepJob.runNow({ dryRun: true });
            return this.success(res, result, 'ETH sweep preview generated successfully');
        } catch (error: any) {
            Console.error(error, { message: 'Failed to preview platform ETH sweep' });
            return this.error(res, error.message, error.statusCode || 400);
        }
    }

    /**
     * Admin: Trigger platform ETH sweep immediately
     * @route POST /api/v1/admin/platform/sweep-eth/run
     */
    @httpPost('/sweep-eth/run', AuthMiddleware.authenticateAdmin())
    async runPlatformEthSweep(@response() res: Response) {
        try {
            const result = await this.platformEthSweepJob.runNow({ dryRun: false });
            return this.success(res, result, 'ETH sweep triggered successfully');
        } catch (error: any) {
            Console.error(error, { message: 'Failed to run platform ETH sweep' });
            return this.error(res, error.message, error.statusCode || 400);
        }
    }

    /**
     * Get platform wallet with accounts (admin only)
     * @route GET /api/v1/admin/platform/wallet
     */
    @httpGet('/wallet', AuthMiddleware.authenticateAdmin())
    async getPlatformWallet(
        @request() req: Request,
        @response() res: Response
    ) {
        try {
            const platformWallet = await this.walletService.getPlatformWalletWithAccounts();
            
            if (!platformWallet) {
                return this.error(res, 'Platform wallet not found', 404);
            }

            // Format balances properly to fix display issues
            const formattedAccounts = platformWallet.accounts.map(account => {
                let balance = parseFloat(account.balance?.toString() || '0');
                let availableBalance = parseFloat(account.available_balance?.toString() || '0');
                let lockedBalance = parseFloat(account.locked_balance?.toString() || '0');

                // For BTC accounts, ensure amounts are in BTC (not satoshis)
                if (account.currency?.code === 'BTC') {
                    // If balance is suspiciously large (> 1), it might be in satoshis - convert to BTC
                    if (balance > 1) {
                        balance = balance / 100000000;
                    }
                    if (availableBalance > 1) {
                        availableBalance = availableBalance / 100000000;
                    }
                    if (lockedBalance > 1) {
                        lockedBalance = lockedBalance / 100000000;
                    }
                }

                // Format to proper decimal places based on currency
                const decimals = account.currency?.decimals || 8;
                balance = parseFloat(balance.toFixed(decimals));
                availableBalance = parseFloat(availableBalance.toFixed(decimals));
                lockedBalance = parseFloat(lockedBalance.toFixed(decimals));

                return {
                    ...account,
                    balance: balance.toString(),
                    available_balance: availableBalance.toString(),
                    locked_balance: lockedBalance.toString()
                };
            });

            return this.success(res, {
                wallet: platformWallet.wallet,
                accounts: formattedAccounts
            }, 'Platform wallet retrieved successfully');
        } catch (error: any) {
            console.error('Error getting platform wallet:', error);
            return this.error(res, error.message, error.statusCode || 400);
        }
    }

    /**
     * Generate or return existing platform deposit address for BTC or ETH (admin only).
     * @route POST /api/v1/admin/platform/address
     * @body { "crypto_type": "BTC" | "ETH" }
     */
    @httpPost('/address', AuthMiddleware.authenticateAdmin(), validationMiddleware(GeneratePlatformAddressDTO))
    async generatePlatformAddress(@requestBody() body: GeneratePlatformAddressDTO, @response() res: Response) {
        try {
            const result = await this.walletService.ensurePlatformCryptoAddress(body.crypto_type);
            const label = body.crypto_type === 'BTC' ? 'Bitcoin' : 'Ethereum';
            const message = result.already_existed
                ? `Platform ${label} address already exists`
                : `Platform ${label} address generated successfully`;

            return this.success(
                res,
                {
                    crypto_type: result.crypto_type,
                    address: result.address,
                    already_existed: result.already_existed
                },
                message
            );
        } catch (error: any) {
            console.error('Error generating platform address:', error);
            return this.error(res, error.message, error.statusCode || 400);
        }
    }

    /**
     * @deprecated Use POST /api/v1/admin/platform/address with { "crypto_type": "ETH" }
     * @route POST /api/v1/admin/platform/ethereum/address
     */
    @httpPost('/ethereum/address', AuthMiddleware.authenticateAdmin())
    async ensurePlatformEthereumAddress(@response() res: Response) {
        try {
            const result = await this.walletService.ensurePlatformCryptoAddress('ETH');
            const message = result.already_existed
                ? 'Platform Ethereum address already exists'
                : 'Platform Ethereum address generated successfully';

            return this.success(
                res,
                { crypto_type: 'ETH', address: result.address, already_existed: result.already_existed },
                message
            );
        } catch (error: any) {
            console.error('Error ensuring platform ETH address:', error);
            return this.error(res, error.message, error.statusCode || 400);
        }
    }

    /**
     * Manually sync platform wallet BTC balance from blockchain
     * Checks blockchain for transactions and updates balance
     * @route POST /api/v1/admin/platform/sync-btc-balance
     */
    @httpPost('/sync-btc-balance', AuthMiddleware.authenticateAdmin())
    async syncPlatformBtcBalance(
        @request() req: Request,
        @response() res: Response
    ) {
        try {
            // Get platform wallet
            const platformWallet = await this.walletService.getPlatformWalletWithAccounts();
            
            if (!platformWallet) {
                return this.error(res, 'Platform wallet not found', 404);
            }

            const btcAccount = platformWallet.accounts.find(acc => acc.currency?.code === 'BTC');
            
            if (!btcAccount || !btcAccount.address) {
                return this.error(res, 'Platform BTC address not found', 404);
            }

            const address = btcAccount.address;

            // 1. Get blockchain balance
            const blockchainBalance = await this.blockchainService.getAddressBalance(address);
            
            // 2. Get all incoming transactions
            const incomingTxs = await this.blockchainService.checkAddressForIncomingTransactions(address);
            
            // 3. Process each transaction that hasn't been processed yet
            let processedCount = 0;
            for (const tx of incomingTxs) {
                try {
                    // Process the transaction (this will update balance if confirmed)
                    await this.bitcoinWebhookService.processTransaction(tx, address);
                    processedCount++;
                } catch (error: any) {
                    Console.warn('Failed to process transaction', {
                        txHash: tx.hash || tx.tx_hash,
                        error: error.message
                    });
                }
            }

            // 4. If balance still doesn't match, force update from blockchain
            // This handles cases where transaction was already processed but balance wasn't updated
            const currentAccount = await this.walletAccountRepo.findById(btcAccount._id!);
            const currentBalance = parseFloat(currentAccount?.balance?.toString() || '0');
            
            if (Math.abs(currentBalance - blockchainBalance) > 0.00000001) {
                // Balance mismatch - update directly from blockchain
                Console.info('Balance mismatch detected, updating from blockchain', {
                    current_balance: currentBalance,
                    blockchain_balance: blockchainBalance,
                    difference: blockchainBalance - currentBalance
                });

                // Custodial ledger: set physical on-chain balance for the platform address.
                // NOTE: Do not overwrite user_balance buckets from this sync.
                await this.walletAccountRepo.update(btcAccount._id!, {
                    total_onchain_balance: blockchainBalance
                });
            }

            // 5. Get updated account balance
            const updatedAccount = await this.walletAccountRepo.findById(btcAccount._id!);
            
            return this.success(res, {
                address,
                blockchain_balance: blockchainBalance,
                wallet_balance: updatedAccount?.balance || 0,
                available_balance: updatedAccount?.available_balance || 0,
                transactions_found: incomingTxs.length,
                transactions_processed: processedCount,
                message: 'Balance synced successfully'
            }, 'Platform BTC balance synced successfully');
        } catch (error: any) {
            console.error('Error syncing platform BTC balance:', error);
            return this.error(res, error.message, error.statusCode || 400);
        }
    }

    /**
     * Manually sync platform ETH: pull incoming native transfers from the indexer/RPC path,
     * apply deposits to ledger, and reconcile total_onchain_balance (admin only).
     * Use when webhooks are not wired yet or you want an immediate refresh.
     * @route POST /api/v1/admin/platform/sync-ethereum-balance
     */
    @httpPost('/sync-ethereum-balance', AuthMiddleware.authenticateAdmin())
    async syncPlatformEthereumBalance(@request() req: Request, @response() res: Response) {
        try {
            const platformWallet = await this.walletService.getPlatformWalletWithAccounts();

            if (!platformWallet) {
                return this.error(res, 'Platform wallet not found', 404);
            }

            const ethAccount = platformWallet.accounts.find((acc) => acc.currency?.code === 'ETH');

            if (!ethAccount || !ethAccount.address) {
                return this.error(
                    res,
                    'Platform ETH address not found. Call POST /admin/platform/address with { "crypto_type": "ETH" } first.',
                    404
                );
            }

            const address = ethAccount.address;
            const blockchainBalance = await this.ethereumBlockchainService.getAddressBalance(address);
            const incoming = await this.ethereumBlockchainService.checkAddressForIncomingTransactions(address);

            let processedCount = 0;
            for (const tx of incoming) {
                try {
                    await this.ethereumDepositService.processTransaction(tx, address);
                    processedCount++;
                } catch (error: any) {
                    Console.warn('Failed to process platform ETH transaction', {
                        txHash: tx.hash,
                        error: error.message
                    });
                }
            }

            const currentAccount = await this.walletAccountRepo.findById(ethAccount._id!);
            const currentBalance = parseFloat(currentAccount?.balance?.toString() || '0');

            if (Math.abs(currentBalance - blockchainBalance) > 1e-12) {
                Console.info('Platform ETH ledger vs chain mismatch; updating total_onchain_balance', {
                    address,
                    ledger: currentBalance,
                    chain: blockchainBalance
                });
                await this.walletAccountRepo.update(ethAccount._id!, {
                    total_onchain_balance: blockchainBalance
                });
            }

            const updatedAccount = await this.walletAccountRepo.findById(ethAccount._id!);

            return this.success(
                res,
                {
                    address,
                    blockchain_balance: blockchainBalance,
                    wallet_balance: updatedAccount?.balance || 0,
                    available_balance: updatedAccount?.available_balance || 0,
                    transactions_found: incoming.length,
                    transactions_processed: processedCount,
                    message: 'Platform ETH sync completed'
                },
                'Platform Ethereum balance synced successfully'
            );
        } catch (error: any) {
            Console.error(error, { message: 'Error syncing platform ETH balance' });
            return this.error(res, error.message, error.statusCode ?? 503, error);
        }
    }

    /**
     * Sync UTXOs for platform wallet BTC address
     * Fetches all unspent outputs from blockchain and stores them in database
     * @route POST /api/v1/admin/platform/sync-utxos
     */
    @httpPost('/sync-utxos', AuthMiddleware.authenticateAdmin())
    async syncPlatformUTXOs(
        @request() req: Request,
        @response() res: Response
    ) {
        try {
            // Get platform wallet
            const platformWallet = await this.walletService.getPlatformWalletWithAccounts();
            
            if (!platformWallet) {
                return this.error(res, 'Platform wallet not found', 404);
            }

            const btcAccount = platformWallet.accounts.find(acc => acc.currency?.code === 'BTC');
            
            if (!btcAccount || !btcAccount.address || !btcAccount._id) {
                return this.error(res, 'Platform BTC address not found', 404);
            }

            const address = btcAccount.address;
            const walletAccountId = btcAccount._id;

            // Sync UTXOs from blockchain
            const syncedCount = await this.utxoManagerService.syncUTXOsForAddress(address, walletAccountId);

            // Get updated UTXO count
            const availableUTXOs = await this.utxoManagerService.getAvailableUTXOs(address);
            const totalUTXOs = availableUTXOs.length;

            return this.success(res, {
                address,
                synced_count: syncedCount,
                total_utxos: totalUTXOs,
                available_utxos: totalUTXOs,
                total_amount: availableUTXOs.reduce((sum, utxo) => sum + parseFloat(utxo.amount.toString()), 0),
                message: `Synced ${syncedCount} new UTXOs. Total available: ${totalUTXOs}`
            }, 'Platform UTXOs synced successfully');
        } catch (error: any) {
            console.error('Error syncing platform UTXOs:', error);
            return this.error(res, error.message, error.statusCode || 400);
        }
    }

    /**
     * Get all UTXOs for platform wallet (for debugging)
     * Shows all UTXOs regardless of status
     * @route GET /api/v1/admin/platform/utxos
     */
    @httpGet('/utxos', AuthMiddleware.authenticateAdmin())
    async getPlatformUTXOs(
        @request() req: Request,
        @response() res: Response
    ) {
        try {
            // Get platform wallet
            const platformWallet = await this.walletService.getPlatformWalletWithAccounts();
            
            if (!platformWallet) {
                return this.error(res, 'Platform wallet not found', 404);
            }

            const btcAccount = platformWallet.accounts.find(acc => acc.currency?.code === 'BTC');
            
            if (!btcAccount || !btcAccount.address) {
                return this.error(res, 'Platform BTC address not found', 404);
            }

            const address = btcAccount.address;

            // Get all UTXOs (regardless of status)
            const allUTXOs = await this.utxoRepo.findByAddress(address);
            const availableUTXOs = await this.utxoManagerService.getAvailableUTXOs(address);
            const reservedUTXOs = await this.utxoRepo.findByAddressAndStatus(address, 'reserved');
            const spentUTXOs = await this.utxoRepo.findByAddressAndStatus(address, 'spent');

            return this.success(res, {
                address,
                total_utxos: allUTXOs.length,
                available: {
                    count: availableUTXOs.length,
                    total_amount: availableUTXOs.reduce((sum, utxo) => sum + parseFloat(utxo.amount.toString()), 0),
                    utxos: availableUTXOs.map(u => ({
                        id: u._id,
                        txid: u.txid,
                        vout: u.vout,
                        amount: parseFloat(u.amount.toString()),
                        status: u.status
                    }))
                },
                reserved: {
                    count: reservedUTXOs.length,
                    total_amount: reservedUTXOs.reduce((sum, utxo) => sum + parseFloat(utxo.amount.toString()), 0)
                },
                spent: {
                    count: spentUTXOs.length,
                    total_amount: spentUTXOs.reduce((sum, utxo) => sum + parseFloat(utxo.amount.toString()), 0)
                },
                all_utxos: allUTXOs.map(u => ({
                    id: u._id,
                    txid: u.txid,
                    vout: u.vout,
                    amount: parseFloat(u.amount.toString()),
                    status: u.status,
                    reserved_for_order_id: u.reserved_for_order_id
                }))
            }, 'Platform UTXOs retrieved successfully');
        } catch (error: any) {
            console.error('Error getting platform UTXOs:', error);
            return this.error(res, error.message, error.statusCode || 400);
        }
    }

    /**
     * Get UTXOs for any address (admin only)
     * Shows both database UTXOs and on-chain UTXOs for comparison
     * @route GET /api/v1/admin/platform/utxos/:address
     */
    @httpGet('/utxos/:address', AuthMiddleware.authenticateAdmin())
    async getUTXOsForAddress(
        @requestParam('address') address: string,
        @request() req: Request,
        @response() res: Response
    ) {
        try {
            // Get UTXOs from DATABASE
            const allUTXOs = await this.utxoRepo.findByAddress(address);
            const availableUTXOs = await this.utxoManagerService.getAvailableUTXOs(address);
            const reservedUTXOs = await this.utxoRepo.findByAddressAndStatus(address, 'reserved');
            const spentUTXOs = await this.utxoRepo.findByAddressAndStatus(address, 'spent');

            // Get UTXOs from ON-CHAIN (blockchain) for comparison
            let onChainUTXOs: any[] = [];
            let onChainTotal = 0;
            try {
                let txrefs: any[] = [];
                
                try {
                    // Try BlockCypher first
                    const response = await this.blockcypherClient.get(`/addrs/${address}?unspentOnly=true`) as any;
                    if (response.txrefs && response.txrefs.length > 0) {
                        txrefs = response.txrefs;
                    }
                } catch (blockcypherError: any) {
                    // Fallback to Blockstream
                    try {
                        const blockstreamResponse = await this.blockstreamClient.get(`/address/${address}/utxo`) as any;
                        if (Array.isArray(blockstreamResponse) && blockstreamResponse.length > 0) {
                            txrefs = blockstreamResponse.map((utxo: any) => ({
                                tx_hash: utxo.txid,
                                tx_output_n: utxo.vout,
                                value: utxo.value,
                                confirmations: utxo.status?.block_height ? 1 : 0
                            }));
                        }
                    } catch (blockstreamError: any) {
                        Console.warn('Failed to fetch on-chain UTXOs from both APIs', { 
                            address, 
                            blockcypherError: blockcypherError?.message,
                            blockstreamError: blockstreamError?.message
                        });
                    }
                }
                
                // Convert to our format
                onChainUTXOs = txrefs.map((txref: any) => ({
                    txid: txref.tx_hash || txref.txid,
                    vout: txref.tx_output_n ?? txref.vout,
                    amount: (txref.value || 0) / 100000000, // Convert satoshis to BTC
                    confirmations: txref.confirmations || 0
                }));
                onChainTotal = onChainUTXOs.reduce((sum, utxo) => sum + Number(utxo.amount || 0), 0);
            } catch (onChainError: any) {
                Console.warn('Failed to fetch on-chain UTXOs', { address, error: onChainError.message });
                // Continue without on-chain data
            }

            // Calculate totals
            const availableTotal = availableUTXOs.reduce((sum, utxo) => {
                let amount = parseFloat(utxo.amount.toString());
                if (amount > 1) amount = amount / 100000000; // Convert satoshis to BTC
                return sum + amount;
            }, 0);

            const reservedTotal = reservedUTXOs.reduce((sum, utxo) => {
                let amount = parseFloat(utxo.amount.toString());
                if (amount > 1) amount = amount / 100000000;
                return sum + amount;
            }, 0);

            const spentTotal = spentUTXOs.reduce((sum, utxo) => {
                let amount = parseFloat(utxo.amount.toString());
                if (amount > 1) amount = amount / 100000000;
                return sum + amount;
            }, 0);

            return this.success(res, {
                address,
                database: {
                    total_utxos: allUTXOs.length,
                    available: {
                        count: availableUTXOs.length,
                        total_amount: availableTotal,
                        utxos: availableUTXOs.map(u => ({
                            id: u._id,
                            txid: u.txid,
                            vout: u.vout,
                            amount: parseFloat(u.amount.toString()) > 1 
                                ? parseFloat(u.amount.toString()) / 100000000 
                                : parseFloat(u.amount.toString()),
                            status: u.status
                        }))
                    },
                    reserved: {
                        count: reservedUTXOs.length,
                        total_amount: reservedTotal
                    },
                    spent: {
                        count: spentUTXOs.length,
                        total_amount: spentTotal
                    },
                    all_utxos: allUTXOs.map(u => ({
                        id: u._id,
                        txid: u.txid,
                        vout: u.vout,
                        amount: parseFloat(u.amount.toString()) > 1 
                            ? parseFloat(u.amount.toString()) / 100000000 
                            : parseFloat(u.amount.toString()),
                        status: u.status,
                        reserved_for_order_id: u.reserved_for_order_id
                    }))
                },
                on_chain: {
                    total_utxos: onChainUTXOs.length,
                    total_amount: onChainTotal,
                    utxos: onChainUTXOs,
                    note: onChainUTXOs.length === 0 
                        ? 'No on-chain UTXOs found (may need to sync)' 
                        : 'On-chain UTXOs from blockchain'
                },
                comparison: {
                    database_has_utxos: allUTXOs.length > 0,
                    database_has_available_utxos: availableUTXOs.length > 0,
                    onchain_has_utxos: onChainUTXOs.length > 0,
                    needs_sync: onChainUTXOs.length > 0 && availableUTXOs.length === 0,
                    message: onChainUTXOs.length > 0 && availableUTXOs.length === 0
                        ? 'On-chain UTXOs exist but not in database. Use sync endpoint to add them.'
                        : allUTXOs.length > 0 && availableUTXOs.length === 0
                        ? `Database has ${allUTXOs.length} UTXO(s), but none are spendable (likely all reserved/spent).`
                        : onChainUTXOs.length === 0 && availableUTXOs.length === 0
                        ? 'No UTXOs found on-chain or in database'
                        : 'UTXOs are synced'
                }
            }, 'UTXOs retrieved successfully');
        } catch (error: any) {
            Console.error(error, { message: 'Failed to get UTXOs for address', address });
            return this.error(res, error.message, error.statusCode || 400);
        }
    }

    /**
     * Sync UTXOs for any address (admin only)
     * Useful for syncing user addresses that received BTC
     * @route POST /api/v1/admin/platform/sync-utxos/:address
     */
    @httpPost('/sync-utxos/:address', AuthMiddleware.authenticateAdmin())
    async syncUTXOsForAddress(
        @requestParam('address') address: string,
        @request() req: Request,
        @response() res: Response
    ) {
        try {
            // Find wallet account for this address
            const walletAccount = await this.walletAccountRepo.findByAddress(address);
            const walletAccountId = walletAccount?._id;

            // Sync UTXOs from blockchain
            const syncedCount = await this.utxoManagerService.syncUTXOsForAddress(address, walletAccountId);

            // Get updated UTXO count
            const availableUTXOs = await this.utxoManagerService.getAvailableUTXOs(address);
            const totalUTXOs = availableUTXOs.length;
            const totalAmount = availableUTXOs.reduce((sum, utxo) => {
                let amount = parseFloat(utxo.amount.toString());
                if (amount > 1) amount = amount / 100000000; // Convert satoshis to BTC
                return sum + amount;
            }, 0);

            return this.success(res, {
                address,
                wallet_account_id: walletAccountId,
                synced_count: syncedCount,
                total_utxos: totalUTXOs,
                available_utxos: totalUTXOs,
                total_amount: totalAmount,
                message: `Synced ${syncedCount} new UTXOs. Total available: ${totalUTXOs}`
            }, 'UTXOs synced successfully');
        } catch (error: any) {
            Console.error(error, { message: 'Failed to sync UTXOs for address', address });
            return this.error(res, error.message, error.statusCode || 400);
        }
    }

    /**
     * Manually create UTXO from transaction hash
     * Useful when BlockCypher API doesn't return UTXOs but they exist on blockchain
     * @route POST /api/v1/admin/platform/create-utxo-from-tx
     */
    @httpPost('/create-utxo-from-tx', AuthMiddleware.authenticateAdmin(), validationMiddleware(CreateUTXOFromTxDTO))
    async createUTXOFromTransaction(
        @requestBody() dto: CreateUTXOFromTxDTO,
        @response() res: Response
    ) {
        try {
            // Get platform wallet
            const platformWallet = await this.walletService.getPlatformWalletWithAccounts();
            
            if (!platformWallet) {
                return this.error(res, 'Platform wallet not found', 404);
            }

            const btcAccount = platformWallet.accounts.find(acc => acc.currency?.code === 'BTC');
            
            if (!btcAccount || !btcAccount.address || !btcAccount._id) {
                return this.error(res, 'Platform BTC address not found', 404);
            }

            const platformAddress = btcAccount.address;
            const walletAccountId = btcAccount._id;

            // Use provided address or default to platform address
            const targetAddress = dto.address || platformAddress;

            // Create UTXO from transaction
            const utxo = await this.utxoManagerService.createUTXOFromTransaction(
                dto.tx_hash,
                dto.vout,
                targetAddress,
                walletAccountId
            );

            // Ensure amount is properly formatted as BTC (not satoshis)
            const amountValue = parseFloat(utxo.amount.toString());
            // If amount seems too large (likely stored as satoshis), convert it
            const amountInBTC = amountValue > 1 ? amountValue / 100000000 : amountValue;
            
            return this.success(res, {
                utxo: {
                    id: utxo._id,
                    txid: utxo.txid,
                    vout: utxo.vout,
                    amount: parseFloat(amountInBTC.toFixed(8)), // Ensure proper decimal formatting
                    address: utxo.address,
                    status: utxo.status
                },
                message: 'UTXO created successfully'
            }, 'UTXO created from transaction successfully');
        } catch (error: any) {
            console.error('Error creating UTXO from transaction:', error);
            return this.error(res, error.message, error.statusCode || 400);
        }
    }

    /**
     * Manually store change UTXO from a transaction
     * Automatically finds the change output (output going back to platform address) and stores it
     * @route POST /api/v1/admin/platform/store-change-utxo
     */
    @httpPost('/store-change-utxo', AuthMiddleware.authenticateAdmin(), validationMiddleware(StoreChangeUTXODTO))
    async storeChangeUTXO(
        @requestBody() dto: StoreChangeUTXODTO,
        @response() res: Response
    ) {
        try {
            // Get platform wallet
            const platformWallet = await this.walletService.getPlatformWalletWithAccounts();
            
            if (!platformWallet) {
                return this.error(res, 'Platform wallet not found', 404);
            }

            const btcAccount = platformWallet.accounts.find(acc => acc.currency?.code === 'BTC');
            
            if (!btcAccount || !btcAccount.address || !btcAccount._id) {
                return this.error(res, 'Platform BTC address not found', 404);
            }

            const platformAddress = btcAccount.address;
            const walletAccountId = btcAccount._id;

            // Use provided address or default to platform address
            const targetAddress = dto.address || platformAddress;

            // Store change UTXO (automatically finds the change output)
            const changeUTXO = await this.utxoManagerService.storeChangeUTXO(
                dto.tx_hash,
                targetAddress,
                walletAccountId
            );

            if (!changeUTXO) {
                return this.error(res, 'No change output found for this transaction and address', 404);
            }

            // Ensure amount is properly formatted as BTC
            const amountValue = parseFloat(changeUTXO.amount.toString());
            const amountInBTC = amountValue > 1 ? amountValue / 100000000 : amountValue;
            
            return this.success(res, {
                utxo: {
                    id: changeUTXO._id,
                    txid: changeUTXO.txid,
                    vout: changeUTXO.vout,
                    amount: parseFloat(amountInBTC.toFixed(8)),
                    address: changeUTXO.address,
                    status: changeUTXO.status
                },
                message: 'Change UTXO stored successfully'
            }, 'Change UTXO stored successfully');
        } catch (error: any) {
            console.error('Error storing change UTXO:', error);
            return this.error(res, error.message, error.statusCode || 400);
        }
    }

    /**
     * Recalculate and fix platform NGN balance from transaction history
     * Also fixes negative locked balances for all users
     * Sums all completed buy orders (platform receives NGN) and subtracts completed sell orders (platform pays NGN)
     * @route POST /api/v1/admin/platform/recalculate-ngn-balance
     */
    @httpPost('/recalculate-ngn-balance', AuthMiddleware.authenticateAdmin())
    async recalculateNgnBalance(
        @request() req: Request,
        @response() res: Response
    ) {
        try {
            // Get platform wallet
            const platformWallet = await this.walletService.getPlatformWalletWithAccounts();
            
            if (!platformWallet) {
                return this.error(res, 'Platform wallet not found', 404);
            }

            const ngnAccount = platformWallet.accounts.find(acc => acc.currency?.code === 'NGN');
            
            if (!ngnAccount || !ngnAccount._id) {
                return this.error(res, 'Platform NGN account not found', 404);
            }

            // Get all completed buy orders (platform receives NGN)
            const completedBuyOrders = await this.tradingOrderRepo.findByStatus('completed', 10000);
            const buyOrders = completedBuyOrders.filter(order => order.type === 'buy');
            
            // Get all completed sell orders (platform pays NGN)
            const sellOrders = completedBuyOrders.filter(order => order.type === 'sell');

            // Calculate correct balance
            const totalReceived = buyOrders.reduce((sum, order) => {
                const amount = parseFloat(order.fiat_amount?.toString() || '0');
                return sum + amount;
            }, 0);

            const totalPaid = sellOrders.reduce((sum, order) => {
                const amount = parseFloat(order.fiat_amount?.toString() || '0');
                return sum + amount;
            }, 0);

            const correctBalance = totalReceived - totalPaid;

            // Get current (possibly corrupted) balance
            const currentBalance = parseFloat(ngnAccount.balance?.toString() || '0');
            const currentAvailable = parseFloat(ngnAccount.available_balance?.toString() || '0');

            // Update to correct balance
            await this.walletAccountRepo.updateBalance(
                ngnAccount._id,
                correctBalance,
                correctBalance,
                parseFloat(ngnAccount.locked_balance?.toString() || '0')
            );

            // Fix negative locked balances for all users
            const allAccounts = await this.walletAccountRepo.findAll();
            const accountsWithNegativeLocked = allAccounts.filter(acc => {
                const locked = parseFloat(acc.locked_balance?.toString() || '0');
                return locked < 0;
            });

            let fixedAccounts = 0;
            const fixedAccountsDetails: Array<{ 
                accountId: string; 
                previousLocked: number; 
                previousBalance: number;
                newLocked: number;
                newBalance: number;
                balanceAdjustment: number;
            }> = [];

            for (const account of accountsWithNegativeLocked) {
                const currentLocked = parseFloat(account.locked_balance?.toString() || '0');
                const currentAvailable = parseFloat(account.available_balance?.toString() || '0');
                const currentBalance = parseFloat(account.balance?.toString() || '0');

                // Fix: Set locked to 0, add the negative amount back to both balance and available
                // This corrects the over-unlocking and ensures: balance = available_balance + locked_balance
                const negativeAmount = Math.abs(currentLocked); // e.g., -10200 becomes 10200
                const newLocked = 0;
                const newBalance = currentBalance + negativeAmount; // Add back the over-debited amount
                const newAvailable = newBalance; // Since locked = 0, available = balance

                await this.walletAccountRepo.updateBalance(
                    account._id!,
                    newBalance, // Balance increases by the negative locked amount
                    newAvailable, // Available = balance (since locked = 0)
                    newLocked // Locked becomes 0
                );

                fixedAccounts++;
                fixedAccountsDetails.push({
                    accountId: account._id!,
                    previousLocked: currentLocked,
                    previousBalance: currentBalance,
                    newLocked: 0,
                    newBalance: newBalance,
                    balanceAdjustment: negativeAmount
                });

                Console.info('Fixed negative locked balance and corrected balance', {
                    accountId: account._id,
                    walletId: account.wallet_id,
                    previousLocked: currentLocked,
                    previousBalance: currentBalance,
                    newLocked: 0,
                    newBalance: newBalance,
                    balanceAdjustment: negativeAmount
                });
            }

            return this.success(res, {
                platform_ngn: {
                    previous_balance: currentBalance,
                    previous_available: currentAvailable,
                    correct_balance: correctBalance,
                    total_received_from_buy_orders: totalReceived,
                    total_paid_for_sell_orders: totalPaid,
                    buy_orders_count: buyOrders.length,
                    sell_orders_count: sellOrders.length,
                    difference: correctBalance - currentBalance
                },
                negative_locked_balances: {
                    found: accountsWithNegativeLocked.length,
                    fixed: fixedAccounts,
                    details: fixedAccountsDetails
                }
            }, 'Platform NGN balance recalculated and negative locked balances fixed successfully');
        } catch (error: any) {
            console.error('Error recalculating platform NGN balance:', error);
            return this.error(res, error.message, error.statusCode || 400);
        }
    }

    /**
     * Admin: total platform-owned BTC sitting across user addresses (sellable assets).
     * Safety rule: Admin operations MUST NOT spend user_balance; only platform_owned_balance is sellable.
     * @route GET /api/v1/admin/platform/btc-sellable-assets
     */
    @httpGet('/btc-sellable-assets', AuthMiddleware.authenticateAdmin())
    async getTotalSellableBtcAssets(
        @response() res: Response
    ) {
        try {
            const total = await this.walletAccountRepo.sumPlatformOwnedByCurrencyCode('BTC');
            return this.success(res, {
                currency: 'BTC',
                total_sellable_assets: total
            }, 'Total sellable BTC assets retrieved successfully');
        } catch (error: any) {
            Console.error(error, { message: 'Failed to get total sellable BTC assets' });
            return this.error(res, error.message, error.statusCode || 400);
        }
    }
}

