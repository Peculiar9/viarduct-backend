import { inject, injectable } from 'inversify';
import { TYPES } from '../../../Core/Types/Constants';
import { IUserDeviceTokenService } from '../../../Core/Application/Interface/Services/IUserDeviceTokenService';
import { IUserDeviceTokenRepository } from '../../../Core/Application/Interface/Repositories/IUserDeviceTokenRepository';
import {
    DeviceTokenPlatform,
    IUserDeviceToken
} from '../../../Core/Application/Interface/Entities/notifications/IUserDeviceToken';
import { ValidationError } from '../../../Core/Application/Error/AppError';

@injectable()
export class UserDeviceTokenService implements IUserDeviceTokenService {
    constructor(
        @inject(TYPES.UserDeviceTokenRepository)
        private readonly tokenRepo: IUserDeviceTokenRepository
    ) {}

    async register(
        userId: string,
        dto: { token: string; platform: DeviceTokenPlatform | string; device_id?: string }
    ): Promise<IUserDeviceToken> {
        if (!userId) throw new ValidationError('userId is required');

        const token = String(dto.token || '').trim();
        if (!token) throw new ValidationError('token is required');

        const platform = this.parsePlatform(dto.platform);
        const deviceId = dto.device_id?.trim() || null;
        const nowIso = new Date().toISOString();

        // Prefer upsert by user + device_id when client sends a stable device id
        if (deviceId) {
            const byDevice = await this.tokenRepo.findByUserAndDeviceId(userId, deviceId);
            if (byDevice) {
                const updated = await this.tokenRepo.update(byDevice._id!, {
                    token,
                    platform,
                    is_active: true,
                    last_seen_at: nowIso
                });
                if (updated) return updated;
            }
        }

        const existingByToken = await this.tokenRepo.findByToken(token);
        if (existingByToken) {
            // Reassign token to current user if it belonged to someone else / was inactive
            const updated = await this.tokenRepo.update(existingByToken._id!, {
                user_id: userId,
                platform,
                device_id: deviceId ?? existingByToken.device_id ?? null,
                is_active: true,
                last_seen_at: nowIso
            });
            if (updated) return updated;
        }

        return this.tokenRepo.create({
            user_id: userId,
            token,
            platform,
            device_id: deviceId,
            is_active: true,
            last_seen_at: nowIso,
            created_at: nowIso,
            updated_at: nowIso
        });
    }

    async unregister(userId: string, token: string): Promise<void> {
        if (!userId) throw new ValidationError('userId is required');
        const trimmed = String(token || '').trim();
        if (!trimmed) throw new ValidationError('token is required');

        const existing = await this.tokenRepo.findByToken(trimmed);
        if (!existing || existing.user_id !== userId) {
            // Idempotent: nothing to do
            return;
        }
        await this.tokenRepo.deactivateByToken(trimmed);
    }

    async listActiveTokensForUser(userId: string): Promise<IUserDeviceToken[]> {
        if (!userId) return [];
        return this.tokenRepo.findActiveByUserId(userId);
    }

    async deactivateToken(token: string): Promise<void> {
        const trimmed = String(token || '').trim();
        if (!trimmed) return;
        await this.tokenRepo.deactivateByToken(trimmed);
    }

    async deactivateTokenById(id: string): Promise<void> {
        if (!id) return;
        await this.tokenRepo.deactivateById(id);
    }

    private parsePlatform(platform: string): DeviceTokenPlatform {
        const normalized = String(platform || '').toLowerCase().trim();
        if (normalized !== 'android' && normalized !== 'ios' && normalized !== 'web') {
            throw new ValidationError('platform must be android, ios, or web');
        }
        return normalized;
    }
}
