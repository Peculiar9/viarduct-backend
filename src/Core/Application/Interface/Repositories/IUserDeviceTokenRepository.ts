import { IUserDeviceToken } from '../Entities/notifications/IUserDeviceToken';

export interface IUserDeviceTokenRepository {
    create(entity: IUserDeviceToken): Promise<IUserDeviceToken>;
    findById(id: string): Promise<IUserDeviceToken | null>;
    findByToken(token: string): Promise<IUserDeviceToken | null>;
    findByUserAndDeviceId(userId: string, deviceId: string): Promise<IUserDeviceToken | null>;
    findActiveByUserId(userId: string): Promise<IUserDeviceToken[]>;
    update(id: string, entity: Partial<IUserDeviceToken>): Promise<IUserDeviceToken | null>;
    deactivateByToken(token: string): Promise<IUserDeviceToken | null>;
    deactivateById(id: string): Promise<IUserDeviceToken | null>;
}
