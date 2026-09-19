import { ITradeIntent, TradeIntentStatus, TradeIntentType } from '../Entities/trading/ITradeIntent';

export interface ITradeIntentRepository {
    findById(id: string): Promise<ITradeIntent | null>;
    findAll(): Promise<ITradeIntent[]>;
    findByCondition(condition: Partial<ITradeIntent>): Promise<ITradeIntent[]>;
    create(entity: Partial<ITradeIntent>): Promise<ITradeIntent>;
    update(id: string, entity: Partial<ITradeIntent>): Promise<ITradeIntent | null>;
    delete(id: string): Promise<boolean>;
    executeRawQuery(query: string, params: any[]): Promise<any>;
    count(condition?: Partial<ITradeIntent>): Promise<number>;
    bulkCreate(entities: Partial<ITradeIntent>[]): Promise<ITradeIntent[]>;
    bulkUpdate(entities: Partial<ITradeIntent>[]): Promise<ITradeIntent[]>;
    bulkDelete(ids: string[]): Promise<number>;

    findByUserId(userId: string, limit?: number, offset?: number): Promise<ITradeIntent[]>;
    findByDepositAddress(address: string): Promise<ITradeIntent | null>;
    findByIncomingTxHash(txHash: string): Promise<ITradeIntent | null>;
    findWithFilters(filters: {
        status?: TradeIntentStatus;
        type?: TradeIntentType;
        crypto_type?: string;
        user_id?: string;
        date_from?: string;
        date_to?: string;
        limit?: number;
        offset?: number;
    }): Promise<ITradeIntent[]>;
    countWithFilters(filters: {
        status?: TradeIntentStatus;
        type?: TradeIntentType;
        crypto_type?: string;
        user_id?: string;
        date_from?: string;
        date_to?: string;
    }): Promise<number>;
    findSellIntentsReadyForSweep(limit?: number): Promise<ITradeIntent[]>;

    /** Highest parsed `deposit_derivation_path` index for sell intents of this asset (null if none). */
    findMaxDepositDerivationIndex(cryptoType: string): Promise<number | null>;

    /** Count sell intents that already use this exact derivation path for the asset. */
    countWithDerivationPath(derivationPath: string, cryptoType: string): Promise<number>;

    /** Count sell intents that have any deposit_derivation_path for the asset. */
    countWithDepositDerivationPath(cryptoType: string): Promise<number>;
}
