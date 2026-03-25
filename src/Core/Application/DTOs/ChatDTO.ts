import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateChatDTO {
    @IsUUID('4')
    @IsNotEmpty()
    admin_id: string;

    @IsString()
    @IsNotEmpty()
    content: string;

    @IsOptional()
    @IsString()
    url?: string;
}

export class SendChatMessageDTO {
    @IsString()
    @IsNotEmpty()
    content: string;

    @IsOptional()
    @IsString()
    url?: string;
}

export class ReassignChatDTO {
    @IsUUID('4')
    @IsNotEmpty()
    admin_id: string;
}

