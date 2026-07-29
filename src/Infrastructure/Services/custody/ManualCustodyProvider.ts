import { inject, injectable } from 'inversify';
import { TYPES } from '../../../Core/Types/Constants';
import {
    CustodyAsset,
    CustodyBroadcastResult,
    CustodyDepositAddress,
    CustodyFeeEstimate,
    ICustodyProvider
} from '../../../Core/Application/Interface/Services/ICustodyProvider';
import { IPlatformCryptoAddressService } from '../../../Core/Application/Interface/Services/IPlatformCryptoAddressService';
import { ServiceError } from '../../../Core/Application/Error/AppError';
import { Console } from '../../Utils/Console';

@injectable()
export class ManualCustodyProvider implements ICustodyProvider {
    readonly providerName = 'manual' as const;

    constructor(
        @inject(TYPES.PlatformCryptoAddressService)
        private readonly cryptoAddressService: IPlatformCryptoAddressService
    ) {}

    async createDepositAddress(_intentId: string, asset: CustodyAsset): Promise<CustodyDepositAddress> {
        const assigned = await this.cryptoAddressService.assignNextForAsset(asset);
        Console.info('ManualCustodyProvider: assigned deposit address', {
            asset,
            address: assigned.address,
            addressId: assigned._id
        });
        return { address: assigned.address };
    }

    async registerDepositWatcher(address: string, intentId: string, asset: CustodyAsset): Promise<void> {
        // Admin monitors deposits manually in TRANSACTION_MODE=manual
        Console.info('ManualCustodyProvider: skipping deposit watcher', { address, intentId, asset });
    }

    async getVaultAddress(asset: CustodyAsset): Promise<string> {
        const address = await this.cryptoAddressService.getLeastRecentlyAssigned(asset);
        return address.address;
    }

    async estimateOutboundFee(): Promise<CustodyFeeEstimate> {
        return { feeCrypto: 0, feeNgn: 0 };
    }

    async estimateSweepFee(): Promise<CustodyFeeEstimate> {
        return { feeCrypto: 0, feeNgn: 0 };
    }

    async broadcastOutbound(): Promise<CustodyBroadcastResult> {
        throw new ServiceError(
            'Manual mode: admin must send crypto externally and provide outgoing_tx_hash on payout'
        );
    }

    async sweepTradeIntentDeposit(): Promise<CustodyBroadcastResult> {
        // Funds already land in the owner wallet — nothing to sweep
        Console.info('ManualCustodyProvider: sweep skipped (manual mode)');
        return { txHash: 'manual-noop', feeCrypto: 0 };
    }
}
