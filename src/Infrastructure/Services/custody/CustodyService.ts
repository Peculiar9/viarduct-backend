import { inject, injectable } from 'inversify';
import { TYPES } from '../../../Core/Types/Constants';
import {
    ICustodyService,
    OutwardTransactionFeeQuote
} from '../../../Core/Application/Interface/Services/ICustodyService';
import { CustodyAsset, ICustodyProvider } from '../../../Core/Application/Interface/Services/ICustodyProvider';
import { ISplitConfigService } from '../../../Core/Application/Interface/Services/ISplitConfigService';
import { EnvironmentConfig } from '../../Config/EnvironmentConfig';
import { Console } from '../../Utils/Console';
import { getNetworkFee } from '../trading/getNetworkFee';

const FEE_QUOTE_TIMEOUT_MS = 8_000;

@injectable()
export class CustodyService implements ICustodyService {
    constructor(
        @inject(TYPES.CustodyProvider) private readonly custodyProvider: ICustodyProvider,
        @inject(TYPES.SplitConfigService) private readonly splitConfigService: ISplitConfigService
    ) {}

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

        const split = await this.splitConfigService.getResolved();
        const rate = split.platform_fee_percentage.value / 100;
        const networkTitle = cryptoType === 'ETH' ? 'eth_network_fee' : 'btc_network_fee';
        const networkPercent = split[networkTitle].value;
        const networkCut =
            Number.isFinite(amount) && amount > 0 && networkPercent > 0
                ? amount * (networkPercent / 100)
                : 0;
        const buffer = this.platformFeeBuffer(cryptoType);
        const platformProfit = liveGasFee * rate + networkCut + buffer;
        const totalUserFee = liveGasFee + platformProfit;

        return {
            crypto_type: cryptoType,
            live_gas_fee: liveGasFee,
            platform_profit: platformProfit,
            total_user_fee: totalUserFee,
            used_fallback: usedFallback
        };
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
