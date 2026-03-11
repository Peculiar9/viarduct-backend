import { IUserTransactionPin } from '../Entities/withdrawal/IUserTransactionPin';

export interface IUserTransactionPinRepository {
    findByUserId(userId: string): Promise<IUserTransactionPin | null>;
    create(entity: IUserTransactionPin): Promise<IUserTransactionPin>;
    update(userId: string, pinHash: string): Promise<IUserTransactionPin | null>;
}
