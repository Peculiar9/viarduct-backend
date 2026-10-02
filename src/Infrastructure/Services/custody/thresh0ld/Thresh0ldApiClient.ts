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
    Thresh0ldSubmitTransactionResponse,
    Thresh0ldTransfer
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

    async getWalletBalance(coin: string): Promise<number> {
        this.assertCredentials();
        const normalized = coin.toLowerCase();
        const walletId = this.getHotWalletId(normalized);
        const payload = {
            wallet: {
                coin: normalized,
                walletId: this.toWalletId(walletId),
                allToken: true
            }
        };

        try {
            const response = await this.client.post('/api/wallet/balance', payload, {
                headers: this.authHeaders()
            });
            const balance = this.extractBalance(response.data);
            if (!Number.isFinite(balance) || balance < 0) {
                throw new ServiceError(
                    `Thresh0ld wallet balance missing or invalid. Response: ${JSON.stringify(response.data)}`
                );
            }
            return balance;
        } catch (error) {
            throw this.wrapError(error, 'wallet-balance');
        }
    }

    async getApproxFees(coin: string): Promise<number> {
        this.assertCredentials();
        const normalized = coin.toLowerCase();
        const walletId = this.getHotWalletId(normalized);
        const payload = {
            wallet: {
                coin: normalized,
                walletId: this.toWalletId(walletId)
            }
        };

        try {
            const response = await this.client.post('/api/wallet/get-approx-fees', payload, {
                headers: this.authHeaders(),
                timeout: 8_000
            });
            const fee = this.extractApproxFee(response.data, normalized);
            if (!Number.isFinite(fee) || !(fee > 0)) {
                throw new ServiceError(
                    `Thresh0ld get-approx-fees returned no usable fee. Response: ${JSON.stringify(response.data)}`
                );
            }
            return fee;
        } catch (error) {
            throw this.wrapError(error, 'get-approx-fees');
        }
    }

    async getTransferList(coin: string, maxPages: number = 5, pageSize: number = 50): Promise<Thresh0ldTransfer[]> {
        this.assertCredentials();
        const normalized = coin.toLowerCase();
        const walletId = this.getHotWalletId(normalized);
        const collected: Thresh0ldTransfer[] = [];
        const pages = Math.max(1, Math.min(maxPages, 20));
        const size = Math.max(1, Math.min(pageSize, 100));

        for (let pageNumber = 1; pageNumber <= pages; pageNumber++) {
            const payload = {
                wallet: {
                    coin: normalized,
                    walletId: this.toWalletId(walletId)
                },
                pagination: {
                    pageNumber,
                    pageSize: size
                }
            };

            try {
                const response = await this.client.post('/api/wallet/get-transfer-list', payload, {
                    headers: this.authHeaders(),
                    timeout: 15_000
                });
                const rows = this.extractTransferRows(response.data);
                if (!rows.length) {
                    break;
                }
                collected.push(...rows);
                if (rows.length < size) {
                    break;
                }
            } catch (error) {
                throw this.wrapError(error, 'get-transfer-list');
            }
        }

        return collected;
    }

    private extractTransferRows(body: any): Thresh0ldTransfer[] {
        const nested = [
            body?.transfers,
            body?.transferList,
            body?.list,
            body?.items,
            body?.transactions,
            body?.data?.transfers,
            body?.data?.transferList,
            body?.data?.transactionList,
            body?.data?.list,
            body?.data?.items,
            body?.data?.transactions,
            body?.data?.content,
            body?.data?.records,
            body?.data?.data,
            body?.wallet?.transfers,
            Array.isArray(body?.data) ? body.data : null,
            Array.isArray(body) ? body : null
        ];

        const rawRows = nested.find((value) => Array.isArray(value) && value.length) as unknown[] | undefined;
        if (!rawRows?.length) {
            Console.info('Thresh0ld get-transfer-list returned no parseable rows', {
                topKeys: body && typeof body === 'object' ? Object.keys(body) : []
            });
            return [];
        }

        const flattened = this.unwrapNestedTransactionArrays(rawRows);
        return flattened.map((row) => this.mapTransfer(row)).filter((row) => Boolean(row.txHash));
    }

    private unwrapNestedTransactionArrays(rows: unknown[]): unknown[] {
        const first = (rows[0] ?? {}) as Record<string, any>;
        if (Array.isArray(first.transactions)) {
            return rows.flatMap((row) => {
                const item = row as Record<string, any>;
                return Array.isArray(item?.transactions) ? item.transactions : [row];
            });
        }
        if (first.value && typeof first.value === 'object' && !first.txid && !first.txHash && !first.txId) {
            return rows.map((row) => {
                const item = row as Record<string, any>;
                return { ...item.value, sequenceId: item.sequenceId, type: item.type || item.value?.type };
            });
        }
        return rows;
    }

    private mapTransfer(raw: unknown): Thresh0ldTransfer {
        const row = (raw ?? {}) as Record<string, any>;
        const nested = (row.data && typeof row.data === 'object' && !Array.isArray(row.data)
            ? row.data
            : {}) as Record<string, any>;
        const value = (row.value && typeof row.value === 'object' ? row.value : {}) as Record<string, any>;
        const input = (row.input && typeof row.input === 'object'
            ? row.input
            : value.input && typeof value.input === 'object'
              ? value.input
              : {}) as Record<string, any>;
        const outputs = this.asObjectArray(row.outputs || row.output || value.outputs || value.output || nested.outputs);
        const inputs = this.asObjectArray(row.inputs || value.inputs || nested.inputs);
        const outputAddresses = outputs
            .map((item) => this.optionalAddress(item.address))
            .filter((address): address is string => Boolean(address));
        const txReq = (row.txReq && typeof row.txReq === 'object' ? row.txReq : {}) as Record<string, any>;

        const txHash = String(
            row.txHash ||
                row.txid ||
                row.txId ||
                row.transactionHash ||
                row.transactionId ||
                txReq.identifier ||
                nested.txHash ||
                nested.txid ||
                nested.txId ||
                nested.transactionHash ||
                value.transactionHash ||
                ''
        ).trim();

        const amountRaw =
            row.baseValue ??
            row.value ??
            row.valueString ??
            row.amount ??
            outputs[0]?.amount ??
            outputs[0]?.valueUnitAmount ??
            input.amount ??
            row.coinAmount ??
            row.quantity ??
            nested.amount ??
            nested.value ??
            nested.coinAmount;

        const type = String(
            row.type ||
                row.transferType ||
                row.txType ||
                input.type ||
                nested.type ||
                nested.transferType ||
                value.type ||
                ''
        ).trim();

        const receiveAddress =
            type.toLowerCase().includes('receive') || type.toLowerCase().includes('incoming')
                ? this.optionalAddress(input.address) || outputAddresses[0] || null
                : outputAddresses[0] || this.optionalAddress(row.destinationAddress) || null;

        const timestamps = (row.timestamps && typeof row.timestamps === 'object' ? row.timestamps : {}) as Record<
            string,
            unknown
        >;

        return {
            txHash,
            amount: Number(amountRaw),
            toAddress: this.optionalAddress(
                receiveAddress ||
                    row.toAddress ||
                    row.to ||
                    row.destinationAddress ||
                    nested.toAddress ||
                    nested.to ||
                    row.address ||
                    nested.address
            ),
            fromAddress: this.optionalAddress(
                inputs[0]?.address || row.fromAddress || row.from || row.sourceAddress || nested.fromAddress || nested.from
            ),
            type,
            status: String(row.status ?? row.state ?? nested.status ?? nested.state ?? '').trim(),
            confirmations: this.optionalNumber(
                row.blockConfirmations ??
                    row.confirmations ??
                    row.confirmation ??
                    nested.confirmations ??
                    nested.confirmation
            ),
            completedAt: timestamps.completedAt ? String(timestamps.completedAt) : null,
            outputAddresses
        };
    }

    private asObjectArray(value: unknown): Record<string, any>[] {
        if (!Array.isArray(value)) {
            return [];
        }
        return value.filter((item) => item && typeof item === 'object') as Record<string, any>[];
    }

    private optionalAddress(value: unknown): string | null {
        if (value === undefined || value === null || value === '') {
            return null;
        }
        return String(value).trim();
    }

    private optionalNumber(value: unknown): number | null {
        if (value === undefined || value === null || value === '') {
            return null;
        }
        const num = Number(value);
        return Number.isFinite(num) ? num : null;
    }

    private extractApproxFee(body: any, coin: string): number {
        const candidates = [
            body?.fee,
            body?.approxFee,
            body?.feeAmount,
            body?.networkFee,
            body?.estimatedFee,
            body?.data?.fee,
            body?.data?.approxFee,
            body?.data?.feeAmount,
            body?.data?.networkFee,
            body?.data?.estimatedFee,
            body?.data?.approx_fee,
            body?.data?.gasFee,
            body?.data?.feeCrypto,
            body?.wallet?.fee
        ];
        for (const value of candidates) {
            const num = typeof value === 'string' ? Number(value) : Number(value);
            if (Number.isFinite(num) && num > 0) {
                return this.normalizeFeeUnits(num, coin);
            }
        }
        return Number.NaN;
    }

    private normalizeFeeUnits(fee: number, coin: string): number {
        if (coin === 'btc' && fee >= 1000) {
            return fee / 100_000_000;
        }
        if (coin === 'eth' && fee >= 1e9) {
            return fee / 1e18;
        }
        return fee;
    }

    private extractBalance(body: any): number {
        const candidates = [
            body?.balance,
            body?.confirmedBalance,
            body?.spendableBalance,
            body?.availableBalance,
            body?.nativeBalance,
            body?.data?.balance,
            body?.data?.confirmedBalance,
            body?.data?.spendableBalance,
            body?.data?.availableBalance,
            body?.data?.nativeBalance,
            body?.data?.coinBalance,
            body?.wallet?.balance,
            body?.data?.wallet?.balance,
            body?.data?.balances?.native,
            body?.data?.balance?.confirmed,
            body?.data?.balance?.spendable
        ];
        for (const value of candidates) {
            const num = typeof value === 'string' ? Number(value) : Number(value);
            if (Number.isFinite(num) && num >= 0) {
                return num;
            }
        }
        return Number.NaN;
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
