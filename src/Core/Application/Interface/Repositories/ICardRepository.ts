import { ICard } from '../Entities/giftcard/ICard';

export interface ICardRepository {
    create(entity: ICard): Promise<ICard>;
    findById(id: string): Promise<ICard | null>;
    findAll(): Promise<ICard[]>;
    update(id: string, entity: Partial<ICard>): Promise<ICard | null>;
    delete(id: string): Promise<boolean>;
}
