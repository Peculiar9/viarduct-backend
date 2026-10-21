import { AxiosRequestConfig } from 'axios';
import { EnvironmentConfig } from '../../../Config/EnvironmentConfig';

export type Thresh0ldAuthRole = 'admin' | 'initiator' | 'signer';

export interface Thresh0ldCredentialPair {
    clientId: string;
    clientSecret: string;
}

export type Thresh0ldRequestConfig = AxiosRequestConfig & {
    thresh0ldRole?: Thresh0ldAuthRole;
};

/**
 * Load ADMIN / INITIATOR / SIGNER Basic-auth pairs from env.
 * Legacy THRESH0LD_CLIENT_ID / THRESH0LD_CLIENT_SECRET / THRESH0LD_INITIATOR_API_KEY
 * still fill gaps so sandbox keeps working until prod keys are set.
 */
export function loadThresh0ldCredentialPairs(): Record<Thresh0ldAuthRole, Thresh0ldCredentialPair> {
    const legacyId = firstSet('THRESH0LD_CLIENT_ID', 'THRESH0LD_ADMIN_API_KEY');
    const legacySecret = firstSet('THRESH0LD_CLIENT_SECRET', 'THRESH0LD_ADMIN_API_KEY');
    const legacyInitiatorSecret = firstSet('THRESH0LD_INITIATOR_API_KEY', 'THRESH0LD_CLIENT_SECRET');

    const admin: Thresh0ldCredentialPair = {
        clientId: firstSet('THRESH0LD_ADMIN_CLIENT_ID') || legacyId,
        clientSecret: firstSet('THRESH0LD_ADMIN_CLIENT_SECRET') || legacySecret
    };

    const initiator: Thresh0ldCredentialPair = {
        clientId: firstSet('THRESH0LD_INITIATOR_CLIENT_ID') || legacyId,
        clientSecret: firstSet('THRESH0LD_INITIATOR_CLIENT_SECRET') || legacyInitiatorSecret
    };

    const signer: Thresh0ldCredentialPair = {
        clientId: firstSet('THRESH0LD_SIGNER_CLIENT_ID') || initiator.clientId,
        clientSecret: firstSet('THRESH0LD_SIGNER_CLIENT_SECRET') || initiator.clientSecret
    };

    return { admin, initiator, signer };
}

/** Inbound webhook HMAC. Dedicated webhook secret first; signer secret as fallback. */
export function resolveThresh0ldWebhookHmacSecret(): string {
    return firstSet('THRESH0LD_WEBHOOK_SECRET', 'THRESH0LD_SIGNER_CLIENT_SECRET');
}

export function encodeBasicAuth(pair: Thresh0ldCredentialPair): string {
    return Buffer.from(`${pair.clientId}:${pair.clientSecret}`).toString('base64');
}

function firstSet(...keys: string[]): string {
    for (const key of keys) {
        const value = EnvironmentConfig.get(key, '')
            .trim()
            .replace(/^['"]|['"]$/g, '');
        if (value) {
            return value;
        }
    }
    return '';
}
