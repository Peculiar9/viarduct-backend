import { inject, injectable } from 'inversify';
import { TYPES } from '../../../Core/Types/Constants';
import {
    ISolvencyService,
    SolvencyPurpose,
    SolvencySnapshot
} from '../../../Core/Application/Interface/Services/ISolvencyService';
import { SolvencyError, ServiceError } from '../../../Core/Application/Error/AppError';
import { UserRepository } from '../../Repository/SQL/users/UserRepository';
import { ITradeIntentRepository } from '../../../Core/Application/Interface/Repositories/ITradeIntentRepository';
import { IWalletTransactionRepository } from '../../../Core/Application/Interface/Repositories/IWalletTransactionRepository';
import { Thresh0ldApiClient } from '../custody/thresh0ld/Thresh0ldApiClient';
import { WalletRepository } from '../../Repository/SQL/wallet/WalletRepository';
import { WalletAccountRepository } from '../../Repository/SQL/wallet/WalletAccountRepository';
import { CurrencyRepository } from '../../Repository/SQL/wallet/CurrencyRepository';
import { EnvironmentConfig } from '../../Config/EnvironmentConfig';
import { Console } from '../../Utils/Console';

const ADMIN_BLOCK_MESSAGE =
    'Operation blocked: Insufficient treasury free float to execute outbound transfer without dipping into user liabilities.';

const USER_BLOCK_MESSAGE =
    'Operation blocked: Hot wallet balance is below total user liabilities; outbound transfer cannot be completed safely.';

const EPS = 1e-12;

@injectable()
export class SolvencyService implements ISolvencyService {
    constructor(
        @inject(TYPES.UserRepository) private readonly userRepository: UserRepository,
        @inject(TYPES.TradeIntentRepository) private readonly tradeIntentRepo: ITradeIntentRepository,
        @inject(TYPES.WalletTransactionRepository)
        private readonly walletTransactionRepo: IWalletTransactionRepository,
        @inject(TYPES.Thresh0ldApiClient) private readonly thresh0ldApiClient: Thresh0ldApiClient,
        @inject(TYPES.WalletRepository) private readonly walletRepository: WalletRepository,
        @inject(TYPES.WalletAccountRepository) private readonly walletAccountRepo: WalletAccountRepository,
        @inject(TYPES.CurrencyRepository) private readonly currencyRepository: CurrencyRepository
    ) {}

    async assertPlatformSolvent(
        cryptoType: 'BTC' | 'ETH',
        amountToSend: number,
        purpose: SolvencyPurpose = 'admin'
    ): Promise<SolvencySnapshot> {
        const amount = Number(amountToSend);
        if (!Number.isFinite(amount) || !(amount > 0)) {
            throw new ServiceError('Solvency check requires a positive amountToSend');
        }

        const [onChainHotWalletBalance, totalUserLiabilities, pendingBuy, pendingWithdraw] =
            await Promise.all([
                this.getOnChainHotWalletBalance(cryptoType),
                this.userRepository.sumCryptoBalance(cryptoType),
                this.tradeIntentRepo.sumPendingBuyPayouts(cryptoType),
                this.walletTransactionRepo.sumPendingWithdrawals(cryptoType)
            ]);

        const pendingPayouts = pendingBuy + pendingWithdraw;
        const reserved = totalUserLiabilities + pendingPayouts;
        const freeFloat = onChainHotWalletBalance - reserved;

        const snapshot: SolvencySnapshot = {
            crypto_type: cryptoType,
            on_chain_hot_wallet_balance: onChainHotWalletBalance,
            total_user_liabilities: totalUserLiabilities,
            pending_payouts: pendingPayouts,
            free_float: freeFloat,
            amount_to_send: amount
        };

        Console.info('Solvency snapshot', snapshot);

        if (purpose === 'user') {
            if (onChainHotWalletBalance + EPS < reserved) {
                throw new SolvencyError(USER_BLOCK_MESSAGE);
            }
            return snapshot;
        }

        if (amount > freeFloat + EPS) {
            throw new SolvencyError(ADMIN_BLOCK_MESSAGE);
        }
        return snapshot;
    }

    private async getOnChainHotWalletBalance(cryptoType: 'BTC' | 'ETH'): Promise<number> {
        const provider = EnvironmentConfig.get('CUSTODY_PROVIDER', 'inhouse').toLowerCase().trim();
        if (provider === 'thresh0ld') {
            return this.thresh0ldApiClient.getWalletBalance(cryptoType.toLowerCase());
        }

        const platformWallet = await this.walletRepository.findPlatformWallet();
        if (!platformWallet?._id) {
            throw new ServiceError('Platform wallet not found for solvency check');
        }
        const currency = await this.currencyRepository.findByCode(cryptoType);
        if (!currency?._id) {
            throw new ServiceError(`${cryptoType} currency not found for solvency check`);
        }
        const account = await this.walletAccountRepo.findByWalletIdAndCurrencyId(
            platformWallet._id,
            currency._id
        );
        return Number(parseFloat(String(account?.total_onchain_balance ?? account?.balance ?? 0)));
    }
}
