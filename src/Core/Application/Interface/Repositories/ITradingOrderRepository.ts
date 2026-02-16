import { ITradingOrder, TradingOrderStatus, TradingOrderType } from '../Entities/trading/ITradingOrder';

export interface ITradingOrderRepository {
    findById(id: string): Promise<ITradingOrder | null>;
    findAll(): Promise<ITradingOrder[]>;
    findByCondition(condition: Partial<ITradingOrder>): Promise<ITradingOrder[]>;
    create(entity: ITradingOrder): Promise<ITradingOrder>;
    update(id: string, entity: Partial<ITradingOrder>): Promise<ITradingOrder | null>;
    delete(id: string): Promise<boolean>;
    executeRawQuery(query: string, params: any[]): Promise<any>;
    count(condition?: Partial<ITradingOrder>): Promise<number>;
    bulkCreate(entities: ITradingOrder[]): Promise<ITradingOrder[]>;
    bulkUpdate(entities: Partial<ITradingOrder>[]): Promise<ITradingOrder[]>;
    bulkDelete(ids: string[]): Promise<number>;
    
    // Custom methods
    findByUserId(userId: string, limit?: number, offset?: number): Promise<ITradingOrder[]>;
    findByStatus(status: TradingOrderStatus, limit?: number): Promise<ITradingOrder[]>;
    findByBitcoinTxHash(txHash: string): Promise<ITradingOrder | null>;
    findByBitcoinTxHashOutgoing(txHash: string): Promise<ITradingOrder | null>;
    findByPaymentReference(paymentReference: string): Promise<ITradingOrder | null>;
    findWithFilters(
        filters: {
            userId?: string;
            status?: TradingOrderStatus;
            type?: TradingOrderType;
        },
        limit?: number,
        offset?: number
    ): Promise<ITradingOrder[]>;
}

