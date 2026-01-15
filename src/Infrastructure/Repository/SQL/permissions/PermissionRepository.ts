import { inject, injectable } from 'inversify';
import { BaseRepository } from '../BaseRepository';
import { TransactionManager } from '../Abstractions/TransactionManager';
import { IPermission } from '../../../../Core/Application/Interface/Entities/auth-and-user/IPermission';
import { TableNames } from '../../../../Core/Application/Enums/TableNames';
import { TYPES } from '../../../../Core/Types/Constants';
import { DatabaseError } from '../../../../Core/Application/Error/AppError';

@injectable()
export class PermissionRepository extends BaseRepository<IPermission> {
    constructor(
        @inject(TYPES.TransactionManager) transactionManager: TransactionManager
    ) {
        super(transactionManager, TableNames.PERMISSIONS);
    }

    async findById(id: string): Promise<IPermission | null> {
        try {
            const result = await this.executeQuery<IPermission>(
                `SELECT * FROM "${this.tableName}" WHERE _id = $1`,
                [id]
            );
            return (result.rows[0] as any) || null;
        } catch (error: any) {
            console.error('PermissionRepository::findById(): ', {
                message: error.message,
                stack: error.stack,
                tableName: this.tableName
            });
            throw error;
        }
    }

    async findAll(): Promise<IPermission[]> {
        try {
            const result = await this.executeQuery<IPermission>(
                `SELECT * FROM "${this.tableName}" ORDER BY group_name, name`
            );
            return result.rows as any[];
        } catch (error: any) {
            console.error('PermissionRepository::findAll(): ', {
                message: error.message,
                stack: error.stack,
                tableName: this.tableName
            });
            throw error;
        }
    }

    async findByCondition(condition: Partial<IPermission>): Promise<IPermission[]> {
        const { whereClause, values } = this.buildWhereClause(condition);
        const result = await this.executeQuery<IPermission>(
            `SELECT * FROM "${this.tableName}" ${whereClause}`,
            values
        );
        return result.rows as any[];
    }

    async create(entity: IPermission): Promise<IPermission> {
        try {
            const { columns, values, placeholders } = this.getEntityColumns(entity);
            const query = `INSERT INTO "${this.tableName}" (${columns.join(', ')})
            VALUES (${placeholders.join(', ')})
            RETURNING *
            `;

            const result = await this.executeQuery<IPermission>(query, values);
            return result.rows[0] as any;
        } catch (error: any) {
            console.error('PermissionRepository::create(): ', {
                message: error.message,
                stack: error.stack,
                tableName: this.tableName
            });
            throw error;
        }
    }

    async update(id: string, entity: Partial<IPermission>): Promise<IPermission | null> {
        const { setClause, values } = this.buildUpdateSet(entity);
        
        if (!setClause) {
            throw new Error('No fields to update');
        }
        
        const query = `UPDATE "${this.tableName}" 
            SET ${setClause}, updated_at = NOW()
            WHERE _id = $${values.length + 1}
            RETURNING *`;
        
        const result = await this.executeQuery<IPermission>(query, [...values, id]);
        return (result.rows[0] as any) || null;
    }

    async delete(id: string, deletedBy?: string): Promise<boolean> {
        const result = await this.executeQuery(
            `DELETE FROM "${this.tableName}" WHERE _id = $1`,
            [id]
        );
        return (result.rowCount as number) > 0;
    }

    async executeRawQuery(query: string, params: any[]): Promise<any> {
        const result = await this.executeQuery(query, params);
        return result.rows;
    }

    async count(condition?: Partial<IPermission>): Promise<number> {
        if (condition) {
            const { whereClause, values } = this.buildWhereClause(condition);
            const result = await this.executeQuery<{ count: string }>(
                `SELECT COUNT(*) as count FROM "${this.tableName}" ${whereClause}`,
                values
            );
            return parseInt((result.rows[0] as any).count);
        }

        const result = await this.executeQuery<{ count: string }>(
            `SELECT COUNT(*) as count FROM "${this.tableName}"`
        );
        return parseInt((result.rows[0] as any).count);
    }

    async bulkCreate(entities: IPermission[]): Promise<IPermission[]> {
        const { valuesClause, values, columns } = this.buildBulkInsertClause(entities);

        if (entities.length === 0) {
            return [];
        }

        const query = `
            INSERT INTO "${this.tableName}" (${columns.join(', ')})
            VALUES ${valuesClause}
            RETURNING *
        `;

        try {
            const result = await this.executeQuery<IPermission>(query, values);
            return result.rows as any[];
        } catch (error: any) {
            throw new DatabaseError(`Bulk permission creation failed: ${error.message}`);
        }
    }

    async bulkUpdate(entities: Partial<IPermission>[]): Promise<IPermission[]> {
        if (entities.length === 0) {
            return [];
        }

        const { updateClause, values } = this.buildBulkUpdateClause(entities);
        const permissionIds = entities.map(permission => (permission as any)._id);

        const query = `
            UPDATE "${this.tableName}"
            SET ${updateClause} 
            WHERE _id = ANY($${values.length + 1}::uuid[])
            RETURNING *
        `;

        try {
            const result = await this.executeQuery<IPermission>(query, [...values, permissionIds]);
            return result.rows as any[];
        } catch (error: any) {
            throw new DatabaseError(`Bulk permission update failed: ${error.message}`);
        }
    }

    async bulkDelete(ids: string[]): Promise<number> {
        if (ids.length === 0) {
            return 0;
        }

        const query = `
            DELETE FROM "${this.tableName}"
            WHERE _id = ANY($1::uuid[])
            RETURNING _id
        `;

        try {
            const result = await this.executeQuery(query, [ids]);
            return result.rowCount || 0;
        } catch (error: any) {
            throw new DatabaseError(`Bulk permission deletion failed: ${error.message}`);
        }
    }

    async findByValue(value: string): Promise<IPermission | null> {
        const result = await this.executeQuery<IPermission>(
            `SELECT * FROM "${this.tableName}" WHERE value = $1`,
            [value]
        );
        return (result.rows[0] as any) || null;
    }

    async findByValues(values: string[]): Promise<IPermission[]> {
        if (values.length === 0) return [];
        
        const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
        const result = await this.executeQuery<IPermission>(
            `SELECT * FROM "${this.tableName}" WHERE value IN (${placeholders})`,
            values
        );
        return result.rows as any[];
    }

    async findByGroupName(groupName: string): Promise<IPermission[]> {
        const result = await this.executeQuery<IPermission>(
            `SELECT * FROM "${this.tableName}" WHERE group_name = $1 ORDER BY name`,
            [groupName]
        );
        return result.rows as any[];
    }
}

