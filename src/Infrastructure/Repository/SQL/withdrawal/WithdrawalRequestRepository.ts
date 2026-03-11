import { inject, injectable } from 'inversify';
import { BaseRepository } from '../BaseRepository';
import { TransactionManager } from '../Abstractions/TransactionManager';
import { IWithdrawalRequest } from '../../../../Core/Application/Interface/Entities/withdrawal/IWithdrawalRequest';
import { IWithdrawalRequestRepository } from '../../../../Core/Application/Interface/Repositories/IWithdrawalRequestRepository';
import { TableNames } from '../../../../Core/Application/Enums/TableNames';
import { TYPES } from '../../../../Core/Types/Constants';
import { DatabaseError } from '../../../../Core/Application/Error/AppError';

@injectable()
export class WithdrawalRequestRepository extends BaseRepository<IWithdrawalRequest> implements IWithdrawalRequestRepository {
    constructor(
        @inject(TYPES.TransactionManager) transactionManager: TransactionManager
    ) {
        super(transactionManager, TableNames.WITHDRAWAL_REQUESTS);
    }

    async create(entity: IWithdrawalRequest): Promise<IWithdrawalRequest> {
        const { columns, values, placeholders } = this.getEntityColumns(entity as Partial<IWithdrawalRequest>);
        const query = `INSERT INTO "${this.tableName}" (${columns.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`;
        const result = await this.executeQuery<IWithdrawalRequest>(query, values);
        return result.rows[0] as any;
    }

    async findById(id: string): Promise<IWithdrawalRequest | null> {
        const result = await this.executeQuery<IWithdrawalRequest>(
            `SELECT * FROM "${this.tableName}" WHERE _id = $1`,
            [id]
        );
        return (result.rows[0] as any) || null;
    }

    async findByUserId(userId: string, limit: number = 50, offset: number = 0): Promise<IWithdrawalRequest[]> {
        const result = await this.executeQuery<IWithdrawalRequest>(
            `SELECT * FROM "${this.tableName}" WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
            [userId, limit, offset]
        );
        return result.rows as any[];
    }

    async update(id: string, entity: Partial<IWithdrawalRequest>): Promise<IWithdrawalRequest | null> {
        const { setClause, values } = this.buildUpdateSet(entity);
        if (!setClause) return null;
        const query = `UPDATE "${this.tableName}" SET ${setClause}, updated_at = NOW() WHERE _id = $${values.length + 1} RETURNING *`;
        const result = await this.executeQuery<IWithdrawalRequest>(query, [...values, id]);
        return (result.rows[0] as any) || null;
    }

    async findAll(): Promise<IWithdrawalRequest[]> {
        const result = await this.executeQuery<IWithdrawalRequest>(
            `SELECT * FROM "${this.tableName}" ORDER BY created_at DESC`
        );
        return result.rows as any[];
    }

    async findByCondition(condition: Partial<IWithdrawalRequest>): Promise<IWithdrawalRequest[]> {
        const keys = Object.keys(condition);
        const values = Object.values(condition);
        if (keys.length === 0) return this.findAll();
        const whereClause = keys.map((key, index) => `"${key}" = $${index + 1}`).join(' AND ');
        const result = await this.executeQuery<IWithdrawalRequest>(
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

    async count(condition?: Partial<IWithdrawalRequest>): Promise<number> {
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

    async bulkCreate(entities: IWithdrawalRequest[]): Promise<IWithdrawalRequest[]> {
        if (entities.length === 0) return [];
        const { valuesClause, values, columns } = this.buildBulkInsertClause(entities);
        const columnNames = columns.map(col => `"${col}"`).join(', ');
        const query = `INSERT INTO "${this.tableName}" (${columnNames}) VALUES ${valuesClause} RETURNING *`;
        const result = await this.executeQuery<IWithdrawalRequest>(query, values);
        return result.rows as any[];
    }

    async bulkUpdate(entities: Partial<IWithdrawalRequest>[]): Promise<IWithdrawalRequest[]> {
        if (entities.length === 0) return [];
        const { updateClause, values } = this.buildBulkUpdateClause(entities);
        const ids = entities.map(e => (e as any)._id).filter(Boolean);
        const query = `UPDATE "${this.tableName}" SET ${updateClause}, updated_at = NOW() WHERE _id IN (${ids.map((_, i) => `$${values.length + i + 1}`).join(', ')}) RETURNING *`;
        const result = await this.executeQuery<IWithdrawalRequest>(query, [...values, ...ids]);
        return result.rows as any[];
    }

    async bulkDelete(ids: string[]): Promise<number> {
        if (ids.length === 0) return 0;
        const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');
        const result = await this.executeQuery(`DELETE FROM "${this.tableName}" WHERE _id IN (${placeholders})`, ids);
        return result.rowCount || 0;
    }
}
