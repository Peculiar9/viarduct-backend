import { inject, injectable } from 'inversify';
import { TYPES } from '../../../Core/Types/Constants';
import { ITradeQuoteService } from '../../../Core/Application/Interface/Services/ITradeIntentService';
import { ITradingRateService } from '../../../Core/Application/Interface/Services/ITradingRateService';
import { ICustodyProvider } from '../../../Core/Application/Interface/Services/ICustodyProvider';
import { ISpotPriceService } from '../../../Core/Application/Interface/Services/ISpotPriceService';
import { TradeQuoteLineItems } from '../../../Core/Application/DTOs/TradeIntentDTO';
import { ValidationError } from '../../../Core/Application/Error/AppError';
import { Console } from '../../Utils/Console';

const QUOTE_TTL_MS = 5 * 60 * 1000;

@injectable()
export class TradeQuoteService implements ITradeQuoteService {
    constructor(
        @inject(TYPES.TradingRateService) private readonly tradingRateService: ITradingRateService,
        @inject(TYPES.CustodyProvider) private readonly custodyProvider: ICustodyProvider,
        @inject(TYPES.SpotPriceService) private readonly spotPriceService: ISpotPriceService
    ) {}

    private quoteExpiry(): string {
        return new Date(Date.now() + QUOTE_TTL_MS).toISOString();
    }

    private normalizeAsset(cryptoType: string): 'BTC' | 'ETH' {
        const asset = cryptoType.toUpperCase();
        if (asset !== 'BTC' && asset !== 'ETH') {
            throw new ValidationError('Only BTC and ETH are supported');
        }
        return asset;
    }

    private async resolveSpotUsd(asset: 'BTC' | 'ETH'): Promise<number> {
        try {
            return asset === 'BTC'
                ? await this.spotPriceService.getBtcUsdSpotPrice()
                : await this.spotPriceService.getEthUsdSpotPrice();
        } catch (err: any) {
            Console.warn('USD spot fetch failed; defaulting spot_price_usd to 0', {
                asset,
                error: err?.message
            });
            return 0;
        }
    }

    async buildSellQuote(cryptoType: string, cryptoAmount: number): Promise<TradeQuoteLineItems> {
        if (cryptoAmount <= 0) {
            throw new ValidationError('Crypto amount must be greater than 0');
        }
        const asset = this.normalizeAsset(cryptoType);
        const rate = await this.tradingRateService.getActiveRate(asset);
        const spot = Number(rate.last_spot_price ?? rate.buy_rate);
        const buyRate = Number(rate.buy_rate);
        const sellRate = Number(rate.sell_rate);
        const spotUsd = await this.resolveSpotUsd(asset);

        const grossFiat = cryptoAmount * buyRate;
        const vaultAddress = await this.custodyProvider.getVaultAddress(asset);
        const placeholderFrom = `sell-estimate-${asset.toLowerCase()}`;
        const gas = await this.custodyProvider.estimateSweepFee(
            asset,
            placeholderFrom,
            vaultAddress,
            cryptoAmount
        );
        const netFiatPayout = grossFiat - gas.feeNgn;
        if (netFiatPayout <= 0) {
            throw new ValidationError('Trade too small: estimated gas exceeds NGN payout');
        }

        return {
            spot_price_ngn: spot,
            spot_price_usd: spotUsd,
            buy_rate: buyRate,
            sell_rate: sellRate,
            rate_used: buyRate,
            gross_crypto_amount: cryptoAmount,
            gross_fiat_amount: grossFiat,
            gas_crypto: gas.feeCrypto,
            gas_ngn: gas.feeNgn,
            net_crypto_amount: cryptoAmount,
            net_fiat_payout: netFiatPayout,
            quote_expires_at: this.quoteExpiry()
        };
    }

    async buildBuyQuote(
        cryptoType: string,
        fiatAmount: number,
        externalDestinationAddress: string
    ): Promise<TradeQuoteLineItems> {
        if (fiatAmount <= 0) {
            throw new ValidationError('Fiat amount must be greater than 0');
        }
        if (!externalDestinationAddress?.trim()) {
            throw new ValidationError('External destination address is required for buy quotes');
        }
        const asset = this.normalizeAsset(cryptoType);
        const rate = await this.tradingRateService.getActiveRate(asset);
        const spot = Number(rate.last_spot_price ?? rate.sell_rate);
        const buyRate = Number(rate.buy_rate);
        const sellRate = Number(rate.sell_rate);
        const spotUsd = await this.resolveSpotUsd(asset);

        const grossCrypto = fiatAmount / sellRate;
        const vaultAddress = await this.custodyProvider.getVaultAddress(asset);
        const gas = await this.custodyProvider.estimateOutboundFee(
            asset,
            vaultAddress,
            externalDestinationAddress.trim(),
            grossCrypto
        );
        const netCrypto = grossCrypto - gas.feeCrypto;
        if (netCrypto <= 0) {
            throw new ValidationError('Trade too small: estimated gas exceeds crypto delivery');
        }

        return {
            spot_price_ngn: spot,
            spot_price_usd: spotUsd,
            buy_rate: buyRate,
            sell_rate: sellRate,
            rate_used: sellRate,
            gross_crypto_amount: grossCrypto,
            gross_fiat_amount: fiatAmount,
            gas_crypto: gas.feeCrypto,
            gas_ngn: gas.feeNgn,
            net_crypto_amount: netCrypto,
            quote_expires_at: this.quoteExpiry()
        };
    }
}
