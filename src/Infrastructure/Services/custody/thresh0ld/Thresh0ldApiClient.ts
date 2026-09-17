import axios, { AxiosInstance, AxiosError } from 'axios';
import { randomUUID } from 'crypto';
import { injectable } from 'inversify';
import { EnvironmentConfig } from '../../../Config/EnvironmentConfig';
import { Console } from '../../../Utils/Console';
import { ServiceError, ValidationError } from '../../../../Core/Application/Error/AppError';
import {
    THRESH0LD_ADDRESS_INDEX_BATCH_SIZE,
    Thresh0ldCreateWalletRequest,
    Thresh0ldCreateWalletResponse,
    Thresh0ldGenerateAddressRequest,
    Thresh0ldGenerateAddressResponse,
    Thresh0ldSendManyRequest,
    Thresh0ldSendManyResponse,
    Thresh0ldSubmitTransactionRequest,
    Thresh0ldSubmitTransactionResponse
} from './Thresh0ldTypes';

/**
 * Thresh0ld API 2.0 client.
 *
 * Auth is HTTP Basic with client_id:client_secret on every request.
 * There is no OAuth access-token round-trip / expiry — the Basic credential
 * is long-lived until you rotate client credentials in the dashboard.
 */
@injectable()
export class Thresh0ldApiClient {
    private readonly baseURL: string;
    private readonly clientId: string;
    private readonly clientSecret: string;
    private readonly defaultWalletId: string;
    private readonly autoSubmit: boolean;
    private readonly client: AxiosInstance;
    private readonly basicAuthHeader: string;

    constructor() {
        this.baseURL = EnvironmentConfig.get(
            'THRESH0LD_BASE_URL',
            'https://vaults-dev.thresh0ld.com'
        )
            .trim()
            .replace(/\/$/, '');

        this.clientId = EnvironmentConfig.get('THRESH0LD_CLIENT_ID', '').trim();
        this.clientSecret = EnvironmentConfig.get('THRESH0LD_CLIENT_SECRET', '').trim();

        // Backward-compat: older ADMIN/INITIATOR keys can still seed client credentials
        if (!this.clientId) {
            this.clientId = EnvironmentConfig.get('THRESH0LD_ADMIN_API_KEY', '').trim();
        }
        if (!this.clientSecret) {
            this.clientSecret =
                EnvironmentConfig.get('THRESH0LD_INITIATOR_API_KEY', '').trim() ||
                EnvironmentConfig.get('THRESH0LD_ADMIN_API_KEY', '').trim();
        }

        this.defaultWalletId = EnvironmentConfig.get('THRESH0LD_HOT_WALLET_ID', '').trim();
        this.autoSubmit = EnvironmentConfig.getBoolean('THRESH0LD_AUTO_SUBMIT', true);

        this.basicAuthHeader = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString(
            'base64'
        );

        this.client = axios.create({
            baseURL: this.baseURL,
            timeout: 45_000,
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json'
            }
        });

        Console.info('Thresh0ldApiClient ready (API 2.0 Basic auth)', {
            baseURL: this.baseURL,
            hasClientId: Boolean(this.clientId),
            hasClientSecret: Boolean(this.clientSecret),
            hasDefaultWalletId: Boolean(this.defaultWalletId),
            autoSubmit: this.autoSubmit
        });
    }

    getHotWalletId(coin?: string): string {
        const normalized = (coin || '').toLowerCase();
        const perCoin =
            normalized === 'btc'
                ? EnvironmentConfig.get('THRESH0LD_HOT_WALLET_ID_BTC', '').trim()
                : normalized === 'eth'
                  ? EnvironmentConfig.get('THRESH0LD_HOT_WALLET_ID_ETH', '').trim()
                  : '';

        const walletId = perCoin || this.defaultWalletId;
        if (!walletId) {
            throw new ServiceError(
                'THRESH0LD_HOT_WALLET_ID (or THRESH0LD_HOT_WALLET_ID_BTC / _ETH) is not configured'
            );
        }
        return walletId;
    }

    /**
     * One-time setup: create a Thresh0ld MPC wallet for a coin.
     * Endpoint: POST /api/onboarding/create-wallet
     * Auth: client_id + client_secret only (HTTP Basic).
     */
    async createWallet(
        coin: string,
        walletType: 'deposit' | 'withdrawal' | string = 'deposit'
    ): Promise<{ walletId: string; raw: Thresh0ldCreateWalletResponse }> {
        this.assertCredentials();
        const payload: Thresh0ldCreateWalletRequest = {
            cloudProvider: 'mpc',
            wallet: {
                coin: coin.toLowerCase(),
                walletType
            }
        };

        try {
            const response = await this.client.post<Thresh0ldCreateWalletResponse>(
                '/api/onboarding/create-wallet',
                payload,
                { headers: this.authHeaders() }
            );
            const body = response.data;
            const walletId =
                body?.walletId ??
                body?.data?.walletId ??
                body?.data?.id ??
                (body?.data as any)?.wallet?.walletId ??
                (body?.data as any)?.wallet?.id;

            if (walletId == null || String(walletId).trim() === '') {
                throw new ServiceError(
                    `Thresh0ld create-wallet returned no walletId. Response: ${JSON.stringify(body)}`
                );
            }

            return { walletId: String(walletId), raw: body };
        } catch (error) {
            throw this.wrapError(error, 'create-wallet');
        }
    }

    async listWallets(coin: string): Promise<unknown> {
        this.assertCredentials();
        try {
            const response = await this.client.post(
                '/api/wallet/get-list-wallet',
                { wallet: { coin: coin.toLowerCase() } },
                { headers: this.authHeaders() }
            );
            return response.data;
        } catch (error) {
            throw this.wrapError(error, 'get-list-wallet');
        }
    }

    async generateAddress(
        pathIndex: number,
        coin: string
    ): Promise<{ address: string; path: string }> {
        this.assertCredentials();
        // Thresh0ld MPC watcher only indexes HD sub-addresses in batches of 40_000 (0..39999).
        if (
            !Number.isInteger(pathIndex) ||
            pathIndex < 0 ||
            pathIndex >= THRESH0LD_ADDRESS_INDEX_BATCH_SIZE
        ) {
            throw new ServiceError(
                `Derivation index ${pathIndex} out of initial Thresh0ld batch index range (0-${THRESH0LD_ADDRESS_INDEX_BATCH_SIZE - 1}).`
            );
        }
        const walletId = this.getHotWalletId(coin);
        const payload: Thresh0ldGenerateAddressRequest = {
            wallet: {
                coin: coin.toLowerCase(),
                walletId: this.toWalletId(walletId),
                allToken: true
            },
            path: pathIndex
        };

        try {
            const response = await this.client.post<Thresh0ldGenerateAddressResponse>(
                '/api/wallet/generate-address',
                payload,
                { headers: this.authHeaders() }
            );
            const body = response.data;
            const address =
                body?.address ||
                body?.data?.address ||
                (body?.data as any)?.Address ||
                (body?.data as any)?.depositAddress;

            if (!address) {
                throw new ServiceError('Thresh0ld generate-address returned no address');
            }

            const pathValue = body?.path ?? body?.data?.path ?? pathIndex;
            return {
                address: String(address),
                path: String(pathValue)
            };
        } catch (error) {
            throw this.wrapError(error, 'generate-address');
        }
    }

    async sendManyTransaction(params: {
        coin: string;
        targetAddress: string;
        amount: string | number;
        sequenceId?: string;
    }): Promise<{ txHash: string; providerRef?: string; sequenceId: string }> {
        this.assertCredentials();
        const coin = params.coin.toLowerCase();
        const walletId = this.getHotWalletId(coin);
        const sequenceId = params.sequenceId || randomUUID();
        const amount =
            typeof params.amount === 'number' ? params.amount : Number(params.amount);

        if (!Number.isFinite(amount) || !(amount > 0)) {
            throw new ValidationError('Thresh0ld withdrawal amount must be a positive number');
        }

        const payload: Thresh0ldSendManyRequest = {
            wallet: {
                coin
            },
            transactions: {
                recipientsData: {
                    recipients: [
                        {
                            address: params.targetAddress,
                            amount
                        }
                    ],
                    sequenceId
                }
            }
        };

        try {
            const response = await this.client.post<Thresh0ldSendManyResponse>(
                `/api/v2/wallets/${encodeURIComponent(walletId)}/send-many-transaction-request`,
                payload,
                { headers: this.authHeaders() }
            );

            const body = response.data;
            let txHash =
                body?.txHash ||
                body?.txid ||
                body?.data?.txHash ||
                body?.data?.txid ||
                body?.data?.transactionId ||
                body?.data?.id ||
                body?.data?.sequenceId ||
                body?.sequenceId ||
                sequenceId;

            if (this.autoSubmit) {
                try {
                    const submitted = await this.submitTransaction(coin, walletId);
                    txHash =
                        submitted.txHash ||
                        submitted.providerRef ||
                        txHash;
                } catch (submitError: any) {
                    // Request may already queue under policy; keep sequenceId as reference
                    Console.warn('Thresh0ldApiClient: auto-submit failed; using sequenceId', {
                        sequenceId,
                        message: submitError?.message
                    });
                }
            }

            if (!txHash) {
                throw new ServiceError('Thresh0ld send-many-transaction-request returned no id');
            }

            return {
                txHash: String(txHash),
                providerRef: String(body?.data?.sequenceId || sequenceId),
                sequenceId
            };
        } catch (error) {
            throw this.wrapError(error, 'send-many-transaction-request');
        }
    }

    async submitTransaction(
        coin: string,
        walletId?: string
    ): Promise<{ txHash?: string; providerRef?: string }> {
        this.assertCredentials();
        const id = walletId || this.getHotWalletId(coin);
        const payload: Thresh0ldSubmitTransactionRequest = {
            wallet: { coin: coin.toLowerCase() }
        };

        try {
            const response = await this.client.post<Thresh0ldSubmitTransactionResponse>(
                `/api/v2/wallets/${encodeURIComponent(id)}/submit-transaction`,
                payload,
                { headers: this.authHeaders() }
            );
            const body = response.data;
            const txHash =
                body?.data?.txHash ||
                body?.data?.txid ||
                body?.data?.transactionId ||
                body?.data?.sequenceId ||
                body?.data?.id;
            return {
                txHash: txHash != null ? String(txHash) : undefined,
                providerRef: body?.data?.sequenceId != null ? String(body.data.sequenceId) : undefined
            };
        } catch (error) {
            throw this.wrapError(error, 'submit-transaction');
        }
    }

    private authHeaders(): Record<string, string> {
        return {
            Authorization: `Basic ${this.basicAuthHeader}`
        };
    }

    private assertCredentials(): void {
        if (!this.clientId || !this.clientSecret) {
            throw new ServiceError(
                'THRESH0LD_CLIENT_ID and THRESH0LD_CLIENT_SECRET must be configured'
            );
        }
    }

    private toWalletId(walletId: string): number | string {
        const asNumber = Number(walletId);
        return Number.isFinite(asNumber) && String(asNumber) === walletId ? asNumber : walletId;
    }

    private wrapError(error: unknown, operation: string): Error {
        if (error instanceof ServiceError || error instanceof ValidationError) {
            return error;
        }
        const axiosError = error as AxiosError<any>;
        const status = axiosError?.response?.status;
        const detail =
            axiosError?.response?.data?.message ||
            axiosError?.response?.data?.data?.message ||
            axiosError?.response?.data?.detail ||
            axiosError?.response?.data?.error ||
            axiosError?.message ||
            'Unknown Thresh0ld API error';

        Console.error(axiosError as any, {
            message: `Thresh0ldApiClient::${operation} failed`,
            status,
            detail
        });

        return new ServiceError(`Thresh0ld ${operation} failed: ${detail}`);
    }
}
