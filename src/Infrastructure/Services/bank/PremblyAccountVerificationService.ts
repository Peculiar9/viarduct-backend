import axios, { AxiosInstance } from 'axios';
import { injectable } from 'inversify';
import { EnvironmentConfig } from '../../Config/EnvironmentConfig';
import { Console } from '../../Utils/Console';
import { ServiceError, ValidationError } from '../../../Core/Application/Error/AppError';
import {
    IAccountVerificationService,
    AccountResolveResult,
    BanksListResult,
    BankListItem
} from '../../../Core/Application/Interface/Services/IAccountVerificationService';

type PremblyBankAccountResponse = {
    status?: boolean;
    detail?: string;
    message?: string;
    response_code?: string;
    'account data'?: {
        account_number?: string;
        account_name?: string;
        bank_id?: number;
    };
    account_data?: {
        account_number?: string;
        account_name?: string;
        bank_id?: number;
    };
};

type PremblyBanksResponse = {
    status?: boolean;
    message?: string;
    detail?: string;
    response_code?: string;
    data?: Array<{
        id?: number;
        name?: string;
        code?: string;
        longcode?: string;
        active?: boolean;
        is_deleted?: boolean;
    }>;
};

@injectable()
export class PremblyAccountVerificationService implements IAccountVerificationService {
    private readonly client: AxiosInstance;
    private banksCache: BankListItem[] | null = null;
    private banksCacheAt = 0;
    private static readonly BANKS_CACHE_TTL_MS = 60 * 60 * 1000;

    constructor() {
        const baseURL = EnvironmentConfig.get('PREMBLY_BASE_URL', 'https://api.prembly.com').trim();
        const apiKey = EnvironmentConfig.get('PREMBLY_API_KEY', '').trim();

        if (!apiKey) {
            throw new ServiceError('Prembly config missing: set PREMBLY_API_KEY');
        }

        const appId = EnvironmentConfig.get('PREMBLY_APP_ID', '').trim();
        this.client = axios.create({
            baseURL,
            timeout: 30_000,
            headers: {
                'x-api-key': apiKey,
                'content-type': 'application/json'
            }
        });

        // Ignore placeholder / empty app ids — a fake app-id makes Prembly return "System error occurred"
        const looksLikePlaceholder =
            !appId ||
            /^your[_-]?app[_-]?id/i.test(appId) ||
            appId.toLowerCase() === 'changeme';
        if (!looksLikePlaceholder) {
            this.client.defaults.headers.common['app-id'] = appId;
        }

        Console.info('PremblyAccountVerificationService ready', {
            baseURL,
            hasAppId: !looksLikePlaceholder
        });
    }

    async verifyAccountNumber(accountNumber: string, bankCode: string): Promise<AccountResolveResult> {
        const normalizedAccount = this.normalizeAccountNumber(accountNumber);
        const normalizedBankCode = await this.resolveBankCode(bankCode);
        const bank = await this.findBank(normalizedBankCode);

        try {
            Console.info('PremblyAccountVerificationService::verifyAccountNumber', {
                bank_code: normalizedBankCode,
                account_suffix: normalizedAccount.slice(-4)
            });

            const response = await this.client.post<PremblyBankAccountResponse>(
                '/verification/bank_account/basic',
                {
                    number: normalizedAccount,
                    bank_code: normalizedBankCode
                }
            );

            const body = response.data as PremblyBankAccountResponse & Record<string, any>;
            const accountData = this.extractAccountData(body);
            const ok = this.isVerificationSuccess(body) && !!accountData?.account_name;

            if (!ok) {
                Console.warn('PremblyAccountVerificationService: unexpected response shape', {
                    status: body?.status,
                    response_code: body?.response_code,
                    detail: body?.detail || body?.message,
                    keys: body && typeof body === 'object' ? Object.keys(body) : []
                });
                throw new ValidationError(
                    this.resolveErrorMessage(
                        this.isVerificationSuccess(body)
                            ? 'Could not read account name from Prembly response'
                            : body.detail || body.message || 'Could not verify bank account'
                    )
                );
            }

            return {
                status: true,
                message: body.detail || body.message || 'Verification Successful',
                data: {
                    account_number: accountData!.account_number || normalizedAccount,
                    account_name: accountData!.account_name!,
                    bank_id: accountData!.bank_id ?? bank?.id,
                    bank: {
                        name: bank?.name ?? '',
                        id: bank?.id,
                        code: normalizedBankCode
                    }
                }
            };
        } catch (error: any) {
            if (error instanceof ValidationError) {
                throw error;
            }

            const responseBody = error?.response?.data;
            if (responseBody && typeof responseBody === 'object') {
                const recovered = this.extractAccountData(responseBody);
                if (this.isVerificationSuccess(responseBody) && recovered?.account_name) {
                    Console.warn('PremblyAccountVerificationService: recovered account data from error response', {
                        httpStatus: error?.response?.status,
                        detail: responseBody.detail || responseBody.message
                    });
                    return {
                        status: true,
                        message: responseBody.detail || responseBody.message || 'Verification Successful',
                        data: {
                            account_number: recovered.account_number || normalizedAccount,
                            account_name: recovered.account_name,
                            bank_id: recovered.bank_id ?? bank?.id,
                            bank: {
                                name: bank?.name ?? '',
                                id: bank?.id,
                                code: normalizedBankCode
                            }
                        }
                    };
                }
            }

            Console.error(error, {
                message: 'Prembly verify account error',
                bank_code: normalizedBankCode,
                account_suffix: normalizedAccount.slice(-4),
                responseKeys:
                    responseBody && typeof responseBody === 'object' ? Object.keys(responseBody) : []
            });
            const apiMessage =
                responseBody?.detail ||
                responseBody?.message ||
                error?.message;
            throw new ValidationError(this.resolveErrorMessage(apiMessage));
        }
    }

    async fetchBanks(): Promise<BanksListResult> {
        const banks = await this.getBanksCached();
        return {
            status: true,
            message: 'Banks retrieved',
            data: banks
        };
    }

    private async getBanksCached(): Promise<BankListItem[]> {
        const now = Date.now();
        if (this.banksCache && now - this.banksCacheAt < PremblyAccountVerificationService.BANKS_CACHE_TTL_MS) {
            return this.banksCache;
        }

        const endpoints = [
            '/verification/bank-codes',
            '/verification/bank_codes',
            '/identitypass/verification/bank_account/bank_code',
            '/identitypass/verification/api/bank_codes'
        ];

        const attempts: Array<Record<string, unknown>> = [];
        let lastError: unknown;

        for (const endpoint of endpoints) {
            try {
                console.warn(`[Prembly banks] GET ${endpoint}`);
                const response = await this.client.get<PremblyBanksResponse>(endpoint);
                const body = response.data as PremblyBanksResponse & Record<string, any>;
                const snapshot = this.summarizePremblyBody(body, response.status, endpoint);
                attempts.push(snapshot);
                console.warn('[Prembly banks] response', JSON.stringify(snapshot));
                Console.info('Prembly banks list response', snapshot);

                const rows = this.extractBankRows(body);
                if (rows.length > 0) {
                    const banks = rows
                        .filter((bank) => bank && (bank.code || bank.longcode) && bank.name)
                        .map((bank) => ({
                            id: Number(bank.id) || 0,
                            name: String(bank.name),
                            code: String(bank.code || bank.longcode),
                            longcode: String(bank.longcode || bank.code || '')
                        }))
                        .sort((a, b) => a.name.localeCompare(b.name));

                    this.banksCache = banks;
                    this.banksCacheAt = now;
                    console.warn(`[Prembly banks] parsed ${banks.length} banks from ${endpoint}`);
                    return banks;
                }

                lastError = new ServiceError(
                    `Prembly banks list empty/unusable from ${endpoint}: ${this.formatPremblyBody(body)}`
                );
            } catch (error: any) {
                lastError = error;
                const snapshot = {
                    endpoint,
                    httpStatus: error?.response?.status ?? null,
                    axiosMessage: error?.message,
                    premblyBody: this.safeJson(error?.response?.data)
                };
                attempts.push(snapshot);
                console.warn('[Prembly banks] request failed', JSON.stringify(snapshot));
                Console.error(error, {
                    message: 'Prembly banks list request failed',
                    ...snapshot
                });
            }
        }

        console.warn('[Prembly banks] all endpoints failed', JSON.stringify({ attempts }));
        const providerMsg =
            (lastError as any)?.response?.data?.message ||
            (lastError as any)?.response?.data?.detail ||
            (lastError as any)?.message ||
            'Failed to fetch banks from Prembly';
        throw new ServiceError(
            `Prembly banks list failed: ${providerMsg}. Attempts: ${this.safeJson(attempts).slice(0, 1800)}`
        );
    }

    private extractBankRows(body: any): Array<{
        id?: number;
        name?: string;
        code?: string;
        longcode?: string;
        is_deleted?: boolean;
    }> {
        const candidates = [
            body?.data,
            body?.banks,
            body?.result,
            body?.data?.data,
            body?.data?.banks,
            body?.verification?.data
        ];
        for (const value of candidates) {
            if (Array.isArray(value) && value.length) {
                return value;
            }
        }
        return [];
    }

    private summarizePremblyBody(body: any, httpStatus: number, endpoint: string): Record<string, unknown> {
        return {
            endpoint,
            httpStatus,
            premblyStatus: body?.status,
            responseCode: body?.response_code,
            message: body?.message ?? body?.detail ?? null,
            dataIsArray: Array.isArray(body?.data),
            dataLength: Array.isArray(body?.data) ? body.data.length : null,
            topKeys: body && typeof body === 'object' ? Object.keys(body) : [],
            body: this.safeJson(body).slice(0, 2500)
        };
    }

    private formatPremblyBody(body: unknown): string {
        return this.safeJson(body).slice(0, 1500);
    }

    private safeJson(value: unknown): string {
        if (value == null) {
            return '';
        }
        if (typeof value === 'string') {
            return value;
        }
        try {
            return JSON.stringify(value);
        } catch {
            return String(value);
        }
    }

    private normalizeAccountNumber(accountNumber: string): string {
        const digits = accountNumber.trim().replace(/\s+/g, '');
        if (!/^\d{9,10}$/.test(digits)) {
            throw new ValidationError('Account number must be 9 or 10 digits');
        }
        return digits.padStart(10, '0');
    }

    private async resolveBankCode(bankCode: string): Promise<string> {
        const trimmed = bankCode.trim();
        if (!trimmed) {
            throw new ValidationError('Bank code is required');
        }

        const bank = await this.findBank(trimmed);
        if (bank) {
            return bank.code;
        }

        if (/^\d{3,6}$/.test(trimmed)) {
            return trimmed;
        }

        throw new ValidationError(
            'Invalid bank code. Use the `code` field from GET /trade-intents/banks (not bank id or longcode).'
        );
    }

    private async findBank(bankCode: string): Promise<BankListItem | undefined> {
        const banks = await this.getBanksCached();
        return banks.find(
            (bank) =>
                bank.code === bankCode ||
                bank.longcode === bankCode ||
                String(bank.id) === bankCode
        );
    }

    private extractAccountData(body: Record<string, any> | null | undefined): {
        account_number?: string;
        account_name?: string;
        bank_id?: number;
    } | null {
        if (!body || typeof body !== 'object') return null;

        const candidates = [
            body.account_data,
            body['account data'],
            body.accountData,
            body.data,
            body.verification?.data,
            body
        ];

        for (const candidate of candidates) {
            if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) continue;
            const accountName =
                candidate.account_name ||
                candidate.accountName ||
                candidate.AccountName ||
                candidate.name;
            const accountNumber =
                candidate.account_number ||
                candidate.accountNumber ||
                candidate.AccountNumber ||
                candidate.number;
            if (accountName) {
                return {
                    account_number: accountNumber ? String(accountNumber) : undefined,
                    account_name: String(accountName),
                    bank_id:
                        candidate.bank_id != null
                            ? Number(candidate.bank_id)
                            : candidate.bankId != null
                              ? Number(candidate.bankId)
                              : undefined
                };
            }
        }

        return null;
    }

    private isVerificationSuccess(body: Record<string, any> | null | undefined): boolean {
        if (!body || typeof body !== 'object') return false;
        if (body.status === true || body.status === 'true' || body.status === 1) return true;
        if (String(body.response_code || '') === '00') return true;
        const detail = String(body.detail || body.message || '').toLowerCase();
        return detail.includes('success');
    }

    private resolveErrorMessage(providerMessage?: string): string {
        const message = String(providerMessage || '').trim();
        if (!message) {
            return (
                'Could not resolve account name. Confirm the account number is correct ' +
                'and use the bank `code` from GET /trade-intents/banks.'
            );
        }
        return message;
    }
}
