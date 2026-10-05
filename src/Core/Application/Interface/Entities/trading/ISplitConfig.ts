export const SPLIT_CONFIG_TITLES = [
    'platform_fee_percentage',
    'btc_network_fee',
    'eth_network_fee'
] as const;

export type SplitConfigTitle = (typeof SPLIT_CONFIG_TITLES)[number];

export type SplitConfigSource = 'db' | 'env' | 'default';

export interface ISplitConfig {
    _id?: string;
    title: string;
    value: number;
    updated_by?: string | null;
    created_at?: string;
    updated_at?: string;
}

export interface ISplitConfigResolvedItem {
    title: SplitConfigTitle;
    value: number;
    source: SplitConfigSource;
    unit: 'percentage';
    updated_at?: string | null;
}

export interface IResolvedSplitConfig {
    platform_fee_percentage: ISplitConfigResolvedItem;
    btc_network_fee: ISplitConfigResolvedItem;
    eth_network_fee: ISplitConfigResolvedItem;
}
