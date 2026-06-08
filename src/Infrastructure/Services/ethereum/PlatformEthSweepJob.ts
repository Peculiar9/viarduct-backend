import { inject, injectable } from 'inversify';
import { TYPES } from '../../../Core/Types/Constants';
import { Console } from '../../Utils/Console';
import { EnvironmentConfig } from '../../Config/EnvironmentConfig';
import { WalletAccountRepository } from '../../Repository/SQL/wallet/WalletAccountRepository';
import { IEthereumBlockchainService } from '../../../Core/Application/Interface/Services/IEthereumBlockchainService';
import { IEthereumTransactionService } from '../../../Core/Application/Interface/Services/IEthereumTransactionService';
import { IEthereumWalletService } from '../../../Core/Application/Interface/Services/IEthereumWalletService';
import { TransactionManager } from '../../Repository/SQL/Abstractions/TransactionManager';
import { SweepAuditRepository } from '../../Repository/SQL/bitcoin/SweepAuditRepository';
import { ServiceError } from '../../../Core/Application/Error/AppError';
import { IPlatformEthSweepJob } from '../../../Core/Application/Interface/Services/IPlatformEthSweepJob';

type EthSweepPlan = {
    wallet_account_id: string;
    address: string;
    platform_owned_balance: number;
    onchain_balance: number;
    gross_available: number;
    estimated_fee_eth: number;
    net_to_move_eth: number;
};

@injectable()
export class PlatformEthSweepJob implements IPlatformEthSweepJob {
    private timer: NodeJS.Timeout | null = null;
    private isRunning = false;
    private readonly enabled: boolean;

    constructor(
        @inject(TYPES.WalletAccountRepository) private readonly walletAccountRepo: WalletAccountRepository,
        @inject(TYPES.EthereumBlockchainService)
        private readonly ethereumBlockchainService: IEthereumBlockchainService,
        @inject(TYPES.EthereumTransactionService)
        private readonly ethereumTransactionService: IEthereumTransactionService,
        @inject(TYPES.EthereumWalletService) private readonly ethereumWalletService: IEthereumWalletService,
        @inject(TYPES.TransactionManager) private readonly transactionManager: TransactionManager,
        @inject(TYPES.SweepAuditRepository) private readonly sweepAuditRepo: SweepAuditRepository
    ) {
        this.enabled = EnvironmentConfig.getBoolean('PLATFORM_ETH_SWEEP_ENABLED', true);
    }

    start(): void {
        if (!this.enabled) {
            Console.info('PLATFORM ETH SWEEP JOB: Disabled. Set PLATFORM_ETH_SWEEP_ENABLED=true to enable.');
            return;
        }
        if (this.timer) {
            Console.warn('Platform ETH sweep job already scheduled');
            return;
        }

        const next = this.computeNextRunDate();
        const delayMs = Math.max(1000, next.getTime() - Date.now());
        Console.info('🧹 Scheduling Platform ETH sweep job', { nextRun: next.toISOString(), delayMs });

        this.timer = setTimeout(() => {
            this.runOnce().catch((err) => Console.error(err, { message: 'ETH sweep job run failed' }));
            this.timer = setInterval(() => {
                this.runOnce().catch((err) => Console.error(err, { message: 'ETH sweep job run failed' }));
            }, 12 * 60 * 60 * 1000);
        }, delayMs);
    }

    stop(): void {
        if (this.timer) {
            clearTimeout(this.timer);
            clearInterval(this.timer as any);
            this.timer = null;
        }
        Console.info('Platform ETH sweep job stopped');
    }

    async runNow(options?: { dryRun?: boolean }): Promise<{
        maxFeeGwei: number;
        minSweepThresholdEth: number;
        vaultAddress: string;
        eligibleAccounts: number;
        plannedSweeps: Array<{
            wallet_account_id: string;
            address: string;
            platform_owned_balance: number;
            onchain_balance: number;
            gross_available: number;
            estimated_fee_eth: number;
            net_to_move_eth: number;
        }>;
        executed?: Array<{
            wallet_account_id: string;
            address: string;
            tx_hash: string;
            net_to_move_eth: number;
            fee_eth: number;
        }>;
        skippedReason?: string;
    }> {
        const dryRun = options?.dryRun ?? true;
        const vaultAddress = await this.resolveVaultAddress();
        const minSweepThresholdEth = Number(parseFloat(EnvironmentConfig.get('MIN_SWEEP_THRESHOLD_ETH', '0.01')));
        const maxFeeGwei = EnvironmentConfig.getNumber('MAX_SWEEP_FEE_GWEI', 80);
        const maxAccounts = EnvironmentConfig.getNumber('PLATFORM_ETH_SWEEP_MAX_ACCOUNTS', 200);

        const feeGwei = await this.getCurrentMaxFeeGwei();
        if (feeGwei > maxFeeGwei) {
            return {
                maxFeeGwei,
                minSweepThresholdEth,
                vaultAddress,
                eligibleAccounts: 0,
                plannedSweeps: [],
                skippedReason: 'Gas price too high, skipping ETH sweep'
            };
        }

        const plans = await this.buildPlans(minSweepThresholdEth, maxAccounts, vaultAddress);
        const plannedSweeps = plans.map((p) => ({
            wallet_account_id: p.wallet_account_id,
            address: p.address,
            platform_owned_balance: p.platform_owned_balance,
            onchain_balance: p.onchain_balance,
            gross_available: p.gross_available,
            estimated_fee_eth: p.estimated_fee_eth,
            net_to_move_eth: p.net_to_move_eth
        }));

        if (dryRun) {
            return {
                maxFeeGwei,
                minSweepThresholdEth,
                vaultAddress,
                eligibleAccounts: plans.length,
                plannedSweeps
            };
        }

        const executed = await this.executePlans(plans, vaultAddress);
        return {
            maxFeeGwei,
            minSweepThresholdEth,
            vaultAddress,
            eligibleAccounts: plans.length,
            plannedSweeps,
            executed
        };
    }

    private async runOnce(): Promise<void> {
        if (this.isRunning) {
            Console.warn('Platform ETH sweep job already running, skipping');
            return;
        }
        this.isRunning = true;
        const startedAt = Date.now();

        try {
            const vaultAddress = await this.resolveVaultAddress();
            const minSweepThresholdEth = Number(parseFloat(EnvironmentConfig.get('MIN_SWEEP_THRESHOLD_ETH', '0.01')));
            const maxFeeGwei = EnvironmentConfig.getNumber('MAX_SWEEP_FEE_GWEI', 80);
            const maxAccounts = EnvironmentConfig.getNumber('PLATFORM_ETH_SWEEP_MAX_ACCOUNTS', 200);

            const feeGwei = await this.getCurrentMaxFeeGwei();
            if (feeGwei > maxFeeGwei) {
                Console.info('PLATFORM ETH SWEEP JOB: Gas too high, skipping', { feeGwei, maxFeeGwei });
                return;
            }

            const plans = await this.buildPlans(minSweepThresholdEth, maxAccounts, vaultAddress);
            if (plans.length === 0) {
                Console.info('PLATFORM ETH SWEEP JOB: No eligible accounts');
                return;
            }

            await this.executePlans(plans, vaultAddress);
            Console.info('PLATFORM ETH SWEEP JOB: Completed run', { durationMs: Date.now() - startedAt });
        } finally {
            this.isRunning = false;
        }
    }

    private async resolveVaultAddress(): Promise<string> {
        const configured = EnvironmentConfig.get('MASTER_ETH_VAULT_ADDRESS', '').trim();
        if (configured) {
            return configured;
        }
        return this.ethereumWalletService.getPlatformWalletAddress();
    }

    private async buildPlans(
        minSweepThresholdEth: number,
        maxAccounts: number,
        vaultAddress: string
    ): Promise<EthSweepPlan[]> {
        const eligible = await this.walletAccountRepo.findEthAccountsWithPlatformOwnedAbove(
            minSweepThresholdEth,
            maxAccounts
        );
        const plans: EthSweepPlan[] = [];

        for (const account of eligible) {
            const walletAccountId = account._id!;
            const address = account.address!;
            const platformOwned = Number(parseFloat(String(account.platform_owned_balance ?? 0)));
            if (platformOwned <= 0) continue;

            const onchainBalance = await this.ethereumBlockchainService.getAddressBalance(address);
            const grossAvailable = Math.min(platformOwned, onchainBalance);
            if (grossAvailable < minSweepThresholdEth) continue;

            const estimatedFeeEth = await this.ethereumTransactionService.estimateNativeTransferFee(
                address,
                vaultAddress,
                grossAvailable
            );
            // Leave headroom so value + gas fits in on-chain balance
            const netToMove = grossAvailable - estimatedFeeEth * 1.15;
            if (netToMove <= 0) continue;

            plans.push({
                wallet_account_id: walletAccountId,
                address,
                platform_owned_balance: platformOwned,
                onchain_balance: onchainBalance,
                gross_available: grossAvailable,
                estimated_fee_eth: estimatedFeeEth,
                net_to_move_eth: netToMove
            });
        }

        return plans;
    }

    private async executePlans(
        plans: EthSweepPlan[],
        vaultAddress: string
    ): Promise<
        Array<{ wallet_account_id: string; address: string; tx_hash: string; net_to_move_eth: number; fee_eth: number }>
    > {
        const executed: Array<{
            wallet_account_id: string;
            address: string;
            tx_hash: string;
            net_to_move_eth: number;
            fee_eth: number;
        }> = [];

        for (const plan of plans) {
            try {
                const txHash = await this.executeSingleSweep(plan, vaultAddress);
                executed.push({
                    wallet_account_id: plan.wallet_account_id,
                    address: plan.address,
                    tx_hash: txHash,
                    net_to_move_eth: plan.net_to_move_eth,
                    fee_eth: plan.estimated_fee_eth
                });
            } catch (error: any) {
                Console.error(error, {
                    message: 'ETH sweep failed for account',
                    address: plan.address,
                    walletAccountId: plan.wallet_account_id
                });
            }
        }

        return executed;
    }

    private async executeSingleSweep(plan: EthSweepPlan, vaultAddress: string): Promise<string> {
        const { txHash, feeEth } = await this.ethereumTransactionService.sendNativeSweep(
            plan.wallet_account_id,
            plan.address,
            vaultAddress,
            plan.net_to_move_eth
        );

        const amountDebited = plan.net_to_move_eth + feeEth;

        await this.transactionManager.beginTransaction();
        try {
            const current = await this.walletAccountRepo.findById(plan.wallet_account_id);
            const currentPlatformOwned = Number(parseFloat(String(current?.platform_owned_balance ?? 0)));
            const currentTotalOnchain = Number(parseFloat(String(current?.total_onchain_balance ?? 0)));

            await this.walletAccountRepo.update(plan.wallet_account_id, {
                platform_owned_balance: Math.max(0, currentPlatformOwned - amountDebited),
                total_onchain_balance: Math.max(0, currentTotalOnchain - amountDebited)
            });

            await this.sweepAuditRepo.create({
                wallet_account_id: plan.wallet_account_id,
                from_address: plan.address,
                to_address: vaultAddress,
                tx_hash: txHash,
                amount_moved: plan.net_to_move_eth,
                fee_paid: feeEth,
                amount_debited: amountDebited,
                fee_rate_sats_vbyte: null,
                asset: 'ETH',
                status: 'broadcasted',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            });

            await this.transactionManager.commit();
        } catch (dbErr: any) {
            await this.transactionManager.rollback().catch(() => {});
            try {
                await this.sweepAuditRepo.create({
                    wallet_account_id: plan.wallet_account_id,
                    from_address: plan.address,
                    to_address: vaultAddress,
                    tx_hash: txHash,
                    amount_moved: plan.net_to_move_eth,
                    fee_paid: feeEth,
                    amount_debited: plan.net_to_move_eth + feeEth,
                    fee_rate_sats_vbyte: null,
                    asset: 'ETH',
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

        Console.info('ETH sweep broadcasted', {
            address: plan.address,
            txHash,
            netToMove: plan.net_to_move_eth,
            feeEth
        });

        return txHash;
    }

    private computeNextRunDate(): Date {
        const hoursCsv = EnvironmentConfig.get('PLATFORM_ETH_SWEEP_HOURS', '0,12');
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

    private async getCurrentMaxFeeGwei(): Promise<number> {
        const provider = this.ethereumBlockchainService.getProvider();
        const feeData = await provider.getFeeData();
        const gasPrice = feeData.maxFeePerGas ?? feeData.gasPrice;
        if (!gasPrice) {
            return 0;
        }
        return Number(gasPrice) / 1e9;
    }
}
