export type DeviceTokenPlatform = 'android' | 'ios' | 'web';

export interface IUserDeviceToken {
    _id?: string;
    user_id: string;
    token: string;
    platform: DeviceTokenPlatform;
    device_id?: string | null;
    is_active: boolean;
    last_seen_at?: string | null;
    created_at: string;
    updated_at: string;
}
