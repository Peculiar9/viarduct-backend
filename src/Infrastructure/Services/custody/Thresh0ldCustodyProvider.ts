import { createHash } from 'crypto';
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
import { THRESH0LD_ADDRESS_INDEX_BATCH_SIZE } from './thresh0ld/Thresh0ldTypes';

@injectable()
export class Thresh0ldCustodyProvider implements ICustodyProvider {
    readonly providerName = 'thresh0ld' as const;

    constructor(
        @inject(TYPES.Thresh0ldApiClient) private readonly apiClient: Thresh0ldApiClient
    ) {}

    async createDepositAddress(intentId: string, asset: CustodyAsset): Promise<CustodyDepositAddress> {
        const pathIndex = this.pathIndexFromIntentId(intentId);
        this.assertValidPathIndex(pathIndex);
        const derivationPath = this.formatDerivationPath(pathIndex);

        Console.info('Thresh0ldCustodyProvider: generating deposit address', {
            intentId,
            asset,
            pathIndex,
            deposit_derivation_path: derivationPath
        });

        const generated = await this.apiClient.generateAddress(pathIndex, asset.toLowerCase());
        return {
            address: generated.address,
            // Always persist BIP-style path under the first batch: m/0/{0..39999}
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

    /**
     * Deterministic non-negative path index from intent UUID (stable across retries).
     * Thresh0ld API 2.0 expects a numeric address index (see generate-address `path`).
     * Must stay within the first watcher batch: 0..39999.
     */
    private pathIndexFromIntentId(intentId: string): number {
        const digest = createHash('sha256').update(intentId).digest();
        const absoluteCounter = digest.readUInt32BE(0);
        const safeDerivationIndex = absoluteCounter % THRESH0LD_ADDRESS_INDEX_BATCH_SIZE;
        return safeDerivationIndex;
    }

    private assertValidPathIndex(index: number): void {
        if (!Number.isInteger(index) || index < 0 || index >= THRESH0LD_ADDRESS_INDEX_BATCH_SIZE) {
            throw new ServiceError(
                `Derivation index ${index} out of initial Thresh0ld batch index range (0-${THRESH0LD_ADDRESS_INDEX_BATCH_SIZE - 1}).`
            );
        }
    }

    /** Canonical path stored on sell intents for ops / debugging. */
    private formatDerivationPath(index: number): string {
        return `m/0/${index}`;
    }

    private formatAmount(asset: CustodyAsset, amount: number): string {
        const decimals = asset === 'BTC' ? 8 : 18;
        return Number(amount).toFixed(decimals);
    }
}
