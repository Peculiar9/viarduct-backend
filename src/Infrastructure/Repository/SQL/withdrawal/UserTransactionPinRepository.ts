import { inject, injectable } from 'inversify';
import { BaseRepository } from '../BaseRepository';
import { TransactionManager } from '../Abstractions/TransactionManager';
import { IUserTransactionPin } from '../../../../Core/Application/Interface/Entities/withdrawal/IUserTransactionPin';
import { IUserTransactionPinRepository } from '../../../../Core/Application/Interface/Repositories/IUserTransactionPinRepository';
import { TableNames } from '../../../../Core/Application/Enums/TableNames';
import { TYPES } from '../../../../Core/Types/Constants';

@injectable()
export class UserTransactionPinRepository extends BaseRepository<IUserTransactionPin> implements IUserTransactionPinRepository {
    constructor(
        @inject(TYPES.TransactionManager) transactionManager: TransactionManager
    ) {
        super(transactionManager, TableNames.USER_TRANSACTION_PINS);
    }

    async findByUserId(userId: string): Promise<IUserTransactionPin | null> {
        const result = await this.executeQuery<IUserTransactionPin>(
            `SELECT * FROM "${this.tableName}" WHERE user_id = $1`,
            [userId]
        );
        return (result.rows[0] as any) || null;
    }

    async create(entity: IUserTransactionPin): Promise<IUserTransactionPin> {
        const { columns, values, placeholders } = this.getEntityColumns(entity as Partial<IUserTransactionPin>);
        const query = `INSERT INTO "${this.tableName}" (${columns.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`;
        const result = await this.executeQuery<IUserTransactionPin>(query, values);
        return result.rows[0] as any;
    }

    async update(userIdOrId: string, pinHashOrEntity: string | Partial<IUserTransactionPin>): Promise<IUserTransactionPin | null> {
        if (typeof pinHashOrEntity === 'string') {
            const query = `UPDATE "${this.tableName}" SET pin_hash = $1, updated_at = NOW() WHERE user_id = $2 RETURNING *`;
            const result = await this.executeQuery<IUserTransactionPin>(query, [pinHashOrEntity, userIdOrId]);
            return (result.rows[0] as any) || null;
        }
        const { setClause, values } = this.buildUpdateSet(pinHashOrEntity);
        if (!setClause) return null;
        const query = `UPDATE "${this.tableName}" SET ${setClause}, updated_at = NOW() WHERE _id = $${values.length + 1} RETURNING *`;
        const result = await this.executeQuery<IUserTransactionPin>(query, [...values, userIdOrId]);
        return (result.rows[0] as any) || null;
    }

    async findById(id: string): Promise<IUserTransactionPin | null> {
        const result = await this.executeQuery<IUserTransactionPin>(
            `SELECT * FROM "${this.tableName}" WHERE _id = $1`,
            [id]
        );
        return (result.rows[0] as any) || null;
    }

    async findAll(): Promise<IUserTransactionPin[]> {
        const result = await this.executeQuery<IUserTransactionPin>(
            `SELECT * FROM "${this.tableName}" ORDER BY created_at DESC`
        );
        return result.rows as any[];
    }

    async findByCondition(condition: Partial<IUserTransactionPin>): Promise<IUserTransactionPin[]> {
        const keys = Object.keys(condition);
        const values = Object.values(condition);
        if (keys.length === 0) return this.findAll();
        const whereClause = keys.map((key, index) => `"${key}" = $${index + 1}`).join(' AND ');
        const result = await this.executeQuery<IUserTransactionPin>(
            `SELECT * FROM "${this.tableName}" WHERE ${whereClause} ORDER BY created_at DESC`,
            values
        );
        return result.rows as any[];
    }

    async delete(id: string, _deletedBy?: string): Promise<boolean> {
        const result = await this.executeQuery(`DELETE FROM "${this.tableName}" WHERE _id = $1`, [id]);
        return (result.rowCount || 0) > 0;
    }

    async executeRawQuery(query: string, params: any[]): Promise<any> {
        return await this.executeQuery(query, params);
    }

    async count(condition?: Partial<IUserTransactionPin>): Promise<number> {
        let query = `SELECT COUNT(*) as count FROM "${this.tableName}"`;
        const params: any[] = [];
        if (condition) {
            const { whereClause, values } = this.buildWhereClause(condition);
            query += ` ${whereClause}`;
            params.push(...values);
        }
        const result = await this.executeQuery<{ count: string }>(query, params);
        return parseInt((result.rows[0] as any)?.count || '0', 10);
    }

    async bulkCreate(entities: IUserTransactionPin[]): Promise<IUserTransactionPin[]> {
        if (entities.length === 0) return [];
        const { valuesClause, values, columns } = this.buildBulkInsertClause(entities);
        const columnNames = columns.map(col => `"${col}"`).join(', ');
        const query = `INSERT INTO "${this.tableName}" (${columnNames}) VALUES ${valuesClause} RETURNING *`;
        const result = await this.executeQuery<IUserTransactionPin>(query, values);
        return result.rows as any[];
    }

    async bulkUpdate(entities: Partial<IUserTransactionPin>[]): Promise<IUserTransactionPin[]> {
        if (entities.length === 0) return [];
        const { updateClause, values } = this.buildBulkUpdateClause(entities);
        const ids = entities.map(e => (e as any)._id).filter(Boolean);
        const query = `UPDATE "${this.tableName}" SET ${updateClause}, updated_at = NOW() WHERE _id IN (${ids.map((_, i) => `$${values.length + i + 1}`).join(', ')}) RETURNING *`;
        const result = await this.executeQuery<IUserTransactionPin>(query, [...values, ...ids]);
        return result.rows as any[];
    }

    async bulkDelete(ids: string[]): Promise<number> {
        if (ids.length === 0) return 0;
        const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');
        const result = await this.executeQuery(`DELETE FROM "${this.tableName}" WHERE _id IN (${placeholders})`, ids);
        return result.rowCount || 0;
    }
}
