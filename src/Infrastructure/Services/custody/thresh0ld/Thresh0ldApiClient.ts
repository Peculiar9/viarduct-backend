import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';
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
    Thresh0ldConsolidateRequest,
    Thresh0ldSendManyRequest,
    Thresh0ldSendManyResponse,
    Thresh0ldSubmitTransactionRequest,
    Thresh0ldSubmitTransactionResponse,
    Thresh0ldTransfer
} from './Thresh0ldTypes';
import {
    encodeBasicAuth,
    loadThresh0ldCredentialPairs,
    Thresh0ldAuthRole,
    Thresh0ldCredentialPair,
    Thresh0ldRequestConfig
} from './Thresh0ldAuth';

/**
 * Thresh0ld API 2.0 client.
 *
 * Auth is HTTP Basic. Each call uses ADMIN, INITIATOR, or SIGNER
 * client_id:client_secret depending on the operation.
 */
@injectable()
export class Thresh0ldApiClient {
    private readonly baseURL: string;
    private readonly pairs: Record<Thresh0ldAuthRole, Thresh0ldCredentialPair>;
    private readonly defaultWalletId: string;
    private readonly autoSubmit: boolean;
    private readonly client: AxiosInstance;

    constructor() {
        this.baseURL = EnvironmentConfig.get(
            'THRESH0LD_BASE_URL',
            'https://vaults-dev.thresh0ld.com'
        )
            .trim()
            .replace(/\/$/, '');

        this.pairs = loadThresh0ldCredentialPairs();
        this.defaultWalletId = EnvironmentConfig.get('THRESH0LD_HOT_WALLET_ID', '').trim();
        this.autoSubmit = EnvironmentConfig.getBoolean('THRESH0LD_AUTO_SUBMIT', true);

        this.client = axios.create({
            baseURL: this.baseURL,
            timeout: 45_000,
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json'
            },
            transformResponse: [
                (data) => {
                    if (data == null || data === '') {
                        return data;
                    }
                    if (typeof data !== 'string') {
                        return data;
                    }
                    try {
                        return JSON.parse(data);
                    } catch {
                        return data;
                    }
                }
            ]
        });

        this.client.interceptors.request.use((config: InternalAxiosRequestConfig) => {
            const role = (config as Thresh0ldRequestConfig).thresh0ldRole;
            if (!role) {
                return Promise.reject(
                    new ServiceError('Thresh0ld request is missing thresh0ldRole (admin|initiator|signer)')
                );
            }
            const pair = this.requirePair(role);
            config.auth = { username: pair.clientId, password: pair.clientSecret };
            return config;
        });

        Console.info('Thresh0ldApiClient ready (API 2.0 role-based Basic auth)', {
            baseURL: this.baseURL,
            hasAdmin: this.hasPair('admin'),
            hasInitiator: this.hasPair('initiator'),
            hasSigner: this.hasPair('signer'),
            hasDefaultWalletId: Boolean(this.defaultWalletId),
            autoSubmit: this.autoSubmit
        });
    }

    /**
     * Map BTC / BTC_TESTNET / ETH / ETH_SEPOLIA onto the env wallet family.
     */
    resolveCoinFamily(coin?: string): 'btc' | 'eth' {
        const normalized = String(coin || '')
            .trim()
            .toLowerCase()
            .replace(/-/g, '_');
        if (
            normalized === 'btc' ||
            normalized === 'btc_testnet' ||
            normalized === 'tbtc' ||
            normalized === 'bitcoin'
        ) {
            return 'btc';
        }
        if (
            normalized === 'eth' ||
            normalized === 'eth_sepolia' ||
            normalized === 'sepolia' ||
            normalized === 'ethereum'
        ) {
            return 'eth';
        }
        throw new ValidationError(`Unsupported Thresh0ld coin: ${coin}`);
    }

    getHotWalletId(coin?: string): string {
        const family = this.resolveCoinFamily(coin);
        const perCoin =
            family === 'btc'
                ? EnvironmentConfig.get('THRESH0LD_HOT_WALLET_ID_BTC', '').trim()
                : EnvironmentConfig.get('THRESH0LD_HOT_WALLET_ID_ETH', '').trim();

        const walletId = perCoin || this.defaultWalletId;
        if (!walletId) {
            throw new ServiceError(
                'THRESH0LD_HOT_WALLET_ID (or THRESH0LD_HOT_WALLET_ID_BTC / _ETH) is not configured'
            );
        }
        return walletId;
    }

    /**
     * User payouts: THRESH0LD_WITHDRAWAL_WALLET_ID_BTC (54751) / _ETH (54752).
     */
    getWithdrawalWalletId(coin?: string): string {
        const family = this.resolveCoinFamily(coin);
        const perCoin =
            family === 'btc'
                ? EnvironmentConfig.get('THRESH0LD_WITHDRAWAL_WALLET_ID_BTC', '').trim()
                : EnvironmentConfig.get('THRESH0LD_WITHDRAWAL_WALLET_ID_ETH', '').trim();

        const walletId =
            perCoin || EnvironmentConfig.get('THRESH0LD_WITHDRAWAL_WALLET_ID', '').trim();
        if (!walletId) {
            throw new ServiceError(
                'THRESH0LD_WITHDRAWAL_WALLET_ID (or THRESH0LD_WITHDRAWAL_WALLET_ID_BTC / _ETH) is not configured'
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
        const payload: Thresh0ldCreateWalletRequest = {
            cloudProvider: 'mpc',
            wallet: {
                coin: coin.toUpperCase(),
                walletType
            }
        };

        const roles: Thresh0ldAuthRole[] = ['admin', 'initiator'];
        let lastError: unknown;
        for (const role of roles) {
            this.assertCredentials(role);
            try {
                const response = await this.client.post<Thresh0ldCreateWalletResponse>(
                    '/api/onboarding/create-wallet',
                    payload,
                    this.requestOptions(role)
                );
                const body = response.data;
                const created = Array.isArray(body?.data) ? body.data[0] : body?.data;
                const walletId =
                    body?.walletId ??
                    created?.walletId ??
                    created?.id ??
                    created?.wallet?.id;

                if (walletId == null || String(walletId).trim() === '') {
                    throw new ServiceError(
                        `Thresh0ld create-wallet returned no walletId. Response: ${JSON.stringify(body)}`
                    );
                }

                Console.info('Thresh0ld create-wallet succeeded', { coin, walletType, role, walletId });
                return { walletId: String(walletId), raw: body };
            } catch (error) {
                lastError = error;
                if (this.isPermissionDenied(error) && role !== roles[roles.length - 1]) {
                    Console.info('Thresh0ld create-wallet permission denied, trying next role', {
                        coin,
                        walletType,
                        role
                    });
                    continue;
                }
                throw this.wrapError(error, 'create-wallet');
            }
        }
        throw this.wrapError(lastError, 'create-wallet');
    }

    async listWallets(coin: string): Promise<unknown> {
        const roles: Thresh0ldAuthRole[] = ['initiator', 'admin'];
        let lastError: unknown;
        for (const role of roles) {
            this.assertCredentials(role);
            try {
                const response = await this.client.post(
                    '/api/wallet/get-list-wallet',
                    { wallet: { coin: coin.toLowerCase() } },
                    this.requestOptions(role)
                );
                return response.data;
            } catch (error) {
                lastError = error;
                if (this.isPermissionDenied(error) && role !== roles[roles.length - 1]) {
                    Console.info('Thresh0ld get-list-wallet unauthorized, trying next role', {
                        coin,
                        role
                    });
                    continue;
                }
                throw this.wrapError(error, 'get-list-wallet');
            }
        }
        throw this.wrapError(lastError, 'get-list-wallet');
    }

    /**
     * Deposit (hot) + withdrawal receive addresses for BTC and ETH.
     * Used by admin to fund vaults. Live from get-list-wallet, matched by env wallet ids.
     */
    async getCustodyVaultOverview(): Promise<{
        network: string;
        btc: {
            deposit: ReturnType<Thresh0ldApiClient['describeConfiguredWallet']>;
            withdrawal: ReturnType<Thresh0ldApiClient['describeConfiguredWallet']>;
        };
        eth: {
            deposit: ReturnType<Thresh0ldApiClient['describeConfiguredWallet']>;
            withdrawal: ReturnType<Thresh0ldApiClient['describeConfiguredWallet']>;
        };
    }> {
        const [btcRows, ethRows] = await Promise.all([
            this.safeListWalletRows('btc'),
            this.safeListWalletRows('eth')
        ]);

        return {
            network: this.baseURL.includes('vaults-dev') ? 'sandbox' : 'production',
            btc: {
                deposit: this.describeConfiguredWallet('btc', 'deposit', btcRows),
                withdrawal: this.describeConfiguredWallet('btc', 'withdrawal', btcRows)
            },
            eth: {
                deposit: this.describeConfiguredWallet('eth', 'deposit', ethRows),
                withdrawal: this.describeConfiguredWallet('eth', 'withdrawal', ethRows)
            }
        };
    }

    private async safeListWalletRows(coin: 'btc' | 'eth'): Promise<any[]> {
        try {
            const listed = (await this.listWallets(coin)) as any;
            if (Array.isArray(listed?.data)) {
                return listed.data;
            }
            if (Array.isArray(listed)) {
                return listed;
            }
            return [];
        } catch (error: any) {
            Console.warn('Thresh0ld list wallets failed while building vault overview', {
                coin,
                message: error?.message
            });
            return [];
        }
    }

    private describeConfiguredWallet(
        coin: 'btc' | 'eth',
        kind: 'deposit' | 'withdrawal',
        rows: any[]
    ): {
        coin: 'BTC' | 'ETH';
        kind: 'deposit' | 'withdrawal';
        wallet_id: string | null;
        address: string | null;
        label: string | null;
        balance: string | null;
    } {
        let walletId: string | null = null;
        try {
            walletId =
                kind === 'deposit' ? this.getHotWalletId(coin) : this.getWithdrawalWalletId(coin);
        } catch {
            walletId = null;
        }

        const match = walletId
            ? rows.find((row) => String(row?.id ?? row?.walletId ?? '') === String(walletId))
            : null;
        const address =
            match?.receiveAddress?.address ||
            match?.walletAddress ||
            match?.walletidentifier ||
            match?.wallet?.walletidentifier ||
            null;

        return {
            coin: coin.toUpperCase() as 'BTC' | 'ETH',
            kind,
            wallet_id: walletId,
            address: address ? String(address) : null,
            label: match?.label ? String(match.label) : match?.wallet?.name ? String(match.wallet.name) : null,
            balance: match?.balanceString != null ? String(match.balanceString) : match?.balance != null ? String(match.balance) : null
        };
    }

    async generateAddress(
        pathIndex: number,
        coin: string
    ): Promise<{ address: string; path: string }> {
        this.assertCredentials('initiator');
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
        const family = this.resolveCoinFamily(coin);
        const walletId = this.getHotWalletId(family);
        const wallet = {
            coin: family,
            walletId: this.toWalletId(walletId),
            allToken: true
        };

        Console.info('Thresh0ld generate-many-address payload', {
            walletId,
            coin: family,
            path: pathIndex
        });
        // MPC deposit addresses are derived locally via generate-many-address.
        // generate-address looks up a BitGo-style Cloud Provider and returns
        // HTTP 500 "Cloud Provider not found" on Thresh0ld MPC orgs.
        try {
            const manyPayload: Thresh0ldGenerateAddressRequest = {
                wallet,
                path: { startIndex: pathIndex, endIndex: pathIndex }
            };
            const response = await this.client.post<Thresh0ldGenerateAddressResponse>(
                '/api/wallet/generate-many-address',
                manyPayload,
                this.requestOptions('initiator')
            );
            const extracted = this.extractGeneratedAddress(response.data, pathIndex);
            if (extracted) {
                return extracted;
            }
        } catch (error) {
            Console.info('Thresh0ld generate-many-address failed, trying generate-address', {
                message: error instanceof Error ? error.message : String(error)
            });
        }

        try {
            const singlePayload: Thresh0ldGenerateAddressRequest = {
                wallet,
                path: pathIndex
            };
            const single = await this.client.post<Thresh0ldGenerateAddressResponse>(
                '/api/wallet/generate-address',
                singlePayload,
                this.requestOptions('initiator')
            );
            const fromSingle = this.extractGeneratedAddress(single.data, pathIndex);
            if (!fromSingle) {
                throw new ServiceError('Thresh0ld generate-address returned no address');
            }
            return fromSingle;
        } catch (error) {
            throw this.wrapError(error, 'generate-address');
        }
    }

    private extractGeneratedAddress(
        body: Thresh0ldGenerateAddressResponse | undefined,
        pathIndex: number
    ): { address: string; path: string } | null {
        const rows = Array.isArray((body as any)?.data)
            ? ((body as any).data as Array<Record<string, unknown>>)
            : [];
        const firstRow = rows[0];
        const nested = (body?.data && !Array.isArray(body.data) ? body.data : firstRow) as
            | Record<string, unknown>
            | undefined;
        const address =
            body?.address ||
            (typeof nested?.address === 'string' ? nested.address : undefined) ||
            (typeof nested?.Address === 'string' ? nested.Address : undefined) ||
            (typeof nested?.depositAddress === 'string' ? nested.depositAddress : undefined);

        if (!address) {
            return null;
        }

        const pathValue =
            body?.path ?? nested?.path ?? (typeof firstRow?.path !== 'undefined' ? firstRow.path : pathIndex);
        return {
            address: String(address),
            path: String(pathValue)
        };
    }

    async sendManyTransaction(params: {
        coin: string;
        targetAddress: string;
        amount: string | number;
        sequenceId?: string;
        walletId?: string;
    }): Promise<{ txHash: string; providerRef?: string; sequenceId: string }> {
        this.assertCredentials('initiator');
        const coin = this.resolveCoinFamily(params.coin);
        const walletId = params.walletId || this.getHotWalletId(coin);
        const sequenceId = params.sequenceId || randomUUID();
        const amountString = this.toPositiveDecimalString(params.amount, coin === 'btc' ? 8 : 18);

        const payload: Thresh0ldSendManyRequest = {
            wallet: {
                coin
            },
            transactions: {
                recipientsData: {
                    recipients: [
                        {
                            address: String(params.targetAddress || '').trim(),
                            amount: amountString
                        }
                    ],
                    sequenceId
                }
            }
        };

        try {
            const path = `/api/v2/wallets/${encodeURIComponent(walletId)}/send-many-transaction-request`;
            Console.info('Thresh0ld send-many-transaction-request payload', {
                url: `${this.baseURL}${path}`,
                authRole: 'initiator',
                walletId,
                body: payload
            });
            const body = await this.postJsonWithBasicAuth<Thresh0ldSendManyResponse>(path, payload, {
                role: 'initiator'
            });
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
            const axiosError = error as AxiosError<any>;
            Console.error(axiosError as any, {
                message: 'Thresh0ld send-many-transaction-request rejected',
                httpStatus: axiosError?.response?.status,
                walletId,
                coin,
                targetAddress: params.targetAddress,
                amount: amountString,
                sequenceId,
                thresh0ldResponse: axiosError?.response?.data ?? null
            });
            throw this.wrapError(error, 'send-many-transaction-request');
        }
    }

    /**
     * Outbound dispensation from the withdrawal vault to an external user address.
     * POST /api/v2/wallets/{walletId}/consolidate-transaction-request
     */
    async consolidateTransaction(params: {
        coin: string;
        targetAddress: string;
        walletId?: string;
    }): Promise<{ txHash: string; providerRef?: string }> {
        this.assertCredentials('initiator');
        const coin = params.coin.toLowerCase();
        const walletId = params.walletId || this.getWithdrawalWalletId(coin);
        const targetAddress = String(params.targetAddress || '').trim();
        if (!targetAddress) {
            throw new ValidationError('targetAddress is required for consolidate-transaction-request');
        }

        const payload: Thresh0ldConsolidateRequest = {
            wallet: {
                coin
            },
            transactions: {
                consolidateOptions: {
                    targetAddress
                }
            }
        };

        try {
            Console.info('Thresh0ld consolidate-transaction-request payload', {
                walletId,
                coin,
                targetAddress
            });
            const response = await this.client.post<Thresh0ldSendManyResponse>(
                `/api/v2/wallets/${encodeURIComponent(walletId)}/consolidate-transaction-request`,
                payload,
                this.requestOptions('initiator')
            );

            const body = response.data;
            const created = Array.isArray(body?.data) ? (body.data as any)[0] : body?.data;
            let txHash =
                body?.txHash ||
                body?.txid ||
                created?.txHash ||
                created?.txid ||
                created?.transactionId ||
                created?.id ||
                created?.sequenceId ||
                body?.sequenceId ||
                body?.id;

            if (this.autoSubmit) {
                try {
                    const submitted = await this.submitTransaction(coin, walletId);
                    txHash = submitted.txHash || submitted.providerRef || txHash;
                } catch (submitError: any) {
                    Console.warn('Thresh0ldApiClient: consolidate auto-submit failed', {
                        walletId,
                        coin,
                        message: submitError?.message
                    });
                }
            }

            if (!txHash) {
                throw new ServiceError('Thresh0ld consolidate-transaction-request returned no id');
            }

            return {
                txHash: String(txHash),
                providerRef: created?.sequenceId != null ? String(created.sequenceId) : String(txHash)
            };
        } catch (error) {
            const axiosError = error as AxiosError<any>;
            Console.error(axiosError as any, {
                message: 'Thresh0ld consolidate-transaction-request rejected',
                httpStatus: axiosError?.response?.status,
                walletId,
                coin,
                targetAddress,
                thresh0ldResponse: axiosError?.response?.data ?? null
            });
            throw this.wrapError(error, 'consolidate-transaction-request');
        }
    }

    async submitTransaction(
        coin: string,
        walletId?: string
    ): Promise<{ txHash?: string; providerRef?: string }> {
        this.assertCredentials('signer');
        const id = walletId || this.getHotWalletId(coin);
        const payload: Thresh0ldSubmitTransactionRequest = {
            wallet: { coin: coin.toLowerCase() }
        };

        try {
            const response = await this.client.post<Thresh0ldSubmitTransactionResponse>(
                `/api/v2/wallets/${encodeURIComponent(id)}/submit-transaction`,
                payload,
                this.requestOptions('signer')
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
        this.assertCredentials('admin');
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
                ...this.requestOptions('admin')
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
        this.assertCredentials('initiator');
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
                ...this.requestOptions('initiator'),
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
        this.assertCredentials('admin');
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
                    ...this.requestOptions('admin'),
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

    private toPositiveDecimalString(raw: string | number, maxFractionDigits: number): string {
        const source = typeof raw === 'string' ? raw.trim() : '';
        const numeric = Number(source || raw);
        if (!Number.isFinite(numeric) || !(numeric > 0)) {
            throw new ValidationError('Thresh0ld withdrawal amount must be a positive number');
        }

        if (/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(source) && Number(source) > 0) {
            const [whole, fraction = ''] = source.split('.');
            const trimmedFraction = fraction.slice(0, maxFractionDigits).replace(/0+$/, '');
            return trimmedFraction.length > 0 ? `${whole}.${trimmedFraction}` : `${whole}.0`;
        }

        const fixed = numeric.toFixed(maxFractionDigits).replace(/0+$/, '').replace(/\.$/, '');
        return fixed.includes('.') ? fixed : `${fixed}.0`;
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

    private requestOptions(
        role: Thresh0ldAuthRole,
        extra?: Thresh0ldRequestConfig
    ): Thresh0ldRequestConfig {
        return {
            ...extra,
            thresh0ldRole: role
        };
    }

    private hasPair(role: Thresh0ldAuthRole): boolean {
        const pair = this.pairs[role];
        return Boolean(pair?.clientId && pair?.clientSecret);
    }

    private requirePair(role: Thresh0ldAuthRole): Thresh0ldCredentialPair {
        const pair = this.pairs[role];
        if (!pair?.clientId || !pair?.clientSecret) {
            throw new ServiceError(
                `Thresh0ld ${role} credentials are missing. Set THRESH0LD_${role.toUpperCase()}_CLIENT_ID and THRESH0LD_${role.toUpperCase()}_CLIENT_SECRET`
            );
        }
        return pair;
    }

    private authHeaders(role: Thresh0ldAuthRole): Record<string, string> {
        const pair = this.requirePair(role);
        return {
            Authorization: `Basic ${encodeBasicAuth(pair)}`,
            'Content-Type': 'application/json',
            Accept: 'application/json'
        };
    }

    /**
     * fetch() path for send-many so the body is JSON.stringified exactly once.
     */
    private async postJsonWithBasicAuth<T>(
        path: string,
        payload: unknown,
        options: { role: Thresh0ldAuthRole }
    ): Promise<T> {
        const url = `${this.baseURL}${path}`;
        const bodyText = JSON.stringify(payload);
        const response = await fetch(url, {
            method: 'POST',
            headers: this.authHeaders(options.role),
            body: bodyText
        });
        const raw = await response.text();
        const parsed = this.parseThresh0ldBody(raw);
        if (!response.ok) {
            const errorMessage =
                typeof parsed === 'string' ? parsed : this.formatThresh0ldErrorBody(parsed) || raw;
            throw new ServiceError(
                `Thresh0ld API error (HTTP ${response.status}): ${errorMessage}`.slice(0, 2000)
            );
        }
        return parsed as T;
    }

    private parseThresh0ldBody(raw: string): unknown {
        if (raw == null || raw === '') {
            return {};
        }
        const trimmed = raw.trim();
        try {
            return JSON.parse(trimmed);
        } catch {
            return trimmed;
        }
    }

    private assertCredentials(role: Thresh0ldAuthRole): void {
        this.requirePair(role);
    }

    private toWalletId(walletId: string): number | string {
        const asNumber = Number(walletId);
        return Number.isFinite(asNumber) && String(asNumber) === walletId ? asNumber : walletId;
    }

    private isPermissionDenied(error: unknown): boolean {
        const axiosError = error as AxiosError<any>;
        const status = axiosError?.response?.status;
        const body = axiosError?.response?.data;
        const text = typeof body === 'string' ? body : this.formatThresh0ldErrorBody(body);
        const message = `${axiosError?.message || ''} ${text}`.toLowerCase();
        return (
            status === 401 ||
            status === 403 ||
            /access_denied|required permission|not have the required permission|unauthorized|forbidden/i.test(
                message
            )
        );
    }

    private wrapError(error: unknown, operation: string): Error {
        if (error instanceof ServiceError || error instanceof ValidationError) {
            return error;
        }
        const axiosError = error as AxiosError<any>;
        const status = axiosError?.response?.status;
        const body = axiosError?.response?.data;
        const detail = this.formatThresh0ldErrorBody(body) || axiosError?.message || 'Unknown Thresh0ld API error';

        Console.error(axiosError as any, {
            message: `Thresh0ldApiClient::${operation} failed`,
            status,
            thresh0ldResponse: body ?? null
        });

        const statusPart = status ? ` HTTP ${status}` : '';
        return new ServiceError(`Thresh0ld ${operation} failed:${statusPart} ${detail}`);
    }

    private formatThresh0ldErrorBody(data: unknown): string {
        if (data == null || data === '') {
            return '';
        }
        if (typeof data === 'string') {
            return data.slice(0, 2000);
        }
        if (typeof data === 'object') {
            const record = data as Record<string, any>;
            const nested =
                record.message ||
                record.error ||
                record.detail ||
                record.reason ||
                record.errorMessage ||
                record.msg ||
                record.data?.message ||
                record.data?.error;
            try {
                const serialized = JSON.stringify(data);
                if (nested && typeof nested === 'string') {
                    if (/Unexpected token ['"]Y['"]/i.test(nested) || /Your API k/i.test(nested)) {
                        return (
                            'Thresh0ld returned a plain-text API key error (not JSON). ' +
                            'Check the ADMIN/INITIATOR/SIGNER client id and secret for this operation. ' +
                            nested
                        ).slice(0, 2000);
                    }
                    return `${nested} | ${serialized}`.slice(0, 2000);
                }
                return serialized.slice(0, 2000);
            } catch {
                return String(nested || data);
            }
        }
        return String(data);
    }
}
