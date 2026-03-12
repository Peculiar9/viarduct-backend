import { ICard } from '../Entities/giftcard/ICard';

export interface ICardService {
    findAll(): Promise<ICard[]>;
    findById(id: string): Promise<ICard | null>;
    create(data: Partial<ICard>): Promise<ICard>;
    update(id: string, data: Partial<ICard>): Promise<ICard | null>;
    delete(id: string): Promise<boolean>;
}
