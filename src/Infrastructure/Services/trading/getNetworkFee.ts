import { EnvironmentConfig } from '../../Config/EnvironmentConfig';

const DEFAULT_NETWORK_FEES: Record<string, number> = {
    BTC: 0.0001,
    ETH: 0.0008,
    USDT: 2
};

/**
 * Flat network/gas fee charged on outbound crypto payouts.
 * Override with NETWORK_FEE_BTC / NETWORK_FEE_ETH / NETWORK_FEE_USDT.
 */
export function getNetworkFee(cryptoType: string): number {
    const asset = String(cryptoType || '').trim().toUpperCase();
    const envKey = `NETWORK_FEE_${asset}`;
    const fromEnv = EnvironmentConfig.get(envKey, '').trim();
    if (fromEnv !== '') {
        const parsed = Number(fromEnv);
        if (Number.isFinite(parsed) && parsed >= 0) {
            return parsed;
        }
    }
    if (DEFAULT_NETWORK_FEES[asset] == null) {
        throw new Error(`Unsupported crypto type for network fee: ${cryptoType}`);
    }
    return DEFAULT_NETWORK_FEES[asset];
}
