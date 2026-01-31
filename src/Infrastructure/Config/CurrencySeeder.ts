import { inject, injectable } from 'inversify';
import { TYPES } from '../../Core/Types/Constants';
import { TransactionManager } from '../Repository/SQL/Abstractions/TransactionManager';
import { CurrencyRepository } from '../Repository/SQL/wallet/CurrencyRepository';
import { Console } from '../Utils/Console';

@injectable()
export class CurrencySeeder {
    constructor(
        @inject(TYPES.TransactionManager) private transactionManager: TransactionManager,
        @inject(TYPES.CurrencyRepository) private currencyRepository: CurrencyRepository,
    ) {}

    async seed(): Promise<void> {
        try {
            await this.transactionManager.beginTransaction();
            
            // Create currencies
            await this.createCurrencies();
            
            await this.transactionManager.commit();
            Console.info('Currency seeding completed successfully');
        } catch (error: any) {
            await this.transactionManager.rollback();
            Console.error(error, { message: 'Failed to seed currencies' });
            throw error;
        }
    }

    private async createCurrencies(): Promise<void> {
        const currencies = [
            {
                code: 'NGN',
                name: 'Nigerian Naira',
                symbol: '₦',
                type: 'fiat' as const,
                decimals: 2,
                is_active: true
            },
            {
                code: 'BTC',
                name: 'Bitcoin',
                symbol: '₿',
                type: 'crypto' as const,
                decimals: 8,
                is_active: true
            }
        ];

        const existingCurrencies = await this.currencyRepository.findAll();
        
        for (const currency of currencies) {
            const exists = existingCurrencies.find(c => c.code === currency.code);
            if (!exists) {
                await this.currencyRepository.create(currency as any);
                Console.info(`Created currency: ${currency.code} (${currency.name})`);
            } else {
                Console.info(`Currency already exists, skipping: ${currency.code}`);
            }
        }
    }
}

