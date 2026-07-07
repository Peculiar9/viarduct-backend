import { injectable } from 'inversify';
import { ServiceError } from '../../../Core/Application/Error/AppError';
import {
    CustodyBroadcastResult,
    CustodyDepositAddress,
    CustodyFeeEstimate,
    ICustodyProvider
} from '../../../Core/Application/Interface/Services/ICustodyProvider';

@injectable()
export class LiminalCustodyProvider implements ICustodyProvider {
    readonly providerName = 'liminal' as const;

    private notImplemented(): never {
        throw new ServiceError('Liminal custody provider is not configured. Set CUSTODY_PROVIDER=inhouse or integrate Liminal API.');
    }

    createDepositAddress(): Promise<CustodyDepositAddress> {
        this.notImplemented();
    }

    registerDepositWatcher(): Promise<void> {
        this.notImplemented();
    }

    getVaultAddress(): Promise<string> {
        this.notImplemented();
    }

    estimateOutboundFee(): Promise<CustodyFeeEstimate> {
        this.notImplemented();
    }

    estimateSweepFee(): Promise<CustodyFeeEstimate> {
        this.notImplemented();
    }

    broadcastOutbound(): Promise<CustodyBroadcastResult> {
        this.notImplemented();
    }

    sweepTradeIntentDeposit(): Promise<CustodyBroadcastResult> {
        this.notImplemented();
    }
}
