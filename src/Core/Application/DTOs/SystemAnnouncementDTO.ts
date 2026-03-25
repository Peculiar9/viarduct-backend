import { ArrayNotEmpty, IsArray, IsIn, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';
import { SystemAnnouncementChannel } from '../Enums/SystemAnnouncementChannel';

export class CreateSystemAnnouncementDTO {
    @IsString()
    @IsNotEmpty()
    title: string;

    @IsOptional()
    @IsString()
    description?: string;

    @IsString()
    @IsNotEmpty()
    content: string;

    @IsOptional()
    @IsString()
    url?: string;

    @IsArray()
    @ArrayNotEmpty()
    @IsIn(Object.values(SystemAnnouncementChannel), { each: true })
    broadcast_channels: SystemAnnouncementChannel[];
}

export class UpdateSystemAnnouncementDTO {
    @IsOptional()
    @IsString()
    @IsNotEmpty()
    title?: string;

    @IsOptional()
    @IsString()
    description?: string;

    @IsOptional()
    @IsString()
    @IsNotEmpty()
    content?: string;

    @IsOptional()
    @IsString()
    url?: string;

    @IsOptional()
    @IsArray()
    @ArrayNotEmpty()
    @IsIn(Object.values(SystemAnnouncementChannel), { each: true })
    broadcast_channels?: SystemAnnouncementChannel[];
}

export class PublishSystemAnnouncementDTO {
    @IsOptional()
    @IsString()
    scheduled_at?: string; // ISO string
}

