import { inject, injectable } from 'inversify';
import { TYPES } from '../../Core/Types/Constants';
import { TransactionManager } from '../Repository/SQL/Abstractions/TransactionManager';
import { RoleRepository } from '../Repository/SQL/roles/RoleRepository';
import { PermissionRepository } from '../Repository/SQL/permissions/PermissionRepository';
import { Console } from '../Utils/Console';

@injectable()
export class RolePermissionSeeder {
    constructor(
        @inject(TYPES.TransactionManager) private transactionManager: TransactionManager,
        @inject(TYPES.RoleRepository) private roleRepository: RoleRepository,
        @inject(TYPES.PermissionRepository) private permissionRepository: PermissionRepository,
    ) {}

    async seed(): Promise<void> {
        try {
            await this.transactionManager.beginTransaction();
            
            // Create permissions
            await this.createPermissions();
            
            // Create roles
            await this.createRoles();
            
            // Assign permissions to roles
            await this.assignPermissionsToRoles();
            
            await this.transactionManager.commit();
            Console.info('Role and Permission seeding completed successfully');
        } catch (error: any) {
            await this.transactionManager.rollback();
            Console.error(error, { message: 'Failed to seed roles and permissions' });
            throw error;
        }
    }

    private async createPermissions(): Promise<void> {
        const permissions = [
            { name: 'View Users', value: 'users.view', group_name: 'User Permissions', description: 'Permission to view other users account details' },
            { name: 'Manage Users', value: 'users.manage', group_name: 'User Permissions', description: 'Permission to create, delete and modify other users account details' },
            { name: 'Add Users', value: 'users.add', group_name: 'User Permissions', description: 'Permission to add new users' },
            { name: 'Delete Users', value: 'users.delete', group_name: 'User Permissions', description: 'Permission to delete users' },
            { name: 'View Permissions', value: 'permissions.view', group_name: 'Permission Permissions', description: 'Permission to view permissions' },
            { name: 'Manage Permissions', value: 'permissions.manage', group_name: 'Permission Permissions', description: 'Permission to create, delete and modify permissions' },
            { name: 'View Roles', value: 'roles.view', group_name: 'Role Permissions', description: 'Permission to view roles' },
            { name: 'Manage Roles', value: 'roles.manage', group_name: 'Role Permissions', description: 'Permission to create, delete and modify roles' },
        ];

        const existingPermissions = await this.permissionRepository.findAll();
        
        for (const permission of permissions) {
            const exists = existingPermissions.find(p => p.value === permission.value);
            if (!exists) {
                await this.permissionRepository.create(permission as any);
                Console.info(`Created permission: ${permission.value}`);
            }
        }
    }

    private async createRoles(): Promise<void> {
        const roles = [
            { name: 'user', description: 'All users', is_system: true },
            { name: 'admin', description: 'System admin with access to all features', is_system: true },
            { name: 'superadmin', description: 'Super admin with all permissions', is_system: true },
        ];

        const existingRoles = await this.roleRepository.findAll();
        
        for (const role of roles) {
            const exists = existingRoles.find(r => r.name === role.name);
            if (!exists) {
                await this.roleRepository.create(role as any);
                Console.info(`Created role: ${role.name}`);
            }
        }
    }

    private async assignPermissionsToRoles(): Promise<void> {
        const superadminRole = await this.roleRepository.findByName('superadmin');
        const adminRole = await this.roleRepository.findByName('admin');
        const userRole = await this.roleRepository.findByName('user');

        if (superadminRole) {
            // Assign all permissions to superadmin
            const allPermissions = await this.permissionRepository.findAll();
            const permissionIds = allPermissions.map(p => p._id!);
            if (permissionIds.length > 0) {
                await this.roleRepository.assignPermissionsToRole(superadminRole._id!, permissionIds);
                Console.info(`Assigned ${permissionIds.length} permissions to superadmin`);
            }
        }

        if (adminRole) {
            // Assign specific permissions to admin (example)
            const adminPermissions = await this.permissionRepository.findByValues([
                'users.view',
                'users.manage',
                'roles.view'
            ]);
            const permissionIds = adminPermissions.map(p => p._id!);
            if (permissionIds.length > 0) {
                await this.roleRepository.assignPermissionsToRole(adminRole._id!, permissionIds);
                Console.info(`Assigned ${permissionIds.length} permissions to admin`);
            }
        }

        if (userRole) {
            // Assign specific permissions to user (example)
            const userPermissions = await this.permissionRepository.findByValues([
                'users.view'
            ]);
            const permissionIds = userPermissions.map(p => p._id!);
            if (permissionIds.length > 0) {
                await this.roleRepository.assignPermissionsToRole(userRole._id!, permissionIds);
                Console.info(`Assigned ${permissionIds.length} permissions to user`);
            }
        }
    }
}

