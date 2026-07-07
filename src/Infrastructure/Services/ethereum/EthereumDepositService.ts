import { inject, injectable } from 'inversify';
import { TYPES } from '../../../Core/Types/Constants';
import { IEthereumDepositService } from '../../../Core/Application/Interface/Services/IEthereumDepositService';
import { ITradeIntentRepository } from '../../../Core/Application/Interface/Repositories/ITradeIntentRepository';
import { ITradeIntentService } from '../../../Core/Application/Interface/Services/ITradeIntentService';
import { EthereumTransactionRepository } from '../../Repository/SQL/ethereum/EthereumTransactionRepository';
import { WalletAccountRepository } from '../../Repository/SQL/wallet/WalletAccountRepository';
import { EnvironmentConfig } from '../../Config/EnvironmentConfig';
import { Console } from '../../Utils/Console';
import { DIContainer } from '../../../Core/DIContainer';

@injectable()
export class EthereumDepositService implements IEthereumDepositService {
    constructor(
        @inject(TYPES.EthereumTransactionRepository)
        private readonly ethereumTransactionRepo: EthereumTransactionRepository,
        @inject(TYPES.WalletAccountRepository) private readonly walletAccountRepo: WalletAccountRepository,
        @inject(TYPES.TradeIntentRepository) private readonly tradeIntentRepo: ITradeIntentRepository
    ) {}

    private getTradeIntentService(): ITradeIntentService {
        return DIContainer.getInstance().get<ITradeIntentService>(TYPES.TradeIntentService);
    }

    async processTransaction(
        tx: {
            hash: string;
            valueEth: number;
            confirmations: number;
            block_time?: string;
            raw?: Record<string, unknown>;
        },
        address: string
    ): Promise<void> {
        const existing = await this.ethereumTransactionRepo.findByTxHash(tx.hash);
        if (existing) {
            const newStatus = tx.confirmations >= 1 ? 'confirmed' : 'pending';
            if (tx.confirmations !== undefined && tx.confirmations > (existing.confirmations || 0)) {
                await this.ethereumTransactionRepo.update(existing._id!, {
                    confirmations: tx.confirmations,
                    status: newStatus
                });

                if (
                    existing.wallet_account_id &&
                    newStatus === 'confirmed' &&
                    existing.status !== 'confirmed'
                ) {
                    const account = await this.walletAccountRepo.findById(existing.wallet_account_id);
                    if (account) {
                        const currentUserBalance = parseFloat(
                            (account.user_balance ?? account.balance ?? 0).toString()
                        );
                        const currentPlatformOwned = parseFloat((account.platform_owned_balance ?? 0).toString());
                        const currentTotalOnchain = parseFloat((account.total_onchain_balance ?? 0).toString());
                        const locked = parseFloat((account.locked_balance ?? 0).toString());

                        const newUserBalance = currentUserBalance + Number(existing.amount || 0);
                        const newTotalOnchain = currentTotalOnchain + Number(existing.amount || 0);
                        const newAvailable = Math.max(0, newUserBalance - locked);

                        await this.walletAccountRepo.update(existing.wallet_account_id, {
                            user_balance: newUserBalance,
                            platform_owned_balance: currentPlatformOwned,
                            total_onchain_balance: newTotalOnchain,
                            balance: newUserBalance,
                            available_balance: newAvailable
                        });

                        Console.info('ETH wallet credited after confirmation', {
                            wallet_account_id: existing.wallet_account_id,
                            amount: existing.amount
                        });
                    }
                }
            }
            return;
        }

        const amount = tx.valueEth;
        if (!amount || amount <= 0) {
            Console.warn('ETH deposit amount missing', { address, hash: tx.hash });
            return;
        }

        const tradeIntent = await this.tradeIntentRepo.findByDepositAddress(address);
        if (tradeIntent) {
            if (tx.confirmations >= 1) {
                await this.getTradeIntentService().handleIncomingCryptoDeposit({
                    address,
                    txHash: tx.hash,
                    amountCrypto: amount,
                    asset: 'ETH'
                });
            }
            await this.ethereumTransactionRepo.create({
                tx_hash: tx.hash,
                address,
                wallet_account_id: undefined,
                amount,
                confirmations: tx.confirmations || 0,
                status: (tx.confirmations || 0) >= 1 ? 'confirmed' : 'pending',
                direction: 'incoming',
                webhook_data: { ...tx.raw, trade_intent_id: tradeIntent._id },
                block_time: tx.block_time,
                metadata: {
                    network: EnvironmentConfig.get('ETHEREUM_NETWORK', 'sepolia'),
                    trade_intent_id: tradeIntent._id
                },
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            });
            Console.info('ETH deposit routed to trade intent', { intentId: tradeIntent._id, amount });
            return;
        }

        const walletAccount = await this.walletAccountRepo.findByAddress(address);

        const row = await this.ethereumTransactionRepo.create({
            tx_hash: tx.hash,
            address,
            wallet_account_id: walletAccount?._id,
            amount,
            confirmations: tx.confirmations || 0,
            status: (tx.confirmations || 0) >= 1 ? 'confirmed' : 'pending',
            direction: 'incoming',
            webhook_data: tx.raw,
            block_time: tx.block_time,
            metadata: {
                network: EnvironmentConfig.get('ETHEREUM_NETWORK', 'sepolia')
            },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        });

        Console.info('Ethereum transaction recorded', {
            tx_hash: row.tx_hash,
            amount,
            address,
            wallet_account_id: walletAccount?._id
        });

        if (walletAccount && row.status === 'confirmed') {
            const currentUserBalance = parseFloat(
                (walletAccount.user_balance ?? walletAccount.balance ?? 0).toString()
            );
            const currentPlatformOwned = parseFloat((walletAccount.platform_owned_balance ?? 0).toString());
            const currentTotalOnchain = parseFloat((walletAccount.total_onchain_balance ?? 0).toString());
            const locked = parseFloat((walletAccount.locked_balance ?? 0).toString());

            const newUserBalance = currentUserBalance + amount;
            const newTotalOnchain = currentTotalOnchain + amount;
            const newAvailable = Math.max(0, newUserBalance - locked);

            await this.walletAccountRepo.update(walletAccount._id!, {
                user_balance: newUserBalance,
                platform_owned_balance: currentPlatformOwned,
                total_onchain_balance: newTotalOnchain,
                balance: newUserBalance,
                available_balance: newAvailable
            });

            Console.info('ETH wallet credited on confirmed deposit', {
                wallet_account_id: walletAccount._id,
                amount
            });
        }
    }
}
