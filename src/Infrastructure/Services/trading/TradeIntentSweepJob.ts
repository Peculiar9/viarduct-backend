import { inject, injectable } from 'inversify';
import { TYPES } from '../../../Core/Types/Constants';
import { ITradeIntentRepository } from '../../../Core/Application/Interface/Repositories/ITradeIntentRepository';
import { ICustodyProvider } from '../../../Core/Application/Interface/Services/ICustodyProvider';
import { SweepAuditRepository } from '../../Repository/SQL/bitcoin/SweepAuditRepository';
import { EnvironmentConfig } from '../../Config/EnvironmentConfig';
import { Console } from '../../Utils/Console';

@injectable()
export class TradeIntentSweepJob {
    private timer: NodeJS.Timeout | null = null;

    constructor(
        @inject(TYPES.TradeIntentRepository) private readonly tradeIntentRepo: ITradeIntentRepository,
        @inject(TYPES.CustodyProvider) private readonly custodyProvider: ICustodyProvider,
        @inject(TYPES.SweepAuditRepository) private readonly sweepAuditRepo: SweepAuditRepository
    ) {}

    start(): void {
        const enabled = EnvironmentConfig.get('PLATFORM_TRADE_INTENT_SWEEP_ENABLED', 'true').toLowerCase() === 'true';
        if (!enabled) {
            Console.info('Trade intent sweep job disabled');
            return;
        }
        const hours = Number(EnvironmentConfig.get('PLATFORM_TRADE_INTENT_SWEEP_HOURS', '12'));
        const intervalMs = Math.max(1, hours) * 60 * 60 * 1000;
        this.timer = setInterval(() => {
            this.runOnce().catch((err) => Console.error(err, { message: 'Trade intent sweep failed' }));
        }, intervalMs);
        Console.info('Trade intent sweep job started', { intervalHours: hours });
    }

    stop(): void {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }

    async runOnce(): Promise<void> {
        const intents = await this.tradeIntentRepo.findSellIntentsReadyForSweep(50);
        for (const intent of intents) {
            if (!intent.deposit_address || !intent.deposit_derivation_path) {
                continue;
            }
            const asset = intent.crypto_type.toUpperCase() as 'BTC' | 'ETH';
            const amount = Number(intent.incoming_crypto_amount ?? intent.quoted_crypto_amount);
            if (amount <= 0) {
                continue;
            }
            try {
                const vault = await this.custodyProvider.getVaultAddress(asset);
                const result = await this.custodyProvider.sweepTradeIntentDeposit(
                    asset,
                    intent._id!,
                    intent.deposit_address,
                    intent.deposit_derivation_path,
                    amount
                );
                const now = new Date().toISOString();
                await this.sweepAuditRepo.create({
                    trade_intent_id: intent._id,
                    from_address: intent.deposit_address,
                    to_address: vault,
                    tx_hash: result.txHash,
                    amount_moved: amount - (result.feeCrypto ?? 0),
                    fee_paid: result.feeCrypto ?? 0,
                    amount_debited: amount,
                    asset,
                    status: 'broadcasted',
                    created_at: now,
                    updated_at: now
                });
                await this.tradeIntentRepo.update(intent._id!, {
                    swept_at: now,
                    actual_gas_crypto: result.feeCrypto ?? intent.quoted_gas_crypto,
                    outgoing_tx_hash: result.txHash,
                    updated_at: now
                });
                Console.info('Trade intent deposit swept', { intentId: intent._id, txHash: result.txHash });
            } catch (error: any) {
                Console.error(error, { message: 'Failed to sweep trade intent', intentId: intent._id });
            }
        }
    }
}
