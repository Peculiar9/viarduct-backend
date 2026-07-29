import { IUserDeviceToken, DeviceTokenPlatform } from '../Entities/notifications/IUserDeviceToken';

export interface IUserDeviceTokenService {
    register(
        userId: string,
        dto: { token: string; platform: DeviceTokenPlatform | string; device_id?: string }
    ): Promise<IUserDeviceToken>;

    unregister(userId: string, token: string): Promise<void>;

    listActiveTokensForUser(userId: string): Promise<IUserDeviceToken[]>;

    deactivateToken(token: string): Promise<void>;

    deactivateTokenById(id: string): Promise<void>;
}
