import { inject, injectable } from 'inversify';
import { TYPES } from '../../../Core/Types/Constants';
import { ValidationError } from '../../../Core/Application/Error/AppError';
import {
    IResolvedSplitConfig,
    ISplitConfig,
    ISplitConfigResolvedItem,
    SPLIT_CONFIG_TITLES,
    SplitConfigTitle
} from '../../../Core/Application/Interface/Entities/trading/ISplitConfig';
import { ISplitConfigRepository } from '../../../Core/Application/Interface/Repositories/ISplitConfigRepository';
import {
    ISplitConfigService,
    IUpsertSplitConfigInput
} from '../../../Core/Application/Interface/Services/ISplitConfigService';
import { EnvironmentConfig } from '../../Config/EnvironmentConfig';

const ENV_KEYS: Record<SplitConfigTitle, string> = {
    platform_fee_percentage: 'PLATFORM_FEE_PERCENTAGE',
    btc_network_fee: 'BTC_NETWORK_FEE',
    eth_network_fee: 'ETH_NETWORK_FEE'
};

const DEFAULT_PERCENTAGES: Record<SplitConfigTitle, number> = {
    platform_fee_percentage: 10,
    btc_network_fee: 0,
    eth_network_fee: 0
};

@injectable()
export class SplitConfigService implements ISplitConfigService {
    constructor(
        @inject(TYPES.SplitConfigRepository) private readonly splitConfigRepo: ISplitConfigRepository
    ) {}

    async getResolved(): Promise<IResolvedSplitConfig> {
        const rows = await this.splitConfigRepo.findAll();
        const byTitle = new Map(rows.map((row) => [row.title, row]));

        return {
            platform_fee_percentage: this.resolveItem('platform_fee_percentage', byTitle.get('platform_fee_percentage')),
            btc_network_fee: this.resolveItem('btc_network_fee', byTitle.get('btc_network_fee')),
            eth_network_fee: this.resolveItem('eth_network_fee', byTitle.get('eth_network_fee'))
        };
    }

    async upsert(adminId: string, input: IUpsertSplitConfigInput): Promise<IResolvedSplitConfig> {
        const updates: Array<[SplitConfigTitle, number]> = [];
        for (const title of SPLIT_CONFIG_TITLES) {
            const raw = input[title];
            if (raw === undefined) continue;
            updates.push([title, this.assertPercentage(title, raw)]);
        }

        if (updates.length === 0) {
            throw new ValidationError(
                'Provide at least one of platform_fee_percentage, btc_network_fee, eth_network_fee'
            );
        }

        for (const [title, value] of updates) {
            await this.splitConfigRepo.upsertByTitle(title, value, adminId);
        }

        return this.getResolved();
    }

    async getPercentage(title: SplitConfigTitle): Promise<number> {
        const resolved = await this.getResolved();
        return resolved[title].value;
    }

    private resolveItem(title: SplitConfigTitle, row?: ISplitConfig): ISplitConfigResolvedItem {
        if (row && this.isValidPercentage(Number(row.value))) {
            return {
                title,
                value: Number(row.value),
                source: 'db',
                unit: 'percentage',
                updated_at: row.updated_at ?? null
            };
        }

        const fromEnv = this.readEnvPercentage(title);
        if (fromEnv != null) {
            return {
                title,
                value: fromEnv,
                source: 'env',
                unit: 'percentage',
                updated_at: null
            };
        }

        return {
            title,
            value: DEFAULT_PERCENTAGES[title],
            source: 'default',
            unit: 'percentage',
            updated_at: null
        };
    }

    private readEnvPercentage(title: SplitConfigTitle): number | null {
        const raw = EnvironmentConfig.get(ENV_KEYS[title], '').trim();
        if (raw === '') return null;
        const parsed = Number(raw);
        if (!Number.isFinite(parsed) || parsed < 0) return null;
        // PLATFORM_FEE_PERCENTAGE historically stored a fraction (0.1 = 10%).
        if (title === 'platform_fee_percentage' && parsed > 0 && parsed <= 1) {
            return parsed * 100;
        }
        if (!this.isValidPercentage(parsed)) return null;
        return parsed;
    }

    private assertPercentage(title: SplitConfigTitle, value: number): number {
        if (!this.isValidPercentage(value)) {
            throw new ValidationError(`${title} must be a number between 0 and 100`);
        }
        return value;
    }

    private isValidPercentage(value: number): boolean {
        return Number.isFinite(value) && value >= 0 && value <= 100;
    }
}
