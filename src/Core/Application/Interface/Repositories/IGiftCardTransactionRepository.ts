import { IGiftCardTransaction } from '../Entities/giftcard/IGiftCardTransaction';

export interface IGiftCardTransactionRepository {
    create(entity: IGiftCardTransaction): Promise<IGiftCardTransaction>;
    findById(id: string): Promise<IGiftCardTransaction | null>;
    findByUserId(userId: string, limit?: number, offset?: number): Promise<IGiftCardTransaction[]>;
    countByUserId(userId: string): Promise<number>;
    findByCustomIdentifier(customIdentifier: string): Promise<IGiftCardTransaction | null>;
    update(id: string, entity: Partial<IGiftCardTransaction>): Promise<IGiftCardTransaction | null>;
}
