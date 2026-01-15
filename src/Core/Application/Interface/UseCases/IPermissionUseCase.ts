import { IPermission } from '../Entities/auth-and-user/IPermission';
import { CreatePermissionDTO } from '../../DTOs/PermissionDTO';

export interface IPermissionUseCase {
    createPermission(dto: CreatePermissionDTO): Promise<IPermission>;
    updatePermission(permissionId: string, dto: Partial<CreatePermissionDTO>): Promise<IPermission>;
    deletePermission(permissionId: string): Promise<{ message: string }>;
    getPermissionById(permissionId: string): Promise<IPermission | null>;
    getAllPermissions(): Promise<IPermission[]>;
    getPermissionsByGroup(groupName: string): Promise<IPermission[]>;
}

