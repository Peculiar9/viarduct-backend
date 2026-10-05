import {
    IResolvedSplitConfig,
    SplitConfigTitle
} from '../Entities/trading/ISplitConfig';

export interface IUpsertSplitConfigInput {
    platform_fee_percentage?: number;
    btc_network_fee?: number;
    eth_network_fee?: number;
}

export interface ISplitConfigService {
    getResolved(): Promise<IResolvedSplitConfig>;
    upsert(adminId: string, input: IUpsertSplitConfigInput): Promise<IResolvedSplitConfig>;
    getPercentage(title: SplitConfigTitle): Promise<number>;
}
