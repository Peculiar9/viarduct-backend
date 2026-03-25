import axios from 'axios';
import { Request, Response } from 'express';
import { controller, httpGet, request, response } from 'inversify-express-utils';
import { inject } from 'inversify';
import { API_PATH, TYPES } from '../../Core/Types/Constants';
import { TableNames } from '../../Core/Application/Enums/TableNames';
import { ITradingOrderRepository } from '../../Core/Application/Interface/Repositories/ITradingOrderRepository';
import { EnvironmentConfig } from '../../Infrastructure/Config/EnvironmentConfig';
import { UserRepository } from '../../Infrastructure/Repository/SQL/users/UserRepository';
import { UserKYCRepository } from '../../Infrastructure/Repository/SQL/auth/UserKYCRepository';
import AuthMiddleware from '../../Middleware/AuthMiddleware';
import { BaseController } from '../BaseController';

type CoinGeckoSimplePriceResponse = Record<string, Record<string, number>>;

type CacheEntry = {
    key: string;
    value: CoinGeckoSimplePriceResponse;
    fetchedAtMs: number;
    expiresAtMs: number;
};

let cache: CacheEntry | null = null;

function normalizeCsv(value: unknown, fallback: string, toLower: boolean): string {
    const raw = typeof value === 'string' ? value : fallback;
    const cleaned = raw
        .split(',')
        .map(s => s.trim())
        .filter(Boolean)
        .join(',');
    if (cleaned.length === 0) return fallback;
    return toLower ? cleaned.toLowerCase() : cleaned;
}

function pctChange(currentTotal: number, previousTotal: number): number {
    if (!Number.isFinite(currentTotal) || !Number.isFinite(previousTotal)) return 0;
    if (previousTotal === 0) return currentTotal === 0 ? 0 : 100;
    return ((currentTotal - previousTotal) / previousTotal) * 100;
}

function toNumber(value: any): number {
    if (value == null) return 0;
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    if (typeof value === 'string') {
        const n = parseFloat(value);
        return Number.isFinite(n) ? n : 0;
    }
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
}

function getRows(result: any): any[] {
    if (Array.isArray(result)) return result;
    if (result?.rows && Array.isArray(result.rows)) return result.rows;
    return [];
}

async function scalarNumber(repo: { executeRawQuery: (q: string, p: any[]) => Promise<any> }, query: string, params: any[], field: string): Promise<number> {
    const result = await repo.executeRawQuery(query, params);
    const rows = getRows(result);
    return toNumber(rows?.[0]?.[field]);
}

function round2(n: number): number {
    if (!Number.isFinite(n)) return 0;
    return Math.round(n * 100) / 100;
}

type StatsIndicator = '24h' | '1w' | '1m' | '1y';

function asStatsIndicator(value: unknown): StatsIndicator | null {
    const v = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (v === '24h') return '24h';
    if (v === '1w') return '1w';
    if (v === '1m') return '1m';
    if (v === '1y') return '1y';
    return null;
}

function alignToHourUtc(d: Date): Date {
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), 0, 0, 0));
}

function alignToDayUtc(d: Date): Date {
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
}

function alignToMonthUtc(d: Date): Date {
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0, 0));
}

function addHoursUtc(d: Date, hours: number): Date {
    return new Date(d.getTime() + hours * 60 * 60 * 1000);
}

function addDaysUtc(d: Date, days: number): Date {
    return new Date(d.getTime() + days * 24 * 60 * 60 * 1000);
}

function addMonthsUtc(d: Date, months: number): Date {
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1, 0, 0, 0, 0));
}

function bucketKeyIso(d: Date): string {
    return d.toISOString();
}

@controller(`/${API_PATH}/admin/dashboard`)
export class AdminDashboardController extends BaseController {
    constructor(
        @inject(TYPES.UserRepository) private readonly userRepository: UserRepository,
        @inject(TYPES.UserKYCRepository) private readonly userKycRepository: UserKYCRepository,
        @inject(TYPES.TradingOrderRepository) private readonly tradingOrderRepository: ITradingOrderRepository
    ) {
        super();
    }

    @httpGet('/', AuthMiddleware.authenticateAdmin())
    async getAdminDashboard(@request() req: Request, @response() res: Response) {
        const defaultCoinIds = 'bitcoin,ethereum,tether';
        const defaultVsCurrencies = 'ngn,usd';

        const coinIds = normalizeCsv(req.query.coin_ids, defaultCoinIds, true);
        const vsCurrencies = normalizeCsv(req.query.vs_currencies, defaultVsCurrencies, true);

        const ttlMs = EnvironmentConfig.getNumber('COINGECKO_SIMPLE_PRICE_TTL_MS', 60_000);
        const timeoutMs = EnvironmentConfig.getNumber('COINGECKO_TIMEOUT_MS', 5_000);

        const cacheKey = `ids=${coinIds}&vs=${vsCurrencies}`;
        const now = Date.now();

        const nowDate = new Date(now);
        const start21d = new Date(now - 21 * 24 * 60 * 60 * 1000);
        const start42d = new Date(now - 42 * 24 * 60 * 60 * 1000);
        const start24h = new Date(now - 24 * 60 * 60 * 1000);
        const start48h = new Date(now - 48 * 60 * 60 * 1000);

        let cryptoMarketValue: CoinGeckoSimplePriceResponse = {};
        let cryptoMeta: any = {
            source: 'coingecko',
            coin_ids: coinIds.split(','),
            vs_currencies: vsCurrencies.split(','),
            fetched_at: null as string | null,
            cached: false,
            stale: false
        };

        if (cache && cache.key === cacheKey && cache.expiresAtMs > now) {
            cryptoMarketValue = cache.value;
            cryptoMeta = {
                ...cryptoMeta,
                fetched_at: new Date(cache.fetchedAtMs).toISOString(),
                cached: true,
                stale: false
            };
        } else {
            try {
                const { data } = await axios.get<CoinGeckoSimplePriceResponse>(
                    'https://api.coingecko.com/api/v3/simple/price',
                    {
                        timeout: timeoutMs,
                        params: {
                            ids: coinIds,
                            vs_currencies: vsCurrencies
                        }
                    }
                );

                cache = {
                    key: cacheKey,
                    value: data,
                    fetchedAtMs: now,
                    expiresAtMs: now + Math.max(1_000, ttlMs)
                };

                cryptoMarketValue = data;
                cryptoMeta = {
                    ...cryptoMeta,
                    fetched_at: new Date(now).toISOString(),
                    cached: false,
                    stale: false
                };
            } catch (error: any) {
                if (cache && cache.key === cacheKey) {
                    cryptoMarketValue = cache.value;
                    cryptoMeta = {
                        ...cryptoMeta,
                        fetched_at: new Date(cache.fetchedAtMs).toISOString(),
                        cached: true,
                        stale: true,
                        error: error?.message || 'Failed to fetch crypto market values'
                    };
                } else {
                    cryptoMarketValue = {};
                    cryptoMeta = {
                        ...cryptoMeta,
                        fetched_at: nowDate.toISOString(),
                        cached: false,
                        stale: true,
                        error: error?.message || 'Failed to fetch crypto market values'
                    };
                }
            }
        }

        const usersTotalPromise = this.userRepository.count();
        const usersBeforePromise = scalarNumber(
            this.userRepository,
            `SELECT COUNT(*)::int as count FROM "${TableNames.USERS}" WHERE created_at < $1::timestamptz`,
            [start21d.toISOString()],
            'count'
        );

        const kycTotalPromise = this.userKycRepository.count();
        const kycBeforePromise = scalarNumber(
            this.userKycRepository,
            `SELECT COUNT(*)::int as count FROM "${TableNames.USER_KYC}" WHERE last_updated < $1::timestamptz`,
            [start21d.toISOString()],
            'count'
        );

        const dailyTradesCurrentPromise = scalarNumber(
            this.tradingOrderRepository,
            `SELECT COUNT(*)::int as count FROM "${TableNames.TRADING_ORDERS}" WHERE created_at >= $1::timestamptz`,
            [start24h.toISOString()],
            'count'
        );
        const dailyTradesPreviousPromise = scalarNumber(
            this.tradingOrderRepository,
            `SELECT COUNT(*)::int as count FROM "${TableNames.TRADING_ORDERS}" WHERE created_at >= $1::timestamptz AND created_at < $2::timestamptz`,
            [start48h.toISOString(), start24h.toISOString()],
            'count'
        );

        const btcUsd = toNumber(cryptoMarketValue?.bitcoin?.usd);

        const btcSumAllPromise = scalarNumber(
            this.tradingOrderRepository,
            `SELECT COALESCE(SUM(crypto_amount), 0) as sum
             FROM "${TableNames.TRADING_ORDERS}"
             WHERE status = 'completed' AND UPPER(crypto_type) = 'BTC'`,
            [],
            'sum'
        );
        const btcSumLast21dPromise = scalarNumber(
            this.tradingOrderRepository,
            `SELECT COALESCE(SUM(crypto_amount), 0) as sum
             FROM "${TableNames.TRADING_ORDERS}"
             WHERE status = 'completed'
               AND UPPER(crypto_type) = 'BTC'
               AND COALESCE(completed_at, updated_at, created_at) >= $1::timestamptz`,
            [start21d.toISOString()],
            'sum'
        );
        const btcSumPrev21dPromise = scalarNumber(
            this.tradingOrderRepository,
            `SELECT COALESCE(SUM(crypto_amount), 0) as sum
             FROM "${TableNames.TRADING_ORDERS}"
             WHERE status = 'completed'
               AND UPPER(crypto_type) = 'BTC'
               AND COALESCE(completed_at, updated_at, created_at) >= $1::timestamptz
               AND COALESCE(completed_at, updated_at, created_at) < $2::timestamptz`,
            [start42d.toISOString(), start21d.toISOString()],
            'sum'
        );

        const [
            usersTotal,
            usersBefore,
            kycTotal,
            kycBefore,
            dailyTradesCurrent,
            dailyTradesPrevious,
            btcSumAll,
            btcSumLast21d,
            btcSumPrev21d
        ] = await Promise.all([
            usersTotalPromise,
            usersBeforePromise,
            kycTotalPromise,
            kycBeforePromise,
            dailyTradesCurrentPromise,
            dailyTradesPreviousPromise,
            btcSumAllPromise,
            btcSumLast21dPromise,
            btcSumPrev21dPromise
        ]);

        const userPct = round2(pctChange(usersTotal, usersBefore));
        const kycPct = round2(pctChange(kycTotal, kycBefore));
        const dailyTradesPct = round2(pctChange(dailyTradesCurrent, dailyTradesPrevious));

        const totalEarningUsdAll = btcSumAll * btcUsd;
        const earningUsdLast21d = btcSumLast21d * btcUsd;
        const earningUsdPrev21d = btcSumPrev21d * btcUsd;
        const earningPct = round2(pctChange(earningUsdLast21d, earningUsdPrev21d));

        return this.success(
            res,
            {
                crypto_market_value: cryptoMarketValue,
                crypto_market_value_meta: cryptoMeta,
                card_details: {
                    user_stats: {
                        total_users: usersTotal,
                        percentage_increament: userPct
                    },
                    total_crypto_and_gftcard_stats: {
                        total_earning: round2(totalEarningUsdAll),
                        percentage_increament: earningPct
                    },
                    daily_transaction_stats: {
                        total_trade_for_the_day: dailyTradesCurrent,
                        percentage_increament: dailyTradesPct
                    },
                    kyc_stats: {
                        total_users: kycTotal,
                        percentage_increament: kycPct
                    }
                }
            },
            'Admin dashboard retrieved successfully'
        );
    }

    /**
     * Earnings graph (admin only)
     * @route GET /api/v1/admin/dashboard/earnings-graph?stats_indicator=24h
     */
    @httpGet('/earnings-graph', AuthMiddleware.authenticateAdmin())
    async getEarningsGraph(@request() req: Request, @response() res: Response) {
        const indicator = asStatsIndicator(req.query.stats_indicator) || '24h';

        const ttlMs = EnvironmentConfig.getNumber('COINGECKO_SIMPLE_PRICE_TTL_MS', 60_000);
        const timeoutMs = EnvironmentConfig.getNumber('COINGECKO_TIMEOUT_MS', 5_000);

        // We only need BTC/USD for this graph.
        const coinIds = 'bitcoin';
        const vsCurrencies = 'usd';
        const cacheKey = `ids=${coinIds}&vs=${vsCurrencies}`;
        const now = Date.now();

        let cryptoMarketValue: CoinGeckoSimplePriceResponse = {};
        let cryptoMeta: any = {
            source: 'coingecko',
            coin_ids: [coinIds],
            vs_currencies: [vsCurrencies],
            fetched_at: null as string | null,
            cached: false,
            stale: false
        };

        if (cache && cache.key === cacheKey && cache.expiresAtMs > now) {
            cryptoMarketValue = cache.value;
            cryptoMeta = {
                ...cryptoMeta,
                fetched_at: new Date(cache.fetchedAtMs).toISOString(),
                cached: true,
                stale: false
            };
        } else {
            try {
                const { data } = await axios.get<CoinGeckoSimplePriceResponse>(
                    'https://api.coingecko.com/api/v3/simple/price',
                    {
                        timeout: timeoutMs,
                        params: {
                            ids: coinIds,
                            vs_currencies: vsCurrencies
                        }
                    }
                );

                cache = {
                    key: cacheKey,
                    value: data,
                    fetchedAtMs: now,
                    expiresAtMs: now + Math.max(1_000, ttlMs)
                };

                cryptoMarketValue = data;
                cryptoMeta = {
                    ...cryptoMeta,
                    fetched_at: new Date(now).toISOString(),
                    cached: false,
                    stale: false
                };
            } catch (error: any) {
                if (cache && cache.key === cacheKey) {
                    cryptoMarketValue = cache.value;
                    cryptoMeta = {
                        ...cryptoMeta,
                        fetched_at: new Date(cache.fetchedAtMs).toISOString(),
                        cached: true,
                        stale: true,
                        error: error?.message || 'Failed to fetch BTC/USD price'
                    };
                } else {
                    cryptoMarketValue = {};
                    cryptoMeta = {
                        ...cryptoMeta,
                        fetched_at: new Date(now).toISOString(),
                        cached: false,
                        stale: true,
                        error: error?.message || 'Failed to fetch BTC/USD price'
                    };
                }
            }
        }

        const btcUsd = toNumber(cryptoMarketValue?.bitcoin?.usd);
        if (btcUsd <= 0) {
            return this.error(res, 'BTC/USD price is unavailable. Try again later.', 502);
        }

        const nowDate = new Date(now);

        let unit: 'hour' | 'day' | 'month';
        let endBucket: Date;
        let startBucket: Date;
        let buckets: Date[] = [];

        if (indicator === '24h') {
            unit = 'hour';
            endBucket = alignToHourUtc(nowDate);
            startBucket = addHoursUtc(endBucket, -23);
            for (let i = 0; i < 24; i++) buckets.push(addHoursUtc(startBucket, i));
        } else if (indicator === '1w') {
            unit = 'day';
            endBucket = alignToDayUtc(nowDate);
            startBucket = addDaysUtc(endBucket, -6);
            for (let i = 0; i < 7; i++) buckets.push(addDaysUtc(startBucket, i));
        } else if (indicator === '1m') {
            unit = 'day';
            endBucket = alignToDayUtc(nowDate);
            startBucket = addDaysUtc(endBucket, -29);
            for (let i = 0; i < 30; i++) buckets.push(addDaysUtc(startBucket, i));
        } else {
            unit = 'month';
            endBucket = alignToMonthUtc(nowDate);
            startBucket = addMonthsUtc(endBucket, -11);
            for (let i = 0; i < 12; i++) buckets.push(addMonthsUtc(startBucket, i));
        }

        const tsExpr = `COALESCE(completed_at, updated_at, created_at)::timestamptz`;
        const bucketExpr = `date_trunc('${unit}', ${tsExpr})`;

        const result = await this.tradingOrderRepository.executeRawQuery(
            `SELECT ${bucketExpr} as bucket, COALESCE(SUM(crypto_amount), 0) as crypto_sum
             FROM "${TableNames.TRADING_ORDERS}"
             WHERE status = 'completed'
               AND UPPER(crypto_type) = 'BTC'
               AND ${tsExpr} >= $1::timestamptz
             GROUP BY bucket
             ORDER BY bucket ASC`,
            [startBucket.toISOString()]
        );

        const rows = getRows(result);
        const sumByBucketIso = new Map<string, number>();
        for (const row of rows) {
            const bucketIso = new Date(row.bucket).toISOString();
            sumByBucketIso.set(bucketIso, toNumber(row.crypto_sum));
        }

        const series = buckets.map(b => {
            const iso = bucketKeyIso(b);
            const cryptoSum = sumByBucketIso.get(iso) ?? 0;
            return {
                t: iso,
                value: round2(cryptoSum * btcUsd)
            };
        });

        return this.success(
            res,
            {
                stats_indicator: indicator,
                from: startBucket.toISOString(),
                to: endBucket.toISOString(),
                currency: 'USD',
                btc_usd_used: btcUsd,
                series,
                crypto_market_value_meta: cryptoMeta
            },
            'Earnings graph retrieved successfully'
        );
    }
}

