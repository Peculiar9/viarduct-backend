import { inject, injectable } from 'inversify';
import { TYPES } from '../../../Core/Types/Constants';
import { ITradingRateService } from '../../../Core/Application/Interface/Services/ITradingRateService';
import { ITradingRateRepository } from '../../../Core/Application/Interface/Repositories/ITradingRateRepository';
import { ITradingRate } from '../../../Core/Application/Interface/Entities/trading/ITradingRate';
import { ServiceError } from '../../../Core/Application/Error/AppError';
import { Console } from '../../Utils/Console';
import { ISpotPriceService } from '../../../Core/Application/Interface/Services/ISpotPriceService';

@injectable()
export class TradingRateService implements ITradingRateService {
    constructor(
        @inject(TYPES.TradingRateRepository) private readonly tradingRateRepository: ITradingRateRepository,
        @inject(TYPES.SpotPriceService) private readonly spotPriceService: ISpotPriceService
    ) {}

    async getActiveRate(cryptoType: string): Promise<ITradingRate> {
        try {
            const rate = await this.tradingRateRepository.findActiveByCryptoType(cryptoType);
            
            if (!rate) {
                throw new ServiceError(`No active trading rate found for ${cryptoType}. Please configure rates first.`);
            }

            // Live spot + margin model (crypto only)
            const ct = rate.crypto_type.toUpperCase();
            if (rate.type === 'crypto' && (ct === 'BTC' || ct === 'ETH')) {
                let spot: number | null = null;
                try {
                    spot = ct === 'BTC'
                        ? await this.spotPriceService.getBtcNgnSpotPrice()
                        : await this.spotPriceService.getEthNgnSpotPrice();
                } catch {
                    // ignore - fallback below
                }

                const lastSpot = Number(parseFloat(String(rate.last_spot_price ?? 0))) || null;
                const emergencySpot = Number(parseFloat(String(rate.emergency_spot_price ?? 0))) || null;
                const spotToUse = spot ?? lastSpot ?? emergencySpot;

                if (!spotToUse || spotToUse <= 0) {
                    throw new ServiceError('Spot price unavailable. Set emergency_spot_price or wait for live price.');
                }

                const buyMargin = Number(parseFloat(String(rate.buy_margin_percentage ?? 0)));
                const sellMargin = Number(parseFloat(String(rate.sell_margin_percentage ?? 0)));

                const buyRate = spotToUse * (1 - (buyMargin / 100));
                const sellRate = spotToUse * (1 + (sellMargin / 100));

                const spreadPercentage = buyRate > 0 ? ((sellRate - buyRate) / buyRate) * 100 : 0;

                // Cache last successful spot in DB (best-effort; avoid failing reads on write issues)
                if (spot !== null && spot > 0) {
                    try {
                        await this.tradingRateRepository.update(rate._id!, {
                            last_spot_price: spot,
                            buy_rate: buyRate,
                            sell_rate: sellRate,
                            spread_percentage: spreadPercentage
                        } as any);
                    } catch (e: any) {
                        Console.warn('Failed to persist last spot price', { cryptoType, error: e?.message });
                    }
                }

                return {
                    ...rate,
                    last_spot_price: spot ?? rate.last_spot_price,
                    buy_rate: buyRate,
                    sell_rate: sellRate,
                    spread_percentage: spreadPercentage
                } as any;
            }

            return rate;
        } catch (error: any) {
            Console.error(error, { message: 'Failed to get active trading rate', cryptoType });
            throw error;
        }
    }

    async createRate(data: {
        crypto_type: string;
        buy_margin_percentage: number;
        sell_margin_percentage: number;
        emergency_spot_price?: number;
        spread_percentage?: number;
        type?: string;
        updated_by: string;
    }): Promise<ITradingRate> {
        try {
            // Validate crypto_type
            if (!data.crypto_type || data.crypto_type.trim() === '') {
                throw new ServiceError('Crypto type is required');
            }

            // Normalize crypto_type to uppercase
            const cryptoType = data.crypto_type.toUpperCase().trim();

            // Validate and set type (default to 'crypto' if not provided)
            const type = data.type || 'crypto';
            if (type !== 'crypto' && type !== 'giftcard') {
                throw new ServiceError('Type must be either "crypto" or "giftcard"');
            }

            // Check if active rate already exists for this crypto type
            const existingActiveRate = await this.tradingRateRepository.findActiveByCryptoType(cryptoType);
            if (existingActiveRate) {
                throw new ServiceError(`Active trading rate already exists for ${cryptoType}. Please update the existing rate or deactivate it first.`);
            }

            // Validate margins (0-100)
            if (data.buy_margin_percentage < 0 || data.buy_margin_percentage > 100) {
                throw new ServiceError('buy_margin_percentage must be between 0 and 100');
            }
            if (data.sell_margin_percentage < 0 || data.sell_margin_percentage > 100) {
                throw new ServiceError('sell_margin_percentage must be between 0 and 100');
            }

            // Determine spot (live preferred)
            let spot: number | null = null;
            try {
                if (type === 'crypto' && cryptoType === 'BTC') {
                    spot = await this.spotPriceService.getBtcNgnSpotPrice();
                } else if (type === 'crypto' && cryptoType === 'ETH') {
                    spot = await this.spotPriceService.getEthNgnSpotPrice();
                }
            } catch {
                // ignore, fallback below
            }
            const emergencySpot = data.emergency_spot_price ?? null;
            const spotToUse = spot ?? emergencySpot;
            if (!spotToUse || spotToUse <= 0) {
                throw new ServiceError('Spot price unavailable. Provide emergency_spot_price.');
            }

            const buyRate = spotToUse * (1 - (data.buy_margin_percentage / 100));
            const sellRate = spotToUse * (1 + (data.sell_margin_percentage / 100));
            const spreadPercentage = buyRate > 0 ? ((sellRate - buyRate) / buyRate) * 100 : 0;

            // Create new rate
            const newRate: ITradingRate = {
                crypto_type: cryptoType,
                type: type,
                buy_rate: buyRate,
                sell_rate: sellRate,
                buy_margin_percentage: data.buy_margin_percentage,
                sell_margin_percentage: data.sell_margin_percentage,
                last_spot_price: spot ?? null,
                emergency_spot_price: emergencySpot,
                spread_percentage: spreadPercentage,
                is_active: true,
                updated_by: data.updated_by
            };

            const created = await this.tradingRateRepository.create(newRate);
            
            Console.info('Trading rate created successfully', {
                crypto_type: created.crypto_type,
                type: created.type,
                buy_rate: created.buy_rate,
                sell_rate: created.sell_rate,
                spread: created.spread_percentage
            });

            return created;
        } catch (error: any) {
            Console.error(error, { message: 'Failed to create trading rate' });
            throw error;
        }
    }

    async updateRate(id: string, data: Partial<ITradingRate>, updatedBy: string): Promise<ITradingRate> {
        try {
            const existingRate = await this.tradingRateRepository.findById(id);
            
            if (!existingRate) {
                throw new ServiceError('Trading rate not found');
            }

            // Validate margins if updating
            if (data.buy_margin_percentage !== undefined) {
                const v = Number(data.buy_margin_percentage);
                if (Number.isNaN(v) || v < 0 || v > 100) {
                    throw new ServiceError('buy_margin_percentage must be between 0 and 100');
                }
            }
            if (data.sell_margin_percentage !== undefined) {
                const v = Number(data.sell_margin_percentage);
                if (Number.isNaN(v) || v < 0 || v > 100) {
                    throw new ServiceError('sell_margin_percentage must be between 0 and 100');
                }
            }

            // Recompute derived buy/sell rates using best spot available
            const buyMargin = data.buy_margin_percentage ?? existingRate.buy_margin_percentage ?? 0;
            const sellMargin = data.sell_margin_percentage ?? existingRate.sell_margin_percentage ?? 0;
            const emergencySpot = data.emergency_spot_price ?? existingRate.emergency_spot_price ?? null;

            let spot: number | null = null;
            try {
                const ect = existingRate.crypto_type.toUpperCase();
                if (existingRate.type === 'crypto' && ect === 'BTC') {
                    spot = await this.spotPriceService.getBtcNgnSpotPrice();
                } else if (existingRate.type === 'crypto' && ect === 'ETH') {
                    spot = await this.spotPriceService.getEthNgnSpotPrice();
                }
            } catch {
                // ignore
            }

            const lastSpot = existingRate.last_spot_price ?? null;
            const spotToUse = spot ?? lastSpot ?? emergencySpot;
            if (!spotToUse || Number(spotToUse) <= 0) {
                throw new ServiceError('Spot price unavailable. Set emergency_spot_price.');
            }

            const buyRate = Number(spotToUse) * (1 - (Number(buyMargin) / 100));
            const sellRate = Number(spotToUse) * (1 + (Number(sellMargin) / 100));
            const spreadPercentage = buyRate > 0 ? ((sellRate - buyRate) / buyRate) * 100 : 0;

            (data as any).buy_rate = buyRate;
            (data as any).sell_rate = sellRate;
            (data as any).spread_percentage = spreadPercentage;
            if (spot !== null) {
                (data as any).last_spot_price = spot;
            }

            data.updated_by = updatedBy;
            // Don't set updated_at here - repository handles it automatically with CURRENT_TIMESTAMP

            // Exclude updated_at and created_at from data since repository handles them
            const { updated_at, created_at, _id, ...updateData } = data;
            
            const updated = await this.tradingRateRepository.update(id, updateData);
            
            if (!updated) {
                throw new ServiceError('Failed to update trading rate');
            }

            return updated;
        } catch (error: any) {
            Console.error(error, { message: 'Failed to update trading rate' });
            throw error;
        }
    }

    async getAllRates(): Promise<ITradingRate[]> {
        try {
            const rates = await this.tradingRateRepository.findAll();
            Console.info('Retrieved all trading rates', { count: rates.length, crypto_types: rates.map(r => r.crypto_type) });
            return rates;
        } catch (error: any) {
            Console.error(error, { message: 'Failed to get all trading rates' });
            throw error;
        }
    }

    async getRateById(id: string): Promise<ITradingRate> {
        try {
            const rate = await this.tradingRateRepository.findById(id);
            
            if (!rate) {
                throw new ServiceError('Trading rate not found');
            }

            return rate;
        } catch (error: any) {
            Console.error(error, { message: 'Failed to get trading rate by id', id });
            throw error;
        }
    }

    async calculateBuyAmount(cryptoType: string, cryptoAmount: number): Promise<number> {
        try {
            const rate = await this.getActiveRate(cryptoType);
            return cryptoAmount * rate.sell_rate;  // User buys at sell_rate
        } catch (error: any) {
            Console.error(error, { message: 'Failed to calculate buy amount', cryptoType });
            throw error;
        }
    }

    async calculateSellAmount(cryptoType: string, cryptoAmount: number): Promise<number> {
        try {
            const rate = await this.getActiveRate(cryptoType);
            return cryptoAmount * rate.buy_rate;  // User sells at buy_rate
        } catch (error: any) {
            Console.error(error, { message: 'Failed to calculate sell amount', cryptoType });
            throw error;
        }
    }
}

