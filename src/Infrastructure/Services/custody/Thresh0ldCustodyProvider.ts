import { inject, injectable } from 'inversify';
import { TYPES } from '../../../Core/Types/Constants';
import {
    CustodyAsset,
    CustodyBroadcastResult,
    CustodyDepositAddress,
    CustodyFeeEstimate,
    ICustodyProvider
} from '../../../Core/Application/Interface/Services/ICustodyProvider';
import { EnvironmentConfig } from '../../Config/EnvironmentConfig';
import { Console } from '../../Utils/Console';
import { ServiceError } from '../../../Core/Application/Error/AppError';
import { Thresh0ldApiClient } from './thresh0ld/Thresh0ldApiClient';
import { ICustodyDerivationCounterRepository } from '../../../Core/Application/Interface/Repositories/ICustodyDerivationCounterRepository';
import {
    assertThresh0ldPathIndex,
    formatThresh0ldDerivationPath
} from './thresh0ld/Thresh0ldDerivationPath';

@injectable()
export class Thresh0ldCustodyProvider implements ICustodyProvider {
    readonly providerName = 'thresh0ld' as const;

    constructor(
        @inject(TYPES.Thresh0ldApiClient) private readonly apiClient: Thresh0ldApiClient,
        @inject(TYPES.CustodyDerivationCounterRepository)
        private readonly derivationCounterRepo: ICustodyDerivationCounterRepository
    ) {}

    async createDepositAddress(intentId: string, asset: CustodyAsset): Promise<CustodyDepositAddress> {
        // Strict sequential HD indices (0,1,2,...) — required by Thresh0ld gap-limit watcher
        const pathIndex = await this.derivationCounterRepo.allocateNextIndex(asset);
        assertThresh0ldPathIndex(pathIndex);
        const derivationPath = formatThresh0ldDerivationPath(pathIndex);

        Console.info('Thresh0ldCustodyProvider: generating deposit address', {
            intentId,
            asset,
            pathIndex,
            deposit_derivation_path: derivationPath
        });

        const generated = await this.apiClient.generateAddress(pathIndex, asset.toLowerCase());
        Console.info('Thresh0ldCustodyProvider: deposit address generated', {
            intentId,
            asset,
            address: generated.address,
            deposit_derivation_path: derivationPath
        });

        return {
            address: generated.address,
            derivationPath,
            providerRef: this.apiClient.getHotWalletId(asset.toLowerCase())
        };
    }

    async registerDepositWatcher(address: string, intentId: string, asset: CustodyAsset): Promise<void> {
        // Thresh0ld pushes Receive/Send events to POST /webhooks/thresh0ld
        Console.info('Thresh0ldCustodyProvider: deposit watcher via webhook', {
            address,
            intentId,
            asset
        });
    }

    async getVaultAddress(asset: CustodyAsset): Promise<string> {
        const envKey =
            asset === 'BTC' ? 'THRESH0LD_VAULT_ADDRESS_BTC' : 'THRESH0LD_VAULT_ADDRESS_ETH';
        const configured =
            EnvironmentConfig.get(envKey, '').trim() ||
            EnvironmentConfig.get('THRESH0LD_VAULT_ADDRESS', '').trim() ||
            // Fallback: in-house vault envs (useful while Thresh0ld vault addr is unset)
            (asset === 'BTC'
                ? EnvironmentConfig.get('MASTER_VAULT_ADDRESS', '').trim()
                : EnvironmentConfig.get('MASTER_ETH_VAULT_ADDRESS', '').trim());

        if (!configured) {
            // Quotes call this for gas estimation; Thresh0ld fees are currently 0 so empty is OK.
            // Actual sweeps still require a real vault address (see sweepTradeIntentDeposit).
            Console.warn('Thresh0ld vault address not configured; returning empty for quote/estimate', {
                envKey
            });
            return '';
        }
        return configured;
    }

    async estimateOutboundFee(
        _asset: CustodyAsset,
        _fromAddress: string,
        _toAddress: string,
        _amountCrypto: number
    ): Promise<CustodyFeeEstimate> {
        // Thresh0ld fee estimate endpoint not wired yet — quotes remain application-side
        return { feeCrypto: 0, feeNgn: 0 };
    }

    async estimateSweepFee(
        asset: CustodyAsset,
        fromAddress: string,
        vaultAddress: string,
        amountCrypto: number
    ): Promise<CustodyFeeEstimate> {
        return this.estimateOutboundFee(asset, fromAddress, vaultAddress, amountCrypto);
    }

    async broadcastOutbound(
        asset: CustodyAsset,
        toAddress: string,
        amountCrypto: number
    ): Promise<CustodyBroadcastResult> {
        Console.info('Thresh0ldCustodyProvider: broadcastOutbound', {
            asset,
            toAddress,
            amountCrypto
        });

        const result = await this.apiClient.sendManyTransaction({
            coin: asset.toLowerCase(),
            targetAddress: toAddress,
            amount: this.formatAmount(asset, amountCrypto)
        });

        return {
            txHash: result.txHash,
            feeCrypto: 0
        };
    }

    async sweepTradeIntentDeposit(
        asset: CustodyAsset,
        intentId: string,
        _fromAddress: string,
        _derivationPath: string,
        amountCrypto: number
    ): Promise<CustodyBroadcastResult> {
        // Deposits land in the Thresh0ld hot wallet; consolidate toward configured vault address
        const vaultAddress = await this.getVaultAddress(asset);
        if (!vaultAddress) {
            throw new ServiceError(
                `Set THRESH0LD_VAULT_ADDRESS_${asset} (or THRESH0LD_VAULT_ADDRESS) before sweeping deposits`
            );
        }
        Console.info('Thresh0ldCustodyProvider: sweepTradeIntentDeposit', {
            intentId,
            asset,
            vaultAddress,
            amountCrypto
        });

        const result = await this.apiClient.sendManyTransaction({
            coin: asset.toLowerCase(),
            targetAddress: vaultAddress,
            amount: this.formatAmount(asset, amountCrypto)
        });

        return {
            txHash: result.txHash,
            feeCrypto: 0
        };
    }

    private formatAmount(asset: CustodyAsset, amount: number): string {
        const decimals = asset === 'BTC' ? 8 : 18;
        return Number(amount).toFixed(decimals);
    }
}
