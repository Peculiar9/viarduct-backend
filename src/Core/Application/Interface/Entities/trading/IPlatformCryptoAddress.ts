export type PlatformCryptoAsset = 'BTC' | 'ETH';

export interface IPlatformCryptoAddress {
    _id?: string;
    asset: PlatformCryptoAsset;
    address: string;
    label?: string | null;
    is_active: boolean;
    last_assigned_at?: string | null;
    created_by: string;
    created_at: string;
    updated_at: string;
}
