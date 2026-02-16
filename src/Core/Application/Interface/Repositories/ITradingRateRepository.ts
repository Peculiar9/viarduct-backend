import { ITradingRate } from '../Entities/trading/ITradingRate';

export interface ITradingRateRepository {
    create(entity: ITradingRate): Promise<ITradingRate>;
    findActive(): Promise<ITradingRate | null>;
    findActiveByCryptoType(cryptoType: string): Promise<ITradingRate | null>;
    findById(id: string): Promise<ITradingRate | null>;
    update(id: string, entity: Partial<ITradingRate>): Promise<ITradingRate | null>;
    findAll(): Promise<ITradingRate[]>;
}

