import { inject, injectable } from 'inversify';
import { TYPES } from '../../../Core/Types/Constants';
import { IPlatformCryptoAddressService } from '../../../Core/Application/Interface/Services/IPlatformCryptoAddressService';
import { IPlatformCryptoAddressRepository } from '../../../Core/Application/Interface/Repositories/IPlatformCryptoAddressRepository';
import {
    IPlatformCryptoAddress,
    PlatformCryptoAsset
} from '../../../Core/Application/Interface/Entities/trading/IPlatformCryptoAddress';
import { NotFoundError, ValidationError } from '../../../Core/Application/Error/AppError';

@injectable()
export class PlatformCryptoAddressService implements IPlatformCryptoAddressService {
    constructor(
        @inject(TYPES.PlatformCryptoAddressRepository)
        private readonly addressRepo: IPlatformCryptoAddressRepository
    ) {}

    async list(filters: { asset?: string; is_active?: boolean } = {}): Promise<IPlatformCryptoAddress[]> {
        const asset = filters.asset ? this.parseAsset(filters.asset) : undefined;
        return this.addressRepo.findAll({
            asset,
            is_active: filters.is_active
        });
    }

    async create(
        adminId: string,
        dto: { asset: string; address: string; label?: string }
    ): Promise<IPlatformCryptoAddress> {
        const asset = this.parseAsset(dto.asset);
        const address = this.normalizeAddress(dto.address, asset);

        const existing = await this.addressRepo.findByAddress(address);
        if (existing) {
            throw new ValidationError('This crypto address is already registered');
        }

        const nowIso = new Date().toISOString();
        return this.addressRepo.create({
            asset,
            address,
            label: dto.label?.trim() || null,
            is_active: true,
            last_assigned_at: null,
            created_by: adminId,
            created_at: nowIso,
            updated_at: nowIso
        });
    }

    async update(
        id: string,
        dto: { label?: string; is_active?: boolean }
    ): Promise<IPlatformCryptoAddress> {
        const existing = await this.addressRepo.findById(id);
        if (!existing) {
            throw new NotFoundError('Crypto address not found');
        }

        const patch: Partial<IPlatformCryptoAddress> = {};
        if (dto.label !== undefined) {
            patch.label = dto.label.trim() || null;
        }
        if (dto.is_active !== undefined) {
            patch.is_active = dto.is_active;
        }

        if (Object.keys(patch).length === 0) {
            throw new ValidationError('Provide at least one field to update (label or is_active)');
        }

        const updated = await this.addressRepo.update(id, patch);
        if (!updated) {
            throw new ValidationError('Failed to update crypto address');
        }
        return updated;
    }

    async softDelete(id: string): Promise<void> {
        const existing = await this.addressRepo.findById(id);
        if (!existing) {
            throw new NotFoundError('Crypto address not found');
        }
        const updated = await this.addressRepo.softDelete(id);
        if (!updated) {
            throw new ValidationError('Failed to delete crypto address');
        }
    }

    async assignNextForAsset(asset: PlatformCryptoAsset): Promise<IPlatformCryptoAddress> {
        const assigned = await this.addressRepo.assignNextAddress(asset);
        if (!assigned) {
            throw new ValidationError(
                `No active ${asset} platform addresses configured. Add one via /admin/crypto-addresses.`
            );
        }
        return assigned;
    }

    async getLeastRecentlyAssigned(asset: PlatformCryptoAsset): Promise<IPlatformCryptoAddress> {
        const addresses = await this.addressRepo.findAll({ asset, is_active: true });
        if (addresses.length === 0) {
            throw new ValidationError(
                `No active ${asset} platform addresses configured. Add one via /admin/crypto-addresses.`
            );
        }
        return addresses.sort((a, b) => {
            const aTime = a.last_assigned_at ? new Date(a.last_assigned_at).getTime() : 0;
            const bTime = b.last_assigned_at ? new Date(b.last_assigned_at).getTime() : 0;
            return aTime - bTime;
        })[0];
    }

    private parseAsset(asset: string): PlatformCryptoAsset {
        const normalized = String(asset || '').toUpperCase().trim();
        if (normalized !== 'BTC' && normalized !== 'ETH') {
            throw new ValidationError('asset must be BTC or ETH');
        }
        return normalized;
    }

    private normalizeAddress(address: string, asset: PlatformCryptoAsset): string {
        const trimmed = String(address || '').trim();
        if (!trimmed) {
            throw new ValidationError('address is required');
        }

        if (asset === 'BTC') {
            // Basic sanity: bech32 (tb1/bc1), legacy 1/3, or testnet m/n/2
            if (!/^(bc1|tb1|[13mn2])[a-zA-HJ-NP-Z0-9]{25,62}$/i.test(trimmed)) {
                throw new ValidationError('Invalid BTC address format');
            }
            return trimmed;
        }

        if (!/^0x[a-fA-F0-9]{40}$/.test(trimmed)) {
            throw new ValidationError('Invalid ETH address format (expected 0x + 40 hex chars)');
        }
        return trimmed;
    }
}
