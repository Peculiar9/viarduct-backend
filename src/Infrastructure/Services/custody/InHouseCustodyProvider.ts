import { inject, injectable } from 'inversify';
import { TYPES } from '../../../Core/Types/Constants';
import {
    CustodyAsset,
    CustodyBroadcastResult,
    CustodyDepositAddress,
    CustodyFeeEstimate,
    ICustodyProvider
} from '../../../Core/Application/Interface/Services/ICustodyProvider';
import { IBitcoinWalletService } from '../../../Core/Application/Interface/Services/IBitcoinWalletService';
import { IEthereumWalletService } from '../../../Core/Application/Interface/Services/IEthereumWalletService';
import { IBitcoinWebhookService } from '../../../Core/Application/Interface/Services/IBitcoinWebhookService';
import { IBitcoinTransactionService } from '../../../Core/Application/Interface/Services/IBitcoinTransactionService';
import { IEthereumTransactionService } from '../../../Core/Application/Interface/Services/IEthereumTransactionService';
import { ISpotPriceService } from '../../../Core/Application/Interface/Services/ISpotPriceService';
import { Console } from '../../Utils/Console';
import { DIContainer } from '../../../Core/DIContainer';

@injectable()
export class InHouseCustodyProvider implements ICustodyProvider {
    readonly providerName = 'inhouse' as const;

    constructor(
        @inject(TYPES.BitcoinWalletService) private readonly bitcoinWalletService: IBitcoinWalletService,
        @inject(TYPES.EthereumWalletService) private readonly ethereumWalletService: IEthereumWalletService,
        @inject(TYPES.BitcoinTransactionService) private readonly bitcoinTransactionService: IBitcoinTransactionService,
        @inject(TYPES.EthereumTransactionService) private readonly ethereumTransactionService: IEthereumTransactionService,
        @inject(TYPES.SpotPriceService) private readonly spotPriceService: ISpotPriceService
    ) {}

    private getBitcoinWebhookService(): IBitcoinWebhookService {
        return DIContainer.getInstance().get<IBitcoinWebhookService>(TYPES.BitcoinWebhookService);
    }

    async createDepositAddress(intentId: string, asset: CustodyAsset): Promise<CustodyDepositAddress> {
        if (asset === 'BTC') {
            const result = await this.bitcoinWalletService.generateTradeIntentDepositAddress(intentId);
            return { address: result.address, derivationPath: result.derivationPath };
        }
        const result = await this.ethereumWalletService.generateTradeIntentDepositAddress(intentId);
        return { address: result.address, derivationPath: result.derivationPath };
    }

    async registerDepositWatcher(address: string, intentId: string, asset: CustodyAsset): Promise<void> {
        if (asset === 'BTC') {
            try {
                await this.getBitcoinWebhookService().registerAddressWebhook(address, `trade_intent:${intentId}`);
            } catch (error: any) {
                Console.warn('Failed to register BTC webhook for trade intent', {
                    intentId,
                    address,
                    error: error?.message
                });
            }
            return;
        }
        Console.info('ETH trade intent deposit registered for polling', { intentId, address });
    }

    async getVaultAddress(asset: CustodyAsset): Promise<string> {
        return asset === 'BTC'
            ? this.bitcoinWalletService.getVaultAddress()
            : this.ethereumWalletService.getVaultAddress();
    }

    private async spotForAsset(asset: CustodyAsset): Promise<number> {
        return asset === 'BTC'
            ? this.spotPriceService.getBtcNgnSpotPrice()
            : this.spotPriceService.getEthNgnSpotPrice();
    }

    private toNgn(feeCrypto: number, spot: number): number {
        return feeCrypto * spot;
    }

    async estimateOutboundFee(
        asset: CustodyAsset,
        fromAddress: string,
        toAddress: string,
        amountCrypto: number
    ): Promise<CustodyFeeEstimate> {
        const spot = await this.spotForAsset(asset);
        let feeCrypto = 0;
        if (asset === 'BTC') {
            feeCrypto = await this.bitcoinTransactionService.estimateTransferFee(fromAddress, toAddress, amountCrypto);
        } else {
            feeCrypto = await this.ethereumTransactionService.estimateNativeTransferFee(
                fromAddress,
                toAddress,
                amountCrypto
            );
        }
        return { feeCrypto, feeNgn: this.toNgn(feeCrypto, spot) };
    }

    async estimateSweepFee(
        asset: CustodyAsset,
        fromAddress: string,
        vaultAddress: string,
        amountCrypto: number,
        derivationPath?: string
    ): Promise<CustodyFeeEstimate> {
        return this.estimateOutboundFee(asset, fromAddress, vaultAddress, amountCrypto);
    }

    async broadcastOutbound(
        asset: CustodyAsset,
        toAddress: string,
        amountCrypto: number,
        options?: { fromDerivationPath?: string; fromAddress?: string }
    ): Promise<CustodyBroadcastResult> {
        const vaultPath =
            options?.fromDerivationPath ??
            (asset === 'BTC'
                ? this.bitcoinWalletService.getVaultDerivationPath()
                : this.ethereumWalletService.getVaultDerivationPath());
        const fromAddress =
            options?.fromAddress ?? (await this.getVaultAddress(asset));

        if (asset === 'BTC') {
            const { txHash, feeBtc } = await this.bitcoinTransactionService.sendFromDerivationPath(
                vaultPath,
                fromAddress,
                toAddress,
                amountCrypto
            );
            return { txHash, feeCrypto: feeBtc };
        }

        const { txHash, feeEth } = await this.ethereumTransactionService.sendFromDerivationPath(
            vaultPath,
            fromAddress,
            toAddress,
            amountCrypto
        );
        return { txHash, feeCrypto: feeEth };
    }

    async sweepTradeIntentDeposit(
        asset: CustodyAsset,
        intentId: string,
        fromAddress: string,
        derivationPath: string,
        amountCrypto: number
    ): Promise<CustodyBroadcastResult> {
        const vaultAddress = await this.getVaultAddress(asset);
        if (asset === 'BTC') {
            const { txHash, feeBtc } = await this.bitcoinTransactionService.sendFromDerivationPath(
                derivationPath,
                fromAddress,
                vaultAddress,
                amountCrypto
            );
            return { txHash, feeCrypto: feeBtc };
        }
        const { txHash, feeEth } = await this.ethereumTransactionService.sendNativeSweepFromDerivationPath(
            derivationPath,
            fromAddress,
            vaultAddress,
            amountCrypto
        );
        return { txHash, feeCrypto: feeEth };
    }
}
