import { inject, injectable } from 'inversify';
import { BaseRepository } from '../BaseRepository';
import { TransactionManager } from '../Abstractions/TransactionManager';
import { IRole } from '../../../../Core/Application/Interface/Entities/auth-and-user/IRole';
import { TableNames } from '../../../../Core/Application/Enums/TableNames';
import { TYPES } from '../../../../Core/Types/Constants';
import { DatabaseError } from '../../../../Core/Application/Error/AppError';

@injectable()
export class RoleRepository extends BaseRepository<IRole> {
    constructor(
        @inject(TYPES.TransactionManager) transactionManager: TransactionManager
    ) {
        super(transactionManager, TableNames.ROLES);
    }

    async findById(id: string): Promise<IRole | null> {
        try {
            const result = await this.executeQuery<IRole>(
                `SELECT * FROM ${this.tableName} WHERE _id = $1`,
                [id]
            );
            return (result.rows[0] as any) || null;
        } catch (error: any) {
            console.error('RoleRepository::findById(): ', {
                message: error.message,
                stack: error.stack
            });
            return null;
        }
    }

    async findAll(): Promise<IRole[]> {
        const result = await this.executeQuery<IRole>(
            `SELECT * FROM ${this.tableName} ORDER BY created_at DESC`
        );
        return result.rows as any[];
    }

    async findByCondition(condition: Partial<IRole>): Promise<IRole[]> {
        const { whereClause, values } = this.buildWhereClause(condition);
        const result = await this.executeQuery<IRole>(
            `SELECT * FROM ${this.tableName} ${whereClause}`,
            values
        );
        return result.rows as any[];
    }

    async create(entity: IRole): Promise<IRole> {
        try {
            const { columns, values, placeholders } = this.getEntityColumns(entity);
            const query = `INSERT INTO ${this.tableName} (${columns.join(', ')})
            VALUES (${placeholders.join(', ')})
            RETURNING *
            `;

            const result = await this.executeQuery<IRole>(query, values);
            return result.rows[0] as any;
        } catch (error: any) {
            console.error('RoleRepository::create(): ', {
                message: error.message,
                stack: error.stack
            });
            throw error;
        }
    }

    async update(id: string, entity: Partial<IRole>): Promise<IRole | null> {
        const { setClause, values } = this.buildUpdateSet(entity);
        
        if (!setClause) {
            throw new Error('No fields to update');
        }
        
        const query = `UPDATE ${this.tableName} 
            SET ${setClause}, updated_at = NOW()
            WHERE _id = $${values.length + 1}
            RETURNING *`;
        
        const result = await this.executeQuery<IRole>(query, [...values, id]);
        return (result.rows[0] as any) || null;
    }

    async delete(id: string, deletedBy?: string): Promise<boolean> {
        const result = await this.executeQuery(
            `DELETE FROM ${this.tableName} WHERE _id = $1`,
            [id]
        );
        return (result.rowCount as number) > 0;
    }

    async executeRawQuery(query: string, params: any[]): Promise<any> {
        const result = await this.executeQuery(query, params);
        return result.rows;
    }

    async count(condition?: Partial<IRole>): Promise<number> {
        if (condition) {
            const { whereClause, values } = this.buildWhereClause(condition);
            const result = await this.executeQuery<{ count: string }>(
                `SELECT COUNT(*) as count FROM ${this.tableName} ${whereClause}`,
                values
            );
            return parseInt((result.rows[0] as any).count);
        }

        const result = await this.executeQuery<{ count: string }>(
            `SELECT COUNT(*) as count FROM ${this.tableName}`
        );
        return parseInt((result.rows[0] as any).count);
    }

    async bulkCreate(entities: IRole[]): Promise<IRole[]> {
        const { valuesClause, values, columns } = this.buildBulkInsertClause(entities);

        if (entities.length === 0) {
            return [];
        }

        const query = `
            INSERT INTO ${this.tableName} (${columns.join(', ')})
            VALUES ${valuesClause}
            RETURNING *
        `;

        try {
            const result = await this.executeQuery<IRole>(query, values);
            return result.rows as any[];
        } catch (error: any) {
            throw new DatabaseError(`Bulk role creation failed: ${error.message}`);
        }
    }

    async bulkUpdate(entities: Partial<IRole>[]): Promise<IRole[]> {
        if (entities.length === 0) {
            return [];
        }

        const { updateClause, values } = this.buildBulkUpdateClause(entities);
        const roleIds = entities.map(role => (role as any)._id);

        const query = `
            UPDATE ${this.tableName}
            SET ${updateClause} 
            WHERE _id = ANY($${values.length + 1}::uuid[])
            RETURNING *
        `;

        try {
            const result = await this.executeQuery<IRole>(query, [...values, roleIds]);
            return result.rows as any[];
        } catch (error: any) {
            throw new DatabaseError(`Bulk role update failed: ${error.message}`);
        }
    }

    async bulkDelete(ids: string[]): Promise<number> {
        if (ids.length === 0) {
            return 0;
        }

        const query = `
            DELETE FROM ${this.tableName}
            WHERE _id = ANY($1::uuid[])
            RETURNING _id
        `;

        try {
            const result = await this.executeQuery(query, [ids]);
            return result.rowCount || 0;
        } catch (error: any) {
            throw new DatabaseError(`Bulk role deletion failed: ${error.message}`);
        }
    }

    async findByName(name: string): Promise<IRole | null> {
        const result = await this.executeQuery<IRole>(
            `SELECT * FROM ${this.tableName} WHERE name = $1`,
            [name]
        );
        return (result.rows[0] as any) || null;
    }

    async assignPermissionsToRole(roleId: string, permissionIds: string[]): Promise<void> {
        const client = this.transactionManager.getClient();
        
        // Delete existing permissions for this role
        await client.query(
            `DELETE FROM ${TableNames.ROLE_PERMISSIONS} WHERE role_id = $1`,
            [roleId]
        );

        // Insert new permissions
        if (permissionIds.length > 0) {
            const values = permissionIds.map((_, index) => 
                `($1, $${index + 2})`
            ).join(', ');
            
            const params = [roleId, ...permissionIds];
            await client.query(
                `INSERT INTO ${TableNames.ROLE_PERMISSIONS} (role_id, permission_id) VALUES ${values}`,
                params
            );
        }
    }

    async getRolePermissions(roleId: string): Promise<any[]> {
        const result = await this.executeQuery(
            `SELECT p.* FROM ${TableNames.PERMISSIONS} p
             INNER JOIN ${TableNames.ROLE_PERMISSIONS} rp ON p._id = rp.permission_id
             WHERE rp.role_id = $1`,
            [roleId]
        );
        return result.rows;
    }

    async removePermissionFromRole(roleId: string, permissionId: string): Promise<void> {
        const client = this.transactionManager.getClient();
        await client.query(
            `DELETE FROM ${TableNames.ROLE_PERMISSIONS} WHERE role_id = $1 AND permission_id = $2`,
            [roleId, permissionId]
        );
    }

    async assignRoleToUser(userId: string, roleId: string): Promise<void> {
        const client = this.transactionManager.getClient();
        
        // Check if already assigned
        const existing = await client.query(
            `SELECT * FROM ${TableNames.USER_ROLES} WHERE user_id = $1 AND role_id = $2`,
            [userId, roleId]
        );

        if (existing.rows.length === 0) {
            await client.query(
                `INSERT INTO ${TableNames.USER_ROLES} (user_id, role_id) VALUES ($1, $2)`,
                [userId, roleId]
            );
        }
    }

    async removeRoleFromUser(userId: string, roleId: string): Promise<void> {
        const client = this.transactionManager.getClient();
        await client.query(
            `DELETE FROM ${TableNames.USER_ROLES} WHERE user_id = $1 AND role_id = $2`,
            [userId, roleId]
        );
    }

    async getUserRoles(userId: string): Promise<any[]> {
        const result = await this.executeQuery(
            `SELECT r.* FROM ${TableNames.ROLES} r
             INNER JOIN ${TableNames.USER_ROLES} ur ON r._id = ur.role_id
             WHERE ur.user_id = $1`,
            [userId]
        );
        return result.rows;
    }

    async getUserPermissions(userId: string): Promise<any[]> {
        const result = await this.executeQuery(
            `SELECT DISTINCT p.* FROM ${TableNames.PERMISSIONS} p
             INNER JOIN ${TableNames.ROLE_PERMISSIONS} rp ON p._id = rp.permission_id
             INNER JOIN ${TableNames.USER_ROLES} ur ON rp.role_id = ur.role_id
             WHERE ur.user_id = $1`,
            [userId]
        );
        return result.rows;
    }

    async userHasPermission(userId: string, permissionValue: string): Promise<boolean> {
        const result = await this.executeQuery<{ count: string }>(
            `SELECT COUNT(*) as count FROM ${TableNames.PERMISSIONS} p
             INNER JOIN ${TableNames.ROLE_PERMISSIONS} rp ON p._id = rp.permission_id
             INNER JOIN ${TableNames.USER_ROLES} ur ON rp.role_id = ur.role_id
             WHERE ur.user_id = $1 AND p.value = $2`,
            [userId, permissionValue]
        );
        return parseInt((result.rows[0] as any)?.count || '0') > 0;
    }
}

