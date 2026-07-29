import { IPlatformCryptoAddress, PlatformCryptoAsset } from '../Entities/trading/IPlatformCryptoAddress';

export interface IPlatformCryptoAddressRepository {
    create(entity: IPlatformCryptoAddress): Promise<IPlatformCryptoAddress>;
    findById(id: string): Promise<IPlatformCryptoAddress | null>;
    findAll(filters?: {
        asset?: PlatformCryptoAsset;
        is_active?: boolean;
    }): Promise<IPlatformCryptoAddress[]>;
    findByAddress(address: string): Promise<IPlatformCryptoAddress | null>;
    /**
     * Round-robin: least recently assigned active address for asset.
     * Updates last_assigned_at atomically for the selected row.
     */
    assignNextAddress(asset: PlatformCryptoAsset): Promise<IPlatformCryptoAddress | null>;
    update(id: string, entity: Partial<IPlatformCryptoAddress>): Promise<IPlatformCryptoAddress | null>;
    softDelete(id: string): Promise<IPlatformCryptoAddress | null>;
}
