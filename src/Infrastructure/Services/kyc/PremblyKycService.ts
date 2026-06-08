import axios, { AxiosInstance } from 'axios';
import { injectable } from 'inversify';
import { EnvironmentConfig } from '../../Config/EnvironmentConfig';
import { Console } from '../../Utils/Console';
import { ServiceError, ValidationError } from '../../../Core/Application/Error/AppError';
import {
  IPremblyKycService,
  PremblyVerificationResult
} from '../../../Core/Application/Interface/Services/IPremblyKycService';

type PremblyApiResponse = {
  status?: boolean;
  detail?: string;
  response_code?: string;
  data?: any;
  nin_data?: any;
  verification?: { reference?: string };
};

/** Always prints to stderr so it is visible above pool noise */
function premblyLog(message: string, context?: Record<string, unknown>): void {
  const ctx = context ? ` ${JSON.stringify(context)}` : '';
  console.warn(`[Prembly] ${message}${ctx}`);
}
 
@injectable()
export class PremblyKycService implements IPremblyKycService {
  private readonly client: AxiosInstance; 

  constructor() {
    const baseURL = EnvironmentConfig.get('PREMBLY_BASE_URL', 'https://api.prembly.com').trim();
    const apiKey = EnvironmentConfig.get('PREMBLY_API_KEY', '').trim();

    if (!apiKey) {
      // KYC is a core gate. Fail fast if configured incorrectly.
      throw new ServiceError('Prembly config missing: set PREMBLY_API_KEY');
    }

    // Some Prembly docs mention app-id, but the official endpoint specs only require x-api-key.
    // We keep app-id optional for compatibility across products/plans.
    const appId = EnvironmentConfig.get('PREMBLY_APP_ID', '').trim();

    this.client = axios.create({
      baseURL,
      timeout: 30_000,
      headers: {
        'x-api-key': apiKey,
        'content-type': 'application/json'
      }
    });

    if (appId) {
      this.client.defaults.headers.common['app-id'] = appId;
    }

    premblyLog('service ready', {
      baseURL,
      hasAppId: Boolean(appId),
      apiKeyPrefix: apiKey.slice(0, 8) + '...'
    });
    Console.info('PremblyKycService ready', {
      baseURL,
      hasAppId: Boolean(appId),
      apiKeyPrefix: apiKey.slice(0, 8) + '...'
    });
  }

  private maskIdentity(value: string): string {
    if (value.length <= 4) return '****';
    return `***${value.slice(-4)}`;
  }

  async verifyBVN(bvn: string): Promise<PremblyVerificationResult> {
    const endpoint = '/verification/bvn_validation';
    premblyLog('API request', { endpoint, method: 'POST', identityType: 'BVN', number: this.maskIdentity(bvn) });
    Console.info('Prembly API request', {
      endpoint,
      method: 'POST',
      identityType: 'BVN',
      number: this.maskIdentity(bvn)
    });
    try {
      const res = await this.client.post<PremblyApiResponse>(endpoint, { number: bvn });
      const result = this.normalize('BVN', bvn, res.data);
      premblyLog('API response', {
        endpoint,
        httpStatus: res.status,
        premblyStatus: res.data?.status,
        responseCode: result.responseCode,
        verified: result.verified,
        detail: result.detail,
        reference: result.reference
      });
      Console.info('Prembly API response', {
        endpoint,
        httpStatus: res.status,
        premblyStatus: res.data?.status,
        responseCode: result.responseCode,
        verified: result.verified,
        detail: result.detail,
        reference: result.reference
      });
      return result;
    } catch (error: any) {
      premblyLog('API error', {
        endpoint,
        httpStatus: error?.response?.status,
        detail: error?.response?.data?.detail || error?.response?.data?.message || error?.message
      });
      Console.error(error, {
        message: 'Prembly BVN request failed',
        endpoint,
        httpStatus: error?.response?.status,
        premblyDetail: error?.response?.data?.detail || error?.response?.data?.message
      });
      const msg =
        error?.response?.data?.detail ||
        error?.response?.data?.message ||
        error?.message ||
        'Prembly BVN verification failed';
      throw new ValidationError(String(msg));
    }
  }

  async verifyNIN(nin: string): Promise<PremblyVerificationResult> {
    const endpoint = '/verification/vnin';
    premblyLog('API request', { endpoint, method: 'POST', identityType: 'NIN', number_nin: this.maskIdentity(nin) });
    Console.info('Prembly API request', {
      endpoint,
      method: 'POST',
      identityType: 'NIN',
      number_nin: this.maskIdentity(nin)
    });
    try {
      const res = await this.client.post<PremblyApiResponse>(endpoint, { number_nin: nin });
      const result = this.normalize('NIN', nin, res.data);
      premblyLog('API response', {
        endpoint,
        httpStatus: res.status,
        premblyStatus: res.data?.status,
        responseCode: result.responseCode,
        verified: result.verified,
        detail: result.detail,
        reference: result.reference
      });
      Console.info('Prembly API response', {
        endpoint,
        httpStatus: res.status,
        premblyStatus: res.data?.status,
        responseCode: result.responseCode,
        verified: result.verified,
        detail: result.detail,
        reference: result.reference
      });
      return result;
    } catch (error: any) {
      premblyLog('API error', {
        endpoint,
        httpStatus: error?.response?.status,
        detail: error?.response?.data?.detail || error?.response?.data?.message || error?.message
      });
      Console.error(error, {
        message: 'Prembly NIN request failed',
        endpoint,
        httpStatus: error?.response?.status,
        premblyDetail: error?.response?.data?.detail || error?.response?.data?.message
      });
      const msg =
        error?.response?.data?.detail ||
        error?.response?.data?.message ||
        error?.message ||
        'Prembly NIN verification failed';
      throw new ValidationError(String(msg));
    }
  }

  private normalize(identityType: 'BVN' | 'NIN', identityValue: string, data: PremblyApiResponse): PremblyVerificationResult {
    const responseCode = data?.response_code;
    const verified = Boolean(data?.status) && (responseCode === '00' || responseCode === '0' || responseCode === '000');
    const ref = data?.verification?.reference ?? null;
    const detail = data?.detail ?? null;

    return {
      provider: 'prembly',
      identityType,
      identityValue,
      verified,
      responseCode,
      reference: ref,
      detail,
      raw: data
    };
  }
}

