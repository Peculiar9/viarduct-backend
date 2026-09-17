import { injectable } from 'inversify';
import axios from 'axios';
import { ISpotPriceService } from '../../../Core/Application/Interface/Services/ISpotPriceService';
import { ServiceError } from '../../../Core/Application/Error/AppError';
import { Console } from '../../Utils/Console';

type BinanceTickerResponse = {
    symbol: string;
    price: string;
};

type SpotPairCache = {
    ngn: number;
    usd: number;
    fetchedAt: number;
};

/**
 * Live crypto spot prices via Binance public ticker API.
 * USD from BTCUSDT / ETHUSDT; NGN via × USDTNGN (fallback: BTCNGN / ETHNGN).
 */
@injectable()
export class SpotPriceService implements ISpotPriceService {
    private btcCache: SpotPairCache | null = null;
    private ethCache: SpotPairCache | null = null;
    private usdtNgnCache: { value: number; fetchedAt: number } | null = null;
    private readonly ttlMs = 30_000;
    private readonly baseUrl = 'https://api.binance.com/api/v3/ticker/price';

    async getBtcNgnSpotPrice(): Promise<number> {
        return (await this.getCachedOrFetch('BTC')).ngn;
    }

    async getEthNgnSpotPrice(): Promise<number> {
        return (await this.getCachedOrFetch('ETH')).ngn;
    }

    async getBtcUsdSpotPrice(): Promise<number> {
        return (await this.getCachedOrFetch('BTC')).usd;
    }

    async getEthUsdSpotPrice(): Promise<number> {
        return (await this.getCachedOrFetch('ETH')).usd;
    }

    private async getCachedOrFetch(asset: 'BTC' | 'ETH'): Promise<SpotPairCache> {
        const now = Date.now();
        const cache = asset === 'BTC' ? this.btcCache : this.ethCache;
        if (cache && now - cache.fetchedAt < this.ttlMs) {
            return cache;
        }

        try {
            const pair = await this.fetchCryptoSpotPair(asset);
            const entry: SpotPairCache = { ...pair, fetchedAt: now };
            if (asset === 'BTC') {
                this.btcCache = entry;
            } else {
                this.ethCache = entry;
            }
            return entry;
        } catch (err: any) {
            Console.warn(`Failed to fetch ${asset} spot prices from Binance`, {
                error: err?.message
            });
            throw new ServiceError(`Failed to fetch live ${asset} spot price from Binance`);
        }
    }

    private async fetchCryptoSpotPair(asset: 'BTC' | 'ETH'): Promise<{ ngn: number; usd: number }> {
        const usdtSymbol = asset === 'BTC' ? 'BTCUSDT' : 'ETHUSDT';
        const usd = await this.fetchTickerPrice(usdtSymbol);

        try {
            const usdtNgn = await this.getUsdtNgnRate();
            const ngn = usd * usdtNgn;
            if (ngn > 0) {
                return { ngn, usd };
            }
        } catch (err: any) {
            Console.warn(`Binance ${usdtSymbol}×USDTNGN path failed; trying direct NGN pair`, {
                error: err?.message
            });
        }

        const directSymbol = asset === 'BTC' ? 'BTCNGN' : 'ETHNGN';
        const ngn = await this.fetchTickerPrice(directSymbol);
        return { ngn, usd };
    }

    private async getUsdtNgnRate(): Promise<number> {
        const now = Date.now();
        if (this.usdtNgnCache && now - this.usdtNgnCache.fetchedAt < this.ttlMs) {
            return this.usdtNgnCache.value;
        }
        const rate = await this.fetchTickerPrice('USDTNGN');
        this.usdtNgnCache = { value: rate, fetchedAt: now };
        return rate;
    }

    private async fetchTickerPrice(symbol: string): Promise<number> {
        const res = await axios.get<BinanceTickerResponse>(this.baseUrl, {
            params: { symbol },
            timeout: 10_000
        });
        const price = Number(res.data?.price);
        if (!price || Number.isNaN(price) || price <= 0) {
            throw new Error(`Invalid Binance ticker payload for ${symbol}`);
        }
        return price;
    }
}
