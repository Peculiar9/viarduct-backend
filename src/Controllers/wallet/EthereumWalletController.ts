import { Request, Response } from 'express';
import { inject } from 'inversify';
import { controller, httpGet, httpPost, request, response } from 'inversify-express-utils';
import { API_PATH, TYPES } from '../../Core/Types/Constants';
import { IWalletService } from '../../Core/Application/Interface/Services/IWalletService';
import { IEthereumBlockchainService } from '../../Core/Application/Interface/Services/IEthereumBlockchainService';
import { IEthereumDepositService } from '../../Core/Application/Interface/Services/IEthereumDepositService';
import { WalletAccountRepository } from '../../Infrastructure/Repository/SQL/wallet/WalletAccountRepository';
import { EthereumTransactionRepository } from '../../Infrastructure/Repository/SQL/ethereum/EthereumTransactionRepository';
import AuthMiddleware from '../../Middleware/AuthMiddleware';
import { BaseController } from '../BaseController';
import { IUser } from '../../Core/Application/Interface/Entities/auth-and-user/IUser';
import { Console } from '../../Infrastructure/Utils/Console';

@controller(`/${API_PATH}/wallet`)
export class EthereumWalletController extends BaseController {
    constructor(
        @inject(TYPES.WalletService) private readonly walletService: IWalletService,
        @inject(TYPES.EthereumBlockchainService)
        private readonly ethereumBlockchainService: IEthereumBlockchainService,
        @inject(TYPES.EthereumDepositService) private readonly ethereumDepositService: IEthereumDepositService,
        @inject(TYPES.WalletAccountRepository) private readonly walletAccountRepo: WalletAccountRepository,
        @inject(TYPES.EthereumTransactionRepository)
        private readonly ethereumTransactionRepo: EthereumTransactionRepository
    ) {
        super();
    }

    /**
     * Get or generate Ethereum deposit address for the authenticated user.
     * @route GET /api/v1/wallet/ethereum/address
     */
    @httpGet('/ethereum/address', AuthMiddleware.authenticate())
    async getEthereumAddress(@request() req: Request, @response() res: Response) {
        try {
            const user = req.user as IUser;
            if (!user._id) {
                return this.error(res, 'User not authenticated', 401);
            }

            const address = await this.walletService.generateEthereumAddress(user._id);
            return this.success(res, { address }, 'Ethereum address retrieved successfully');
        } catch (error: any) {
            console.error('Error getting Ethereum address:', error);
            return this.error(res, error.message, error.statusCode || 400);
        }
    }

    /**
     * Sync ETH balance / apply pending incoming native transfers (polling path; no webhooks required).
     * @route POST /api/v1/wallet/ethereum/sync-balance
     */
    @httpPost('/ethereum/sync-balance', AuthMiddleware.authenticate())
    async syncEthBalance(@request() req: Request, @response() res: Response) {
        try {
            const user = req.user as IUser;
            if (!user._id) {
                return this.error(res, 'User not authenticated', 401);
            }

            const userWallet = await this.walletService.getUserWalletWithAccounts(user._id);
            if (!userWallet) {
                return this.error(res, 'User wallet not found', 404);
            }

            const ethAccount = userWallet.accounts.find((acc) => acc.currency?.code === 'ETH');
            if (!ethAccount || !ethAccount.address) {
                return this.error(res, 'ETH address not found. Generate an Ethereum address first.', 404);
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
                    Console.warn('Failed to process ETH transaction', {
                        txHash: tx.hash,
                        error: error.message
                    });
                }
            }

            const currentAccount = await this.walletAccountRepo.findById(ethAccount._id!);
            const currentBalance = parseFloat(currentAccount?.balance?.toString() || '0');

            if (Math.abs(currentBalance - blockchainBalance) > 1e-12) {
                Console.info('ETH on-chain vs ledger mismatch; updating total_onchain_balance', {
                    userId: user._id,
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
                    message: 'Balance synced successfully'
                },
                'ETH balance synced successfully'
            );
        } catch (error: any) {
            Console.error(error, { message: 'Error syncing user ETH balance', userId: (req.user as IUser)?._id });
            return this.error(res, error.message, error.statusCode || 400);
        }
    }

    /**
     * @route GET /api/v1/wallet/ethereum/transactions?limit=50&offset=0
     */
    @httpGet('/ethereum/transactions', AuthMiddleware.authenticate())
    async getEthereumTransactions(@request() req: Request, @response() res: Response) {
        try {
            const user = req.user as IUser;
            if (!user._id) {
                return this.error(res, 'User not authenticated', 401);
            }

            const limit = req.query.limit ? Math.min(200, Math.max(1, parseInt(String(req.query.limit), 10))) : 50;
            const offset = req.query.offset ? Math.max(0, parseInt(String(req.query.offset), 10)) : 0;

            const userWallet = await this.walletService.getUserWalletWithAccounts(user._id);
            if (!userWallet) {
                return this.error(res, 'User wallet not found', 404);
            }

            const ethAccount = userWallet.accounts.find((acc) => acc.currency?.code === 'ETH');
            if (!ethAccount || !ethAccount._id) {
                return this.error(res, 'ETH wallet account not found', 404);
            }

            const txs = await this.ethereumTransactionRepo.findByWalletAccountId(ethAccount._id, limit, offset);
            const mapped = txs.map((tx) => ({
                ...tx,
                type: tx.direction === 'incoming' ? 'deposit' : 'withdrawal'
            }));

            return this.success(
                res,
                {
                    wallet_account_id: ethAccount._id,
                    address: ethAccount.address,
                    limit,
                    offset,
                    transactions: mapped
                },
                'Ethereum transactions retrieved successfully'
            );
        } catch (error: any) {
            Console.error(error, { message: 'Error getting user ethereum transactions', userId: (req.user as IUser)?._id });
            return this.error(res, error.message, error.statusCode || 400);
        }
    }
}
