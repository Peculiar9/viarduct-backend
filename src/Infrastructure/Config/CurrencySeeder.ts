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
            { code: 'NGN', name: 'Nigerian Naira', symbol: '₦', type: 'fiat' as const, decimals: 2, is_active: true },
            { code: 'USD', name: 'US Dollar', symbol: '$', type: 'fiat' as const, decimals: 2, is_active: true },
            { code: 'GBP', name: 'British Pound', symbol: '£', type: 'fiat' as const, decimals: 2, is_active: true },
            { code: 'EUR', name: 'Euro', symbol: '€', type: 'fiat' as const, decimals: 2, is_active: true },
            { code: 'CAD', name: 'Canadian Dollar', symbol: 'C$', type: 'fiat' as const, decimals: 2, is_active: true },
            { code: 'AUD', name: 'Australian Dollar', symbol: 'A$', type: 'fiat' as const, decimals: 2, is_active: true },
            { code: 'CHF', name: 'Swiss Franc', symbol: 'CHF', type: 'fiat' as const, decimals: 2, is_active: true },
            { code: 'JPY', name: 'Japanese Yen', symbol: '¥', type: 'fiat' as const, decimals: 0, is_active: true },
            { code: 'CNY', name: 'Chinese Yuan', symbol: '¥', type: 'fiat' as const, decimals: 2, is_active: true },
            { code: 'ZAR', name: 'South African Rand', symbol: 'R', type: 'fiat' as const, decimals: 2, is_active: true },
            { code: 'KES', name: 'Kenyan Shilling', symbol: 'KSh', type: 'fiat' as const, decimals: 2, is_active: true },
            { code: 'GHS', name: 'Ghanaian Cedi', symbol: '₵', type: 'fiat' as const, decimals: 2, is_active: true },
            { code: 'XOF', name: 'West African CFA Franc', symbol: 'CFA', type: 'fiat' as const, decimals: 0, is_active: true },
            { code: 'XAF', name: 'Central African CFA Franc', symbol: 'FCFA', type: 'fiat' as const, decimals: 0, is_active: true },
            { code: 'EGP', name: 'Egyptian Pound', symbol: 'E£', type: 'fiat' as const, decimals: 2, is_active: true },
            { code: 'MAD', name: 'Moroccan Dirham', symbol: 'DH', type: 'fiat' as const, decimals: 2, is_active: true },
            { code: 'INR', name: 'Indian Rupee', symbol: '₹', type: 'fiat' as const, decimals: 2, is_active: true },
            { code: 'BRL', name: 'Brazilian Real', symbol: 'R$', type: 'fiat' as const, decimals: 2, is_active: true },
            { code: 'MXN', name: 'Mexican Peso', symbol: '$', type: 'fiat' as const, decimals: 2, is_active: true },
            { code: 'TRY', name: 'Turkish Lira', symbol: '₺', type: 'fiat' as const, decimals: 2, is_active: true },
            { code: 'SAR', name: 'Saudi Riyal', symbol: '﷼', type: 'fiat' as const, decimals: 2, is_active: true },
            { code: 'AED', name: 'UAE Dirham', symbol: 'د.إ', type: 'fiat' as const, decimals: 2, is_active: true },
            {
                code: 'BTC',
                name: 'Bitcoin',
                symbol: '₿',
                type: 'crypto' as const,
                decimals: 8,
                is_active: true
            },
            {
                code: 'ETH',
                name: 'Ethereum',
                symbol: 'Ξ',
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

