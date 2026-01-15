import { IRole } from '../Entities/auth-and-user/IRole';
import { IPermission } from '../Entities/auth-and-user/IPermission';
import { CreateRoleDTO, UpdateRoleDTO, AssignPermissionsToRoleDTO, AssignRoleToUserDTO } from '../DTOs/RoleDTO';

export interface IRoleUseCase {
    createRole(dto: CreateRoleDTO): Promise<IRole>;
    updateRole(roleId: string, dto: UpdateRoleDTO): Promise<IRole>;
    deleteRole(roleId: string): Promise<{ message: string }>;
    getRoleById(roleId: string): Promise<IRole | null>;
    getAllRoles(): Promise<IRole[]>;
    assignPermissionsToRole(roleId: string, dto: AssignPermissionsToRoleDTO): Promise<{ message: string }>;
    getRolePermissions(roleId: string): Promise<IPermission[]>;
    assignRoleToUser(userId: string, dto: AssignRoleToUserDTO): Promise<{ message: string }>;
    removeRoleFromUser(userId: string, roleId: string): Promise<{ message: string }>;
    getUserRoles(userId: string): Promise<IRole[]>;
    getUserPermissions(userId: string): Promise<IPermission[]>;
    userHasPermission(userId: string, permissionValue: string): Promise<boolean>;
}

