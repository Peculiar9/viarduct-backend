import axios, { AxiosError, AxiosInstance } from 'axios';
import { injectable } from 'inversify';
import { EnvironmentConfig } from '../../../Config/EnvironmentConfig';
import { Console } from '../../../Utils/Console';
import { ServiceError } from '../../../../Core/Application/Error/AppError';
import { getRedisConnection } from '../../../Queues/redisConnection';
import {
    ReloadlyCardsResponse,
    ReloadlyOrderRequest,
    ReloadlyOrderResponse,
    ReloadlyProductDto,
    ReloadlyProductsResponse,
    ReloadlyTokenResponse
} from './ReloadlyTypes';

const TOKEN_REDIS_KEY = 'reloadly:giftcards:access_token';
const TOKEN_EXPIRY_BUFFER_SECONDS = 60;

interface CachedToken {
    accessToken: string;
    expiresAtMs: number;
}

@injectable()
export class ReloadlyClient {
    private readonly clientId: string;
    private readonly clientSecret: string;
    private readonly audience: string;
    private readonly isSandbox: boolean;
    private readonly http: AxiosInstance;
    private memoryToken: CachedToken | null = null;

    constructor() {
        this.clientId = EnvironmentConfig.get('RELOADLY_CLIENT_ID', '').trim();
        this.clientSecret = EnvironmentConfig.get('RELOADLY_CLIENT_SECRET', '').trim();
        this.isSandbox = EnvironmentConfig.getBoolean('RELOADLY_IS_SANDBOX', true);
        this.audience = EnvironmentConfig.get(
            'RELOADLY_AUDIENCE',
            this.isSandbox
                ? 'https://giftcards-sandbox.reloadly.com'
                : 'https://giftcards.reloadly.com'
        )
            .trim()
            .replace(/\/$/, '');

        this.http = axios.create({
            baseURL: this.audience,
            timeout: 45_000,
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/com.reloadly.giftcards-v1+json'
            }
        });

        Console.info('ReloadlyClient ready', {
            audience: this.audience,
            isSandbox: this.isSandbox,
            hasClientId: Boolean(this.clientId)
        });
    }

    async getProducts(countryCode?: string): Promise<ReloadlyProductDto[]> {
        const products: ReloadlyProductDto[] = [];
        let page = 1;
        const size = 200;
        let totalPages = 1;

        do {
            const params: Record<string, string | number | boolean> = {
                page,
                size,
                includeRange: true,
                includeFixed: true
            };
            if (countryCode) {
                params.countryCode = countryCode.toUpperCase();
            }

            const data = await this.authorizedGet<ReloadlyProductsResponse | ReloadlyProductDto[]>(
                '/products',
                params
            );

            if (Array.isArray(data)) {
                products.push(...data);
                break;
            }

            const batch = data.content ?? [];
            products.push(...batch);
            totalPages = Number(data.totalPages ?? 1);
            page += 1;
        } while (page <= totalPages && page <= 20);

        return products;
    }

    async createOrder(payload: ReloadlyOrderRequest): Promise<ReloadlyOrderResponse> {
        return this.authorizedPost<ReloadlyOrderResponse>('/orders', payload);
    }

    async getOrderCards(transactionId: string | number): Promise<ReloadlyCardsResponse> {
        return this.authorizedGet<ReloadlyCardsResponse>(
            `/orders/transactions/${encodeURIComponent(String(transactionId))}/cards`,
            undefined,
            { Accept: 'application/com.reloadly.giftcards-v2+json' }
        );
    }

    private async authorizedGet<T>(
        path: string,
        params?: Record<string, string | number | boolean>,
        extraHeaders?: Record<string, string>
    ): Promise<T> {
        const token = await this.getAccessToken();
        try {
            const response = await this.http.get<T>(path, {
                params,
                headers: {
                    Authorization: `Bearer ${token}`,
                    ...extraHeaders
                }
            });
            return response.data;
        } catch (error) {
            throw this.wrapError(error, `GET ${path}`);
        }
    }

    private async authorizedPost<T>(path: string, body: unknown): Promise<T> {
        const token = await this.getAccessToken();
        try {
            const response = await this.http.post<T>(path, body, {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            });
            return response.data;
        } catch (error) {
            throw this.wrapError(error, `POST ${path}`);
        }
    }

    private async getAccessToken(): Promise<string> {
        const now = Date.now();
        const cached = await this.readCachedToken();
        if (cached && cached.expiresAtMs > now + TOKEN_EXPIRY_BUFFER_SECONDS * 1000) {
            return cached.accessToken;
        }

        if (!this.clientId || !this.clientSecret) {
            throw new ServiceError('RELOADLY_CLIENT_ID and RELOADLY_CLIENT_SECRET must be configured');
        }

        try {
            const response = await axios.post<ReloadlyTokenResponse>(
                'https://auth.reloadly.com/oauth/token',
                {
                    client_id: this.clientId,
                    client_secret: this.clientSecret,
                    grant_type: 'client_credentials',
                    audience: this.audience
                },
                {
                    headers: { 'Content-Type': 'application/json' },
                    timeout: 30_000
                }
            );

            const accessToken = response.data?.access_token;
            const expiresIn = Number(response.data?.expires_in || 3600);
            if (!accessToken) {
                throw new ServiceError('Reloadly OAuth did not return an access_token');
            }

            const expiresAtMs = Date.now() + Math.max(expiresIn - TOKEN_EXPIRY_BUFFER_SECONDS, 30) * 1000;
            await this.writeCachedToken({ accessToken, expiresAtMs });
            return accessToken;
        } catch (error) {
            throw this.wrapError(error, 'OAuth token');
        }
    }

    private async readCachedToken(): Promise<CachedToken | null> {
        if (this.memoryToken && this.memoryToken.expiresAtMs > Date.now()) {
            return this.memoryToken;
        }

        try {
            if (!process.env.REDIS_HOST) {
                return this.memoryToken;
            }
            const redis = getRedisConnection();
            const raw = await redis.get(TOKEN_REDIS_KEY);
            if (!raw) return null;
            const parsed = JSON.parse(raw) as CachedToken;
            if (parsed?.accessToken && parsed.expiresAtMs > Date.now()) {
                this.memoryToken = parsed;
                return parsed;
            }
        } catch (error: any) {
            Console.warn('ReloadlyClient: Redis token read failed; using memory cache', {
                message: error?.message
            });
        }
        return this.memoryToken;
    }

    private async writeCachedToken(token: CachedToken): Promise<void> {
        this.memoryToken = token;
        try {
            if (!process.env.REDIS_HOST) return;
            const redis = getRedisConnection();
            const ttlSeconds = Math.max(Math.floor((token.expiresAtMs - Date.now()) / 1000), 30);
            await redis.set(TOKEN_REDIS_KEY, JSON.stringify(token), 'EX', ttlSeconds);
        } catch (error: any) {
            Console.warn('ReloadlyClient: Redis token write failed; memory cache only', {
                message: error?.message
            });
        }
    }

    private wrapError(error: unknown, operation: string): Error {
        if (error instanceof ServiceError) return error;
        const axiosError = error as AxiosError<any>;
        const detail =
            axiosError?.response?.data?.message ||
            axiosError?.response?.data?.error_description ||
            axiosError?.response?.data?.error ||
            axiosError?.message ||
            'Unknown Reloadly API error';
        Console.error(axiosError as any, {
            message: `ReloadlyClient::${operation} failed`,
            status: axiosError?.response?.status,
            detail
        });
        return new ServiceError(`Reloadly ${operation} failed: ${detail}`);
    }
}
