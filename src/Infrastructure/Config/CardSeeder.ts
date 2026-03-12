import { inject, injectable } from 'inversify';
import { TYPES } from '../../Core/Types/Constants';
import { TransactionManager } from '../Repository/SQL/Abstractions/TransactionManager';
import { CardRepository } from '../Repository/SQL/giftcard/CardRepository';
import { Console } from '../Utils/Console';
import { ICard } from '../../Core/Application/Interface/Entities/giftcard/ICard';

const DEFAULT_CARDS: Pick<ICard, 'name' | 'description' | 'url'>[] = [
    { name: 'Amazon Gift Card', description: null, url: null },
    { name: 'Apple Gift Card', description: null, url: null },
    { name: 'Etsy Giftcard', description: null, url: null },
    { name: 'Tango Card', description: null, url: null },
    { name: 'Reloadly', description: null, url: null },
    { name: 'CardCash', description: null, url: null },
    { name: 'Presmit', description: null, url: null },
    { name: 'DiggerCard', description: null, url: null },
    { name: 'CardVest-gift', description: null, url: null },
    { name: 'Snappy Gifts', description: null, url: null }
];

@injectable()
export class CardSeeder {
    constructor(
        @inject(TYPES.TransactionManager) private transactionManager: TransactionManager,
        @inject(TYPES.CardRepository) private cardRepository: CardRepository
    ) {}

    async seed(): Promise<void> {
        try {
            await this.transactionManager.beginTransaction();
            const existing = await this.cardRepository.findAll();
            const existingNames = new Set(existing.map(c => c.name.toLowerCase()));
            for (const card of DEFAULT_CARDS) {
                if (!existingNames.has(card.name.toLowerCase())) {
                    await this.cardRepository.create({
                        ...card,
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString()
                    } as ICard);
                    Console.info(`Created card: ${card.name}`);
                }
            }
            await this.transactionManager.commit();
            Console.info('Card seeding completed successfully');
        } catch (error: any) {
            await this.transactionManager.rollback();
            Console.error(error, { message: 'Failed to seed cards' });
            throw error;
        }
    }
}
