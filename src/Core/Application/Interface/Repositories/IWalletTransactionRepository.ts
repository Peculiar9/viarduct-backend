import { IWalletTransaction } from '../Entities/wallet/IWalletTransaction';

export interface IWalletTransactionRepository {
    create(entity: Partial<IWalletTransaction>): Promise<IWalletTransaction>;
    findByIncomingTxHash(txHash: string): Promise<IWalletTransaction | null>;
    lockByIncomingTxHash(txHash: string): Promise<IWalletTransaction | null>;
    update(id: string, entity: Partial<IWalletTransaction>): Promise<IWalletTransaction | null>;
    sumPendingWithdrawals(cryptoType: 'BTC' | 'ETH'): Promise<number>;
}
