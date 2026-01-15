import { inject, injectable } from 'inversify';
import { TYPES } from '../../Types/Constants';
import { IPermissionUseCase } from '../Interface/UseCases/IPermissionUseCase';
import { IPermission } from '../Interface/Entities/auth-and-user/IPermission';
import { CreatePermissionDTO } from '../DTOs/PermissionDTO';
import { PermissionRepository } from '../../../Infrastructure/Repository/SQL/permissions/PermissionRepository';
import { ValidationError, NotFoundError, ConflictError } from '../Error/AppError';
import { Console } from '../../../Infrastructure/Utils/Console';
import { TransactionManager } from '../../../Infrastructure/Repository/SQL/Abstractions/TransactionManager';

@injectable()
export class PermissionUseCase implements IPermissionUseCase {
    constructor(
        @inject(TYPES.PermissionRepository) private readonly _permissionRepository: PermissionRepository,
        @inject(TYPES.TransactionManager) private readonly _transactionManager: TransactionManager,
    ) {}

    async createPermission(dto: CreatePermissionDTO): Promise<IPermission> {
        try {
            await this._transactionManager.beginTransaction();

            // Check if permission with same value exists
            const existingPermission = await this._permissionRepository.findByValue(dto.value);
            if (existingPermission) {
                throw new ConflictError('Permission with this value already exists');
            }

            const permission = await this._permissionRepository.create({
                name: dto.name,
                value: dto.value,
                group_name: dto.group_name,
                description: dto.description,
            } as IPermission);

            await this._transactionManager.commit();
            return permission;
        } catch (error: any) {
            await this._transactionManager.rollback();
            Console.error(error, { message: 'Failed to create permission' });
            throw error;
        }
    }

    async updatePermission(permissionId: string, dto: Partial<CreatePermissionDTO>): Promise<IPermission> {
        try {
            await this._transactionManager.beginTransaction();

            const existingPermission = await this._permissionRepository.findById(permissionId);
            if (!existingPermission) {
                throw new NotFoundError('Permission not found');
            }

            // Check if new value conflicts with existing permission
            if (dto.value && dto.value !== existingPermission.value) {
                const permissionWithValue = await this._permissionRepository.findByValue(dto.value);
                if (permissionWithValue) {
                    throw new ConflictError('Permission with this value already exists');
                }
            }

            const updatedPermission = await this._permissionRepository.update(permissionId, dto);
            await this._transactionManager.commit();
            return updatedPermission!;
        } catch (error: any) {
            await this._transactionManager.rollback();
            Console.error(error, { message: 'Failed to update permission' });
            throw error;
        }
    }

    async deletePermission(permissionId: string): Promise<{ message: string }> {
        try {
            await this._transactionManager.beginTransaction();

            const permission = await this._permissionRepository.findById(permissionId);
            if (!permission) {
                throw new NotFoundError('Permission not found');
            }

            await this._permissionRepository.delete(permissionId);
            await this._transactionManager.commit();
            return { message: 'Permission deleted successfully' };
        } catch (error: any) {
            await this._transactionManager.rollback();
            Console.error(error, { message: 'Failed to delete permission' });
            throw error;
        }
    }

    async getPermissionById(permissionId: string): Promise<IPermission | null> {
        return await this._permissionRepository.findById(permissionId);
    }

    async getAllPermissions(): Promise<IPermission[]> {
        return await this._permissionRepository.findAll();
    }

    async getPermissionsByGroup(groupName: string): Promise<IPermission[]> {
        return await this._permissionRepository.findByGroupName(groupName);
    }
}

