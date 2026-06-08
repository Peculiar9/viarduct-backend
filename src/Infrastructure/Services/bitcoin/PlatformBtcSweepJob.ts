import { inject, injectable } from 'inversify';
import { TYPES } from '../../../Core/Types/Constants';
import { Console } from '../../Utils/Console';
import { EnvironmentConfig } from '../../Config/EnvironmentConfig';
import { WalletAccountRepository } from '../../Repository/SQL/wallet/WalletAccountRepository';
import { IUTXORepository } from '../../../Core/Application/Interface/Repositories/IUTXORepository';
import { IBitcoinTransactionService } from '../../../Core/Application/Interface/Services/IBitcoinTransactionService';
import { TransactionManager } from '../../Repository/SQL/Abstractions/TransactionManager';
import { SweepAuditRepository } from '../../Repository/SQL/bitcoin/SweepAuditRepository';
import { ServiceError } from '../../../Core/Application/Error/AppError';
import { IPlatformBtcSweepJob } from '../../../Core/Application/Interface/Services/IPlatformBtcSweepJob';
import { IUTXO } from '../../../Core/Application/Interface/Entities/IUTXO';

const SATOSHI_PER_BTC = 100_000_000;

type FlatSweepInput = {
    walletAccountId: string;
    address: string;
    utxo: IUTXO;
    valueSats: number;
};

type BatchPlan = {
    batchIndex: number;
    inputs: FlatSweepInput[];
    totalGrossSats: number;
    estimatedFeeSats: number;
    netToVaultSats: number;
    accounts: Array<{
        wallet_account_id: string;
        address: string;
        gross_sats: number;
    }>;
};

@injectable()
export class PlatformBtcSweepJob implements IPlatformBtcSweepJob {
    private timer: NodeJS.Timeout | null = null;
    private isRunning = false;
    private readonly enabled: boolean;

    constructor(
        @inject(TYPES.WalletAccountRepository) private readonly walletAccountRepo: WalletAccountRepository,
        @inject(TYPES.UTXORepository) private readonly utxoRepo: IUTXORepository,
        @inject(TYPES.BitcoinTransactionService) private readonly bitcoinTransactionService: IBitcoinTransactionService,
        @inject(TYPES.TransactionManager) private readonly transactionManager: TransactionManager,
        @inject(TYPES.SweepAuditRepository) private readonly sweepAuditRepo: SweepAuditRepository
    ) {
        this.enabled = EnvironmentConfig.getBoolean('PLATFORM_BTC_SWEEP_ENABLED', true);
    }

    start(): void {
        if (!this.enabled) {
            Console.info('PLATFORM BTC SWEEP JOB: Disabled. Set PLATFORM_BTC_SWEEP_ENABLED=true to enable.');
            return;
        }
        if (this.timer) {
            Console.warn('Platform BTC sweep job already scheduled');
            return;
        }

        const next = this.computeNextRunDate();
        const delayMs = Math.max(1000, next.getTime() - Date.now());
        Console.info('🧹 Scheduling Platform BTC sweep job', { nextRun: next.toISOString(), delayMs });

        this.timer = setTimeout(() => {
            this.runOnce().catch((err) => Console.error(err, { message: 'Sweep job run failed' }));
            this.timer = setInterval(() => {
                this.runOnce().catch((err) => Console.error(err, { message: 'Sweep job run failed' }));
            }, 12 * 60 * 60 * 1000);
        }, delayMs);
    }

    stop(): void {
        if (this.timer) {
            clearTimeout(this.timer);
            clearInterval(this.timer as any);
            this.timer = null;
        }
        Console.info('Platform BTC sweep job stopped');
    }

    async runNow(options?: { dryRun?: boolean }): Promise<{
        feeRateSatsVbyte: number;
        maxSatsPerVbyte: number;
        minSweepThresholdBtc: number;
        vaultAddress: string;
        eligibleAccounts: number;
        plannedBatches: Array<{
            batch_index: number;
            input_count: number;
            total_gross_btc: number;
            estimated_fee_btc: number;
            net_to_vault_btc: number;
            accounts: Array<{ wallet_account_id: string; address: string; gross_btc: number }>;
        }>;
        executed?: Array<{
            batch_index: number;
            tx_hash: string;
            fee_btc: number;
            net_to_vault_btc: number;
        }>;
        skippedReason?: string;
    }> {
        const dryRun = options?.dryRun ?? true;
        const vaultAddress = EnvironmentConfig.get('MASTER_VAULT_ADDRESS');
        if (!vaultAddress) {
            throw new ServiceError('MASTER_VAULT_ADDRESS not set');
        }

        const minSweepThresholdBtc = Number(parseFloat(EnvironmentConfig.get('MIN_SWEEP_THRESHOLD_BTC', '0.005')));
        const maxSatsPerVbyte = EnvironmentConfig.getNumber('MAX_SATS_PER_VBYTE', 50);
        const maxAccounts = EnvironmentConfig.getNumber('PLATFORM_BTC_SWEEP_MAX_ACCOUNTS', 200);
        const maxInputsPerBatch = EnvironmentConfig.getNumber('MAX_SWEEP_INPUTS_PER_TX', 150);

        const feeRateSatsVbyte = await this.getEconomyFeeRateSatsVbyte();
        if (feeRateSatsVbyte > maxSatsPerVbyte) {
            return {
                feeRateSatsVbyte,
                maxSatsPerVbyte,
                minSweepThresholdBtc,
                vaultAddress,
                eligibleAccounts: 0,
                plannedBatches: [],
                skippedReason: 'Fees too high, skipping sweep'
            };
        }

        const batches = await this.buildBatchPlans(
            vaultAddress,
            minSweepThresholdBtc,
            maxAccounts,
            maxInputsPerBatch,
            feeRateSatsVbyte
        );

        const plannedBatches = batches.map((b) => ({
            batch_index: b.batchIndex,
            input_count: b.inputs.length,
            total_gross_btc: b.totalGrossSats / SATOSHI_PER_BTC,
            estimated_fee_btc: b.estimatedFeeSats / SATOSHI_PER_BTC,
            net_to_vault_btc: b.netToVaultSats / SATOSHI_PER_BTC,
            accounts: b.accounts.map((a) => ({
                wallet_account_id: a.wallet_account_id,
                address: a.address,
                gross_btc: a.gross_sats / SATOSHI_PER_BTC
            }))
        }));

        if (dryRun) {
            return {
                feeRateSatsVbyte,
                maxSatsPerVbyte,
                minSweepThresholdBtc,
                vaultAddress,
                eligibleAccounts: new Set(batches.flatMap((b) => b.accounts.map((a) => a.wallet_account_id))).size,
                plannedBatches
            };
        }

        const executed = await this.executeBatchPlans(batches, vaultAddress, feeRateSatsVbyte);
        return {
            feeRateSatsVbyte,
            maxSatsPerVbyte,
            minSweepThresholdBtc,
            vaultAddress,
            eligibleAccounts: new Set(batches.flatMap((b) => b.accounts.map((a) => a.wallet_account_id))).size,
            plannedBatches,
            executed
        };
    }

    private async runOnce(): Promise<void> {
        if (this.isRunning) {
            Console.warn('Platform BTC sweep job already running, skipping');
            return;
        }
        this.isRunning = true;
        const startedAt = Date.now();

        try {
            const vaultAddress = EnvironmentConfig.get('MASTER_VAULT_ADDRESS');
            if (!vaultAddress) {
                Console.warn('PLATFORM BTC SWEEP JOB: MASTER_VAULT_ADDRESS not set, skipping');
                return;
            }

            const minSweepThreshold = Number(parseFloat(EnvironmentConfig.get('MIN_SWEEP_THRESHOLD_BTC', '0.005')));
            const maxSatsVb = EnvironmentConfig.getNumber('MAX_SATS_PER_VBYTE', 50);
            const maxAccounts = EnvironmentConfig.getNumber('PLATFORM_BTC_SWEEP_MAX_ACCOUNTS', 200);
            const maxInputsPerBatch = EnvironmentConfig.getNumber('MAX_SWEEP_INPUTS_PER_TX', 150);

            const feeRate = await this.getEconomyFeeRateSatsVbyte();
            if (feeRate > maxSatsVb) {
                Console.info('PLATFORM BTC SWEEP JOB: Fees too high, skipping sweep', { feeRate, maxSatsVb });
                return;
            }

            const batches = await this.buildBatchPlans(
                vaultAddress,
                minSweepThreshold,
                maxAccounts,
                maxInputsPerBatch,
                feeRate
            );

            if (batches.length === 0) {
                Console.info('PLATFORM BTC SWEEP JOB: No eligible batch sweeps');
                return;
            }

            Console.info('PLATFORM BTC SWEEP JOB: Executing batch sweeps', {
                batchCount: batches.length,
                feeRate
            });

            await this.executeBatchPlans(batches, vaultAddress, feeRate);
            Console.info('PLATFORM BTC SWEEP JOB: Completed run', { durationMs: Date.now() - startedAt });
        } finally {
            this.isRunning = false;
        }
    }

    private async buildBatchPlans(
        vaultAddress: string,
        minSweepThresholdBtc: number,
        maxAccounts: number,
        maxInputsPerBatch: number,
        feeRateSatsVbyte: number
    ): Promise<BatchPlan[]> {
        const minSweepThresholdSats = Math.ceil(minSweepThresholdBtc * SATOSHI_PER_BTC);
        const flatInputs = await this.collectFlatInputs(minSweepThresholdBtc, maxAccounts);
        const chunks = this.chunkFlatInputs(flatInputs, maxInputsPerBatch);
        const plans: BatchPlan[] = [];

        for (let i = 0; i < chunks.length; i++) {
            const inputs = chunks[i];
            const totalGrossSats = inputs.reduce((sum, row) => sum + row.valueSats, 0);
            const estimatedFeeSats = this.estimateFeeSats(feeRateSatsVbyte, inputs.length, 1);
            const netToVaultSats = totalGrossSats - estimatedFeeSats;

            if (netToVaultSats < minSweepThresholdSats) {
                continue;
            }

            const accountGross = new Map<string, { wallet_account_id: string; address: string; gross_sats: number }>();
            for (const row of inputs) {
                const existing = accountGross.get(row.walletAccountId);
                if (existing) {
                    existing.gross_sats += row.valueSats;
                } else {
                    accountGross.set(row.walletAccountId, {
                        wallet_account_id: row.walletAccountId,
                        address: row.address,
                        gross_sats: row.valueSats
                    });
                }
            }

            plans.push({
                batchIndex: i,
                inputs,
                totalGrossSats,
                estimatedFeeSats,
                netToVaultSats,
                accounts: Array.from(accountGross.values())
            });
        }

        return plans;
    }

    private async collectFlatInputs(minSweepThresholdBtc: number, maxAccounts: number): Promise<FlatSweepInput[]> {
        const eligible = await this.walletAccountRepo.findBtcAccountsWithPlatformOwnedAbove(
            minSweepThresholdBtc,
            maxAccounts
        );
        const flat: FlatSweepInput[] = [];

        for (const account of eligible) {
            const fromAddress = account.address!;
            const walletAccountId = account._id!;
            const platformOwnedSats = Math.floor(
                Number(parseFloat(String(account.platform_owned_balance ?? 0))) * SATOSHI_PER_BTC
            );
            if (platformOwnedSats <= 0) continue;

            const platformUtxos = await this.utxoRepo.findAvailablePlatformOwnedByAddress(fromAddress);
            let remainingSats = platformOwnedSats;

            for (const utxo of platformUtxos) {
                const valueSats = Math.floor(Number(parseFloat(String(utxo.amount ?? 0))) * SATOSHI_PER_BTC);
                if (valueSats <= 0) continue;
                if (remainingSats <= 0) break;

                flat.push({
                    walletAccountId,
                    address: fromAddress,
                    utxo,
                    valueSats
                });
                remainingSats -= valueSats;
            }
        }

        return flat;
    }

    private chunkFlatInputs(inputs: FlatSweepInput[], maxInputsPerBatch: number): FlatSweepInput[][] {
        const chunks: FlatSweepInput[][] = [];
        for (let i = 0; i < inputs.length; i += maxInputsPerBatch) {
            chunks.push(inputs.slice(i, i + maxInputsPerBatch));
        }
        return chunks;
    }

    private async executeBatchPlans(
        batches: BatchPlan[],
        vaultAddress: string,
        feeRateSatsVbyte: number
    ): Promise<Array<{ batch_index: number; tx_hash: string; fee_btc: number; net_to_vault_btc: number }>> {
        const executed: Array<{ batch_index: number; tx_hash: string; fee_btc: number; net_to_vault_btc: number }> =
            [];

        for (const plan of batches) {
            try {
                const txHash = await this.executeSingleBatch(plan, vaultAddress, feeRateSatsVbyte);
                executed.push({
                    batch_index: plan.batchIndex,
                    tx_hash: txHash,
                    fee_btc: plan.estimatedFeeSats / SATOSHI_PER_BTC,
                    net_to_vault_btc: plan.netToVaultSats / SATOSHI_PER_BTC
                });
            } catch (error: any) {
                Console.error(error, {
                    message: 'Batch sweep failed',
                    batchIndex: plan.batchIndex,
                    inputCount: plan.inputs.length
                });
            }
        }

        return executed;
    }

    private async executeSingleBatch(
        plan: BatchPlan,
        vaultAddress: string,
        feeRateSatsVbyte: number
    ): Promise<string> {
        const batchInputs = plan.inputs.map((row) => ({
            walletAccountId: row.walletAccountId,
            address: row.address,
            txid: row.utxo.txid,
            vout: Number(row.utxo.vout),
            amount: row.valueSats / SATOSHI_PER_BTC,
            script: row.utxo.script || undefined
        }));

        const built = await this.bitcoinTransactionService.buildBatchSweepTransaction(
            vaultAddress,
            batchInputs,
            feeRateSatsVbyte
        );

        const signedHex = await this.bitcoinTransactionService.signBatchSweepTransaction({
            psbt: built.psbt,
            inputSigners: built.inputSigners
        });
        const txHash = await this.bitcoinTransactionService.broadcastTransaction(signedHex);

        const spentUtxoIds = plan.inputs.map((row) => row.utxo._id).filter(Boolean) as string[];
        if (spentUtxoIds.length > 0) {
            await this.utxoRepo.markAsSpent(spentUtxoIds, txHash);
        }

        const feeBtc = built.feeSats / SATOSHI_PER_BTC;
        const totalGrossSats = built.totalInputSats;

        for (const account of plan.accounts) {
            const share = account.gross_sats / totalGrossSats;
            const feeShareBtc = feeBtc * share;
            const netMovedBtc = account.gross_sats / SATOSHI_PER_BTC - feeShareBtc;
            const amountDebitedBtc = account.gross_sats / SATOSHI_PER_BTC;

            await this.transactionManager.beginTransaction();
            try {
                const current = await this.walletAccountRepo.findById(account.wallet_account_id);
                const currentPlatformOwned = Number(parseFloat(String(current?.platform_owned_balance ?? 0)));
                const currentTotalOnchain = Number(parseFloat(String(current?.total_onchain_balance ?? 0)));

                await this.walletAccountRepo.update(account.wallet_account_id, {
                    platform_owned_balance: Math.max(0, currentPlatformOwned - amountDebitedBtc),
                    total_onchain_balance: Math.max(0, currentTotalOnchain - amountDebitedBtc)
                });

                await this.sweepAuditRepo.create({
                    wallet_account_id: account.wallet_account_id,
                    from_address: account.address,
                    to_address: vaultAddress,
                    tx_hash: txHash,
                    amount_moved: netMovedBtc,
                    fee_paid: feeShareBtc,
                    amount_debited: amountDebitedBtc,
                    fee_rate_sats_vbyte: feeRateSatsVbyte,
                    asset: 'BTC',
                    status: 'broadcasted',
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                });

                await this.transactionManager.commit();
            } catch (dbErr: any) {
                await this.transactionManager.rollback().catch(() => {});
                try {
                    await this.sweepAuditRepo.create({
                        wallet_account_id: account.wallet_account_id,
                        from_address: account.address,
                        to_address: vaultAddress,
                        tx_hash: txHash,
                        amount_moved: netMovedBtc,
                        fee_paid: feeShareBtc,
                        amount_debited: amountDebitedBtc,
                        fee_rate_sats_vbyte: feeRateSatsVbyte,
                        asset: 'BTC',
                        status: 'failed',
                        failure_reason: `DB update failed after broadcast: ${dbErr.message}`,
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString()
                    });
                } catch {
                    /* ignore */
                }
                throw dbErr;
            }
        }

        Console.info('Batch sweep broadcasted', {
            txHash,
            batchIndex: plan.batchIndex,
            inputs: plan.inputs.length,
            feeBtc,
            netToVaultBtc: built.netToVaultSats / SATOSHI_PER_BTC
        });

        return txHash;
    }

    private computeNextRunDate(): Date {
        const hoursCsv = EnvironmentConfig.get('PLATFORM_BTC_SWEEP_HOURS', '0,12');
        const hours = hoursCsv
            .split(',')
            .map((h) => parseInt(h.trim(), 10))
            .filter((h) => !Number.isNaN(h) && h >= 0 && h <= 23)
            .sort((a, b) => a - b);

        const now = new Date();
        for (const h of hours) {
            const candidate = new Date(now);
            candidate.setHours(h, 0, 0, 0);
            if (candidate.getTime() > now.getTime()) return candidate;
        }

        const nextDay = new Date(now);
        nextDay.setDate(now.getDate() + 1);
        nextDay.setHours(hours[0] ?? 0, 0, 0, 0);
        return nextDay;
    }

    private async getEconomyFeeRateSatsVbyte(): Promise<number> {
        const network = EnvironmentConfig.get('BITCOIN_NETWORK', 'testnet');
        const baseUrl =
            network === 'mainnet'
                ? 'https://api.blockcypher.com/v1/btc/main'
                : 'https://api.blockcypher.com/v1/btc/test3';

        const res = await fetch(baseUrl, { method: 'GET' });
        if (!res.ok) {
            throw new ServiceError(`Failed to fetch fee rates from BlockCypher: HTTP ${res.status}`);
        }
        const data: any = await res.json();
        const lowPerKb = Number(data.low_fee_per_kb ?? data.medium_fee_per_kb ?? 10000);
        return Math.max(1, Math.floor(lowPerKb / 1000));
    }

    private estimateFeeSats(feeRateSatsVb: number, inputCount: number, outputCount: number): number {
        const vbytes = 10 + 68 * inputCount + 31 * outputCount;
        return Math.max(1, Math.ceil(feeRateSatsVb * vbytes));
    }
}
