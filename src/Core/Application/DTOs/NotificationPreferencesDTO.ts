import { IsBoolean, IsObject, IsOptional } from 'class-validator';

export class UpdateNotificationPreferencesDTO {
    @IsOptional()
    @IsBoolean()
    transaction?: boolean;

    @IsOptional()
    @IsBoolean()
    verification?: boolean;

    @IsOptional()
    @IsBoolean()
    message?: boolean;

    @IsOptional()
    @IsBoolean()
    order?: boolean;

    @IsOptional()
    @IsBoolean()
    dispute?: boolean;

    @IsOptional()
    @IsBoolean()
    system_announcements?: boolean;
}

export class NotificationPreferencesResponseDTO {
    @IsObject()
    preferences: Record<string, boolean>;
}

