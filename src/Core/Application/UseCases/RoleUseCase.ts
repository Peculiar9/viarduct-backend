import { inject, injectable } from 'inversify';
import { TYPES } from '../../Types/Constants';
import { IRoleUseCase } from '../Interface/UseCases/IRoleUseCase';
import { IRole } from '../Interface/Entities/auth-and-user/IRole';
import { IPermission } from '../Interface/Entities/auth-and-user/IPermission';
import { CreateRoleDTO, UpdateRoleDTO, AssignPermissionsToRoleDTO, AssignRoleToUserDTO } from '../DTOs/RoleDTO';
import { RoleRepository } from '../../../Infrastructure/Repository/SQL/roles/RoleRepository';
import { PermissionRepository } from '../../../Infrastructure/Repository/SQL/permissions/PermissionRepository';
import { ValidationError, NotFoundError, ConflictError } from '../Error/AppError';
import { ResponseMessage } from '../Response/ResponseFormat';
import { Console } from '../../../Infrastructure/Utils/Console';
import { TransactionManager } from '../../../Infrastructure/Repository/SQL/Abstractions/TransactionManager';

@injectable()
export class RoleUseCase implements IRoleUseCase {
    constructor(
        @inject(TYPES.RoleRepository) private readonly _roleRepository: RoleRepository,
        @inject(TYPES.PermissionRepository) private readonly _permissionRepository: PermissionRepository,
        @inject(TYPES.TransactionManager) private readonly _transactionManager: TransactionManager,
    ) {}

    async createRole(dto: CreateRoleDTO): Promise<IRole> {
        try {
            await this._transactionManager.beginTransaction();

            // Check if role with same name exists
            const existingRole = await this._roleRepository.findByName(dto.name);
            if (existingRole) {
                throw new ConflictError('Role with this name already exists');
            }

            const role = await this._roleRepository.create({
                name: dto.name,
                description: dto.description,
                is_system: dto.is_system || false,
            } as IRole);

            await this._transactionManager.commit();
            return role;
        } catch (error: any) {
            await this._transactionManager.rollback();
            Console.error(error, { message: 'Failed to create role' });
            throw error;
        }
    }

    async updateRole(roleId: string, dto: UpdateRoleDTO): Promise<IRole> {
        try {
            await this._transactionManager.beginTransaction();

            const existingRole = await this._roleRepository.findById(roleId);
            if (!existingRole) {
                throw new NotFoundError('Role not found');
            }

            // Check if system role (cannot be modified)
            if (existingRole.is_system && dto.name && dto.name !== existingRole.name) {
                throw new ValidationError('Cannot modify name of system role');
            }

            // Check if new name conflicts with existing role
            if (dto.name && dto.name !== existingRole.name) {
                const roleWithName = await this._roleRepository.findByName(dto.name);
                if (roleWithName) {
                    throw new ConflictError('Role with this name already exists');
                }
            }

            const updatedRole = await this._roleRepository.update(roleId, dto);
            await this._transactionManager.commit();
            return updatedRole!;
        } catch (error: any) {
            await this._transactionManager.rollback();
            Console.error(error, { message: 'Failed to update role' });
            throw error;
        }
    }

    async deleteRole(roleId: string): Promise<{ message: string }> {
        try {
            await this._transactionManager.beginTransaction();

            const role = await this._roleRepository.findById(roleId);
            if (!role) {
                throw new NotFoundError('Role not found');
            }

            if (role.is_system) {
                throw new ValidationError('Cannot delete system role');
            }

            await this._roleRepository.delete(roleId);
            await this._transactionManager.commit();
            return { message: 'Role deleted successfully' };
        } catch (error: any) {
            await this._transactionManager.rollback();
            Console.error(error, { message: 'Failed to delete role' });
            throw error;
        }
    }

    async getRoleById(roleId: string): Promise<IRole | null> {
        return await this._roleRepository.findById(roleId);
    }

    async getAllRoles(): Promise<IRole[]> {
        return await this._roleRepository.findAll();
    }

    async assignPermissionsToRole(roleId: string, dto: AssignPermissionsToRoleDTO): Promise<{ message: string }> {
        try {
            await this._transactionManager.beginTransaction();

            const role = await this._roleRepository.findById(roleId);
            if (!role) {
                throw new NotFoundError('Role not found');
            }

            // Verify all permissions exist
            const permissions = await this._permissionRepository.findAll();
            const permissionIds = permissions.map(p => p._id!);
            const invalidIds = dto.permission_ids.filter(id => !permissionIds.includes(id));
            
            if (invalidIds.length > 0) {
                throw new ValidationError(`Invalid permission IDs: ${invalidIds.join(', ')}`);
            }

            await this._roleRepository.assignPermissionsToRole(roleId, dto.permission_ids);
            await this._transactionManager.commit();
            return { message: 'Permissions assigned to role successfully' };
        } catch (error: any) {
            await this._transactionManager.rollback();
            Console.error(error, { message: 'Failed to assign permissions to role' });
            throw error;
        }
    }

    async getRolePermissions(roleId: string): Promise<IPermission[]> {
        const role = await this._roleRepository.findById(roleId);
        if (!role) {
            throw new NotFoundError('Role not found');
        }
        return await this._roleRepository.getRolePermissions(roleId);
    }

    async assignRoleToUser(userId: string, dto: AssignRoleToUserDTO): Promise<{ message: string }> {
        try {
            await this._transactionManager.beginTransaction();

            const role = await this._roleRepository.findById(dto.role_id);
            if (!role) {
                throw new NotFoundError('Role not found');
            }

            await this._roleRepository.assignRoleToUser(userId, dto.role_id);
            await this._transactionManager.commit();
            return { message: 'Role assigned to user successfully' };
        } catch (error: any) {
            await this._transactionManager.rollback();
            Console.error(error, { message: 'Failed to assign role to user' });
            throw error;
        }
    }

    async removeRoleFromUser(userId: string, roleId: string): Promise<{ message: string }> {
        try {
            await this._transactionManager.beginTransaction();

            await this._roleRepository.removeRoleFromUser(userId, roleId);
            await this._transactionManager.commit();
            return { message: 'Role removed from user successfully' };
        } catch (error: any) {
            await this._transactionManager.rollback();
            Console.error(error, { message: 'Failed to remove role from user' });
            throw error;
        }
    }

    async getUserRoles(userId: string): Promise<IRole[]> {
        return await this._roleRepository.getUserRoles(userId);
    }

    async getUserPermissions(userId: string): Promise<IPermission[]> {
        return await this._roleRepository.getUserPermissions(userId);
    }

    async userHasPermission(userId: string, permissionValue: string): Promise<boolean> {
        return await this._roleRepository.userHasPermission(userId, permissionValue);
    }
}

