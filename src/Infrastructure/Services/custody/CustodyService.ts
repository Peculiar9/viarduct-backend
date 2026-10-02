import { inject, injectable } from 'inversify';
import { TYPES } from '../../../Core/Types/Constants';
import {
    ICustodyService,
    OutwardTransactionFeeQuote
} from '../../../Core/Application/Interface/Services/ICustodyService';
import { CustodyAsset, ICustodyProvider } from '../../../Core/Application/Interface/Services/ICustodyProvider';
import { EnvironmentConfig } from '../../Config/EnvironmentConfig';
import { Console } from '../../Utils/Console';
import { getNetworkFee } from '../trading/getNetworkFee';

const FEE_QUOTE_TIMEOUT_MS = 8_000;

@injectable()
export class CustodyService implements ICustodyService {
    constructor(@inject(TYPES.CustodyProvider) private readonly custodyProvider: ICustodyProvider) {}

    async getOutwardTransactionFee(
        cryptoType: CustodyAsset,
        targetAddress: string,
        amount: number
    ): Promise<OutwardTransactionFeeQuote> {
        const fallback = getNetworkFee(cryptoType);
        let liveGasFee = fallback;
        let usedFallback = true;

        try {
            const fromAddress = (await this.custodyProvider.getVaultAddress(cryptoType)) || '';
            const estimate = await this.withTimeout(
                this.custodyProvider.estimateOutboundFee(
                    cryptoType,
                    fromAddress,
                    targetAddress,
                    amount
                ),
                FEE_QUOTE_TIMEOUT_MS
            );
            const quoted = Number(estimate.feeCrypto);
            if (Number.isFinite(quoted) && quoted > 0) {
                liveGasFee = quoted;
                usedFallback = false;
            }
        } catch (error: any) {
            Console.warn('Live outbound fee quote failed; using NETWORK_FEE fallback', {
                cryptoType,
                error: error?.message
            });
        }

        const rate = this.platformFeeRate();
        const buffer = this.platformFeeBuffer(cryptoType);
        const platformProfit = liveGasFee * rate + buffer;
        const totalUserFee = liveGasFee + platformProfit;

        return {
            crypto_type: cryptoType,
            live_gas_fee: liveGasFee,
            platform_profit: platformProfit,
            total_user_fee: totalUserFee,
            used_fallback: usedFallback
        };
    }

    private platformFeeRate(): number {
        const raw = EnvironmentConfig.get('PLATFORM_FEE_PERCENTAGE', '0.1').trim();
        const n = Number(raw);
        if (!Number.isFinite(n) || n < 0) {
            return 0.1;
        }
        return n > 1 ? n / 100 : n;
    }

    private platformFeeBuffer(asset: CustodyAsset): number {
        const perAsset = EnvironmentConfig.get(`PLATFORM_FEE_BUFFER_${asset}`, '').trim();
        const generic = EnvironmentConfig.get('PLATFORM_FEE_BUFFER', '0').trim();
        const raw = perAsset !== '' ? perAsset : generic;
        const n = Number(raw);
        return Number.isFinite(n) && n >= 0 ? n : 0;
    }

    private async withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
            return await Promise.race([
                promise,
                new Promise<T>((_, reject) => {
                    timer = setTimeout(
                        () => reject(new Error(`Fee quote timed out after ${ms}ms`)),
                        ms
                    );
                })
            ]);
        } finally {
            if (timer) {
                clearTimeout(timer);
            }
        }
    }
}
