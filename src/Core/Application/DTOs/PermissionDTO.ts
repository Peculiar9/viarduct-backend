import { IsNotEmpty, IsString } from 'class-validator';

export class CreatePermissionDTO {
    @IsNotEmpty({ message: 'Permission name is required' })
    @IsString({ message: 'Permission name must be a string' })
    name: string;

    @IsNotEmpty({ message: 'Permission value is required' })
    @IsString({ message: 'Permission value must be a string' })
    value: string;

    @IsNotEmpty({ message: 'Group name is required' })
    @IsString({ message: 'Group name must be a string' })
    group_name: string;

    @IsNotEmpty({ message: 'Description is required' })
    @IsString({ message: 'Description must be a string' })
    description: string;
}

