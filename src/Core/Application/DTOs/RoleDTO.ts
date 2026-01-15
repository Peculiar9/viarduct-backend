import { IsNotEmpty, IsString, IsBoolean, IsOptional, IsArray, IsUUID } from 'class-validator';

export class CreateRoleDTO {
    @IsNotEmpty({ message: 'Role name is required' })
    @IsString({ message: 'Role name must be a string' })
    name: string;

    @IsNotEmpty({ message: 'Description is required' })
    @IsString({ message: 'Description must be a string' })
    description: string;

    @IsOptional()
    @IsBoolean({ message: 'is_system must be a boolean' })
    is_system?: boolean;
}

export class UpdateRoleDTO {
    @IsOptional()
    @IsString({ message: 'Role name must be a string' })
    name?: string;

    @IsOptional()
    @IsString({ message: 'Description must be a string' })
    description?: string;
}

export class AssignPermissionsToRoleDTO {
    @IsNotEmpty({ message: 'Permission IDs are required' })
    @IsArray({ message: 'Permission IDs must be an array' })
    @IsUUID(undefined, { each: true, message: 'Each permission ID must be a valid UUID' })
    permission_ids: string[];
}

export class AssignRoleToUserDTO {
    @IsNotEmpty({ message: 'Role ID is required' })
    @IsUUID(undefined, { message: 'Role ID must be a valid UUID' })
    role_id: string;
}

