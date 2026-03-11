import { IWithdrawalRequest } from '../Entities/withdrawal/IWithdrawalRequest';

export interface IWithdrawalRequestRepository {
    create(entity: IWithdrawalRequest): Promise<IWithdrawalRequest>;
    findById(id: string): Promise<IWithdrawalRequest | null>;
    findByUserId(userId: string, limit?: number, offset?: number): Promise<IWithdrawalRequest[]>;
    update(id: string, entity: Partial<IWithdrawalRequest>): Promise<IWithdrawalRequest | null>;
}
