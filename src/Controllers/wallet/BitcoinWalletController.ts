import { Request, Response } from 'express';
import { inject } from 'inversify';
import { controller, httpGet, httpPost, request, response } from 'inversify-express-utils';
import { API_PATH, TYPES } from '../../Core/Types/Constants';
import { IWalletService } from '../../Core/Application/Interface/Services/IWalletService';
import { IBlockchainService } from '../../Core/Application/Interface/Services/IBlockchainService';
import { IBitcoinWebhookService } from '../../Core/Application/Interface/Services/IBitcoinWebhookService';
import { WalletAccountRepository } from '../../Infrastructure/Repository/SQL/wallet/WalletAccountRepository';
import AuthMiddleware from '../../Middleware/AuthMiddleware';
import { BaseController } from '../BaseController';
import { IUser } from '../../Core/Application/Interface/Entities/auth-and-user/IUser';
import { Console } from '../../Infrastructure/Utils/Console';

@controller(`/${API_PATH}/wallet`)
export class BitcoinWalletController extends BaseController {
    constructor(
        @inject(TYPES.WalletService) private readonly walletService: IWalletService,
        @inject(TYPES.BlockchainService) private readonly blockchainService: IBlockchainService,
        @inject(TYPES.BitcoinWebhookService) private readonly bitcoinWebhookService: IBitcoinWebhookService,
        @inject(TYPES.WalletAccountRepository) private readonly walletAccountRepo: WalletAccountRepository
    ) {
        super();
    }

    /**
     * Get or generate Bitcoin address for authenticated user
     * @route GET /api/v1/wallet/bitcoin/address
     */
    @httpGet('/bitcoin/address', AuthMiddleware.authenticate())
    async getBitcoinAddress(
        @request() req: Request,
        @response() res: Response
    ) {
        try {
            const user = req.user as IUser;
            if (!user._id) {
                return this.error(res, 'User not authenticated', 401);
            }

            const address = await this.walletService.generateBitcoinAddress(user._id);
            
            return this.success(res, { address }, 'Bitcoin address retrieved successfully');
        } catch (error: any) {
            console.error('Error getting Bitcoin address:', error);
            return this.error(res, error.message, error.statusCode || 400);
        }
    }

    /**
     * Manually sync user's BTC balance from blockchain
     * Checks blockchain for transactions and updates balance
     * Useful when webhook or background job didn't catch the transaction
     * @route POST /api/v1/wallet/bitcoin/sync-balance
     */
    @httpPost('/bitcoin/sync-balance', AuthMiddleware.authenticate())
    async syncBtcBalance(
        @request() req: Request,
        @response() res: Response
    ) {
        try {
            const user = req.user as IUser;
            if (!user._id) {
                return this.error(res, 'User not authenticated', 401);
            }

            // Get user's wallet
            const userWallet = await this.walletService.getUserWalletWithAccounts(user._id);
            
            if (!userWallet) {
                return this.error(res, 'User wallet not found', 404);
            }

            const btcAccount = userWallet.accounts.find(acc => acc.currency?.code === 'BTC');
            
            if (!btcAccount || !btcAccount.address) {
                return this.error(res, 'BTC address not found. Please generate a Bitcoin address first.', 404);
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
                    userId: user._id,
                    address,
                    current_balance: currentBalance,
                    blockchain_balance: blockchainBalance,
                    difference: blockchainBalance - currentBalance
                });
                
                await this.walletAccountRepo.updateBalance(
                    btcAccount._id!,
                    blockchainBalance,
                    blockchainBalance,
                    parseFloat(currentAccount?.locked_balance?.toString() || '0')
                );
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
            }, 'BTC balance synced successfully');
        } catch (error: any) {
            Console.error(error, { message: 'Error syncing user BTC balance', userId: (req.user as IUser)?._id });
            return this.error(res, error.message, error.statusCode || 400);
        }
    }
}

