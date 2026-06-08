import { injectable } from 'inversify';
import axios from 'axios';
import { ISpotPriceService } from '../../../Core/Application/Interface/Services/ISpotPriceService';
import { ServiceError } from '../../../Core/Application/Error/AppError';
import { Console } from '../../Utils/Console';

@injectable()
export class SpotPriceService implements ISpotPriceService {
    private btcCache: { value: number; fetchedAt: number } | null = null;
    private ethCache: { value: number; fetchedAt: number } | null = null;
    private readonly ttlMs = 30_000;

    async getBtcNgnSpotPrice(): Promise<number> {
        const now = Date.now();
        if (this.btcCache && now - this.btcCache.fetchedAt < this.ttlMs) {
            return this.btcCache.value;
        }

        try {
            const res = await axios.get('https://api.coingecko.com/api/v3/simple/price', {
                params: { ids: 'bitcoin', vs_currencies: 'ngn' },
                timeout: 10_000
            });

            const price = Number(res.data?.bitcoin?.ngn);
            if (!price || Number.isNaN(price) || price <= 0) {
                throw new Error('Invalid price payload');
            }

            this.btcCache = { value: price, fetchedAt: now };
            return price;
        } catch (err: any) {
            Console.warn('Failed to fetch BTC/NGN spot price', { error: err?.message });
            throw new ServiceError('Failed to fetch live BTC/NGN spot price');
        }
    }

    async getEthNgnSpotPrice(): Promise<number> {
        const now = Date.now();
        if (this.ethCache && now - this.ethCache.fetchedAt < this.ttlMs) {
            return this.ethCache.value;
        }

        try {
            const res = await axios.get('https://api.coingecko.com/api/v3/simple/price', {
                params: { ids: 'ethereum', vs_currencies: 'ngn' },
                timeout: 10_000
            });

            const price = Number(res.data?.ethereum?.ngn);
            if (!price || Number.isNaN(price) || price <= 0) {
                throw new Error('Invalid price payload');
            }

            this.ethCache = { value: price, fetchedAt: now };
            return price;
        } catch (err: any) {
            Console.warn('Failed to fetch ETH/NGN spot price', { error: err?.message });
            throw new ServiceError('Failed to fetch live ETH/NGN spot price');
        }
    }
}
