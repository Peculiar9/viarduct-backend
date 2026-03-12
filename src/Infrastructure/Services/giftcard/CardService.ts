import { inject, injectable } from 'inversify';
import { TYPES } from '../../../Core/Types/Constants';
import { ICardService } from '../../../Core/Application/Interface/Services/ICardService';
import { ICard } from '../../../Core/Application/Interface/Entities/giftcard/ICard';
import { ICardRepository } from '../../../Core/Application/Interface/Repositories/ICardRepository';
import { ValidationError } from '../../../Core/Application/Error/AppError';

@injectable()
export class CardService implements ICardService {
    constructor(
        @inject(TYPES.CardRepository) private readonly cardRepository: ICardRepository
    ) {}

    async findAll(): Promise<ICard[]> {
        return this.cardRepository.findAll();
    }

    async findById(id: string): Promise<ICard | null> {
        return this.cardRepository.findById(id);
    }

    async create(data: Partial<ICard>): Promise<ICard> {
        if (!data.name || String(data.name).trim() === '') {
            throw new ValidationError('Card name is required');
        }
        const now = new Date().toISOString();
        return this.cardRepository.create({
            name: data.name.trim(),
            description: data.description ?? null,
            url: data.url ?? null,
            created_at: now,
            updated_at: now
        } as ICard);
    }

    async update(id: string, data: Partial<ICard>): Promise<ICard | null> {
        const existing = await this.cardRepository.findById(id);
        if (!existing) return null;
        const updates: Partial<ICard> = { updated_at: new Date().toISOString() };
        if (data.name !== undefined) updates.name = String(data.name).trim();
        if (data.description !== undefined) updates.description = data.description;
        if (data.url !== undefined) updates.url = data.url;
        return this.cardRepository.update(id, updates);
    }

    async delete(id: string): Promise<boolean> {
        return this.cardRepository.delete(id);
    }
}
