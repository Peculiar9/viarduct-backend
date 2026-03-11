import { injectable, inject } from 'inversify';
import { TYPES } from '../../../Core/Types/Constants';
import { HttpClientFactory } from '../../Http/HttpClientFactory';
import { IHttpClient } from '../../../Core/Application/Interface/Infrastructure/IHttpClient';
import { 
    IPaystackService, 
    PaystackInitializeResponse, 
    PaystackVerifyResponse,
    PaystackResolveAccountResponse,
    PaystackTransferRecipientResponse,
    PaystackTransferResponse,
    PaystackBanksResponse
} from '../../../Core/Application/Interface/Services/IPaystackService';
import { ServiceError, HttpClientError } from '../../../Core/Application/Error/AppError';
import { Console } from '../../Utils/Console';

@injectable()
export class PaystackService implements IPaystackService {
    private readonly httpClient: IHttpClient;
    private readonly secretKey: string;

    constructor(
        @inject(TYPES.HttpClientFactory) httpClientFactory: HttpClientFactory
    ) {
        const secretKey = process.env.PAYSTACK_SECRET_KEY || '';
        if (!secretKey) {
            Console.warn('PAYSTACK_SECRET_KEY not found in environment variables');
        }

        this.secretKey = secretKey;
        this.httpClient = httpClientFactory.createClient({
            baseURL: 'https://api.paystack.co',
            timeout: 30000,
            headers: {
                'Authorization': `Bearer ${secretKey}`,
                'Content-Type': 'application/json'
            }
        });
    }

    /**
     * Initialize a Paystack transaction
     */
    async initializeTransaction(
        amount: number,
        email: string,
        callbackUrl: string,
        metadata?: Record<string, any>
    ): Promise<PaystackInitializeResponse> {
        try {
            Console.info('PaystackService::initializeTransaction', { amount, email, callbackUrl });

            const response = await this.httpClient.post<PaystackInitializeResponse>(
                '/transaction/initialize',
                {
                    amount,
                    email,
                    callback_url: callbackUrl, // Paystack redirects here after payment
                    metadata
                }
            );

            if (!response.status) {
                throw new ServiceError(`Paystack initialization failed: ${response.message}`);
            }

            return response;
        } catch (error: any) {
            Console.error(error, { message: 'Paystack initialization error', amount, email });
            if (error instanceof HttpClientError) {
                throw new ServiceError(`Paystack API error: ${error.message}`);
            }
            throw error;
        }
    }

    /**
     * Verify a Paystack transaction
     */
    async verifyPayment(reference: string): Promise<PaystackVerifyResponse> {
        try {
            Console.info('PaystackService::verifyPayment', { reference });

            const response = await this.httpClient.get<PaystackVerifyResponse>(
                `/transaction/verify/${reference}`
            );

            if (!response.status) {
                throw new ServiceError(`Paystack verification failed: ${response.message}`);
            }

            return response;
        } catch (error: any) {
            Console.error(error, { message: 'Paystack verification error', reference });
            if (error instanceof HttpClientError) {
                throw new ServiceError(`Paystack API error: ${error.message}`);
            }
            throw error;
        }
    }

    /**
     * Charge authorization (renew transaction)
     */
    async chargeAuthorization(
        authorizationCode: string,
        email: string,
        amount: number,
        metadata?: Record<string, any>
    ): Promise<any> {
        try {
            Console.info('PaystackService::chargeAuthorization', { authorizationCode, email, amount });

            const response = await this.httpClient.post<{
                status: boolean;
                message: string;
                data: any;
            }>(
                '/transaction/charge_authorization',
                {
                    authorization_code: authorizationCode,
                    email,
                    amount,
                    metadata
                }
            );

            if (!response.status) {
                throw new ServiceError(`Paystack charge authorization failed: ${response.message}`);
            }

            return response;
        } catch (error: any) {
            Console.error(error, { 
                message: 'Paystack charge authorization error', 
                authorizationCode, 
                email, 
                amount 
            });
            if (error instanceof HttpClientError) {
                throw new ServiceError(`Paystack API error: ${error.message}`);
            }
            throw error;
        }
    }

    async verifyAccountNumber(accountNumber: string, bankCode: string): Promise<PaystackResolveAccountResponse> {
        try {
            const response = await this.httpClient.get<PaystackResolveAccountResponse>(
                `/bank/resolve?account_number=${encodeURIComponent(accountNumber)}&bank_code=${encodeURIComponent(bankCode)}`
            );
            if (!response.status) {
                throw new ServiceError(`Account verification failed: ${response.message}`);
            }
            return response;
        } catch (error: any) {
            Console.error(error, { message: 'Paystack verify account error', accountNumber });
            if (error instanceof HttpClientError) {
                throw new ServiceError(`Paystack API error: ${error.message}`);
            }
            throw error;
        }
    }

    async createTransferRecipient(accountNumber: string, bankCode: string, accountName: string): Promise<PaystackTransferRecipientResponse> {
        try {
            const response = await this.httpClient.post<PaystackTransferRecipientResponse>('/transferrecipient', {
                type: 'nuban',
                name: accountName,
                account_number: accountNumber,
                bank_code: bankCode,
                currency: 'NGN'
            });
            if (!response.status) {
                throw new ServiceError(`Create recipient failed: ${response.message}`);
            }
            return response;
        } catch (error: any) {
            Console.error(error, { message: 'Paystack create recipient error', accountNumber });
            if (error instanceof HttpClientError) {
                throw new ServiceError(`Paystack API error: ${error.message}`);
            }
            throw error;
        }
    }

    async initiateTransfer(amountInNaira: number, recipientCode: string, reason: string = 'Withdrawal'): Promise<PaystackTransferResponse> {
        try {
            const amountInKobo = Math.floor(amountInNaira * 100);
            const response = await this.httpClient.post<PaystackTransferResponse>('/transfer', {
                source: 'balance',
                amount: amountInKobo,
                recipient: recipientCode,
                reason
            });
            if (!response.status) {
                throw new ServiceError(`Transfer failed: ${response.message}`);
            }
            return response;
        } catch (error: any) {
            Console.error(error, { message: 'Paystack initiate transfer error', amountInNaira, recipientCode });
            if (error instanceof HttpClientError) {
                throw new ServiceError(`Paystack API error: ${error.message}`);
            }
            throw error;
        }
    }

    async fetchBanks(): Promise<PaystackBanksResponse> {
        try {
            const response = await this.httpClient.get<PaystackBanksResponse>('/bank');
            if (!response.status) {
                throw new ServiceError(`Fetch banks failed: ${response.message}`);
            }
            return response;
        } catch (error: any) {
            Console.error(error, { message: 'Paystack fetch banks error' });
            if (error instanceof HttpClientError) {
                throw new ServiceError(`Paystack API error: ${error.message}`);
            }
            throw error;
        }
    }
}

