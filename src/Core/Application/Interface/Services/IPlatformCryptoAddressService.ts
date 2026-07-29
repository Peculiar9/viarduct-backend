import { IPlatformCryptoAddress, PlatformCryptoAsset } from '../Entities/trading/IPlatformCryptoAddress';

export interface IPlatformCryptoAddressService {
    list(filters?: { asset?: string; is_active?: boolean }): Promise<IPlatformCryptoAddress[]>;
    create(
        adminId: string,
        dto: { asset: string; address: string; label?: string }
    ): Promise<IPlatformCryptoAddress>;
    update(
        id: string,
        dto: { label?: string; is_active?: boolean }
    ): Promise<IPlatformCryptoAddress>;
    softDelete(id: string): Promise<void>;
    /**
     * Round-robin assign next active address for asset. Used by ManualCustodyProvider.
     */
    assignNextForAsset(asset: PlatformCryptoAsset): Promise<IPlatformCryptoAddress>;
    getLeastRecentlyAssigned(asset: PlatformCryptoAsset): Promise<IPlatformCryptoAddress>;
}
