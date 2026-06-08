import { inject, injectable } from 'inversify';
import { BaseRepository } from '../BaseRepository';
import { TransactionManager } from '../Abstractions/TransactionManager';
import { TYPES } from '../../../../Core/Types/Constants';
import { TableNames } from '../../../../Core/Application/Enums/TableNames';
import { ISweepAudit } from '../../../../Core/Application/Interface/Entities/bitcoin/ISweepAudit';

@injectable()
export class SweepAuditRepository extends BaseRepository<ISweepAudit> {
    constructor(
        @inject(TYPES.TransactionManager) transactionManager: TransactionManager
    ) {
        super(transactionManager, TableNames.SWEEP_AUDITS);
    }

    async findById(id: string): Promise<ISweepAudit | null> {
        const result = await this.executeQuery<ISweepAudit>(
            `SELECT * FROM "${this.tableName}" WHERE _id = $1 LIMIT 1`,
            [id]
        );
        return (result.rows[0] as any) || null;
    }

    async findAll(): Promise<ISweepAudit[]> {
        const result = await this.executeQuery<ISweepAudit>(
            `SELECT * FROM "${this.tableName}" ORDER BY created_at DESC`
        );
        return result.rows as any[];
    }

    async findByCondition(condition: Partial<ISweepAudit>): Promise<ISweepAudit[]> {
        const { whereClause, values } = this.buildWhereClause(condition);
        const result = await this.executeQuery<ISweepAudit>(
            `SELECT * FROM "${this.tableName}" ${whereClause} ORDER BY created_at DESC`,
            values
        );
        return result.rows as any[];
    }

    async create(entity: ISweepAudit): Promise<ISweepAudit> {
        const columns = Object.keys(entity).filter(key => key !== '_id' && (entity as any)[key] !== undefined);
        const values = columns.map(col => (entity as any)[col]);
        const placeholders = columns.map((_, index) => `$${index + 1}`).join(', ');
        const columnNames = columns.map(col => `"${col}"`).join(', ');

        const query = `
            INSERT INTO "${this.tableName}" (${columnNames})
            VALUES (${placeholders})
            RETURNING *
        `;
        const result = await this.executeQuery<ISweepAudit>(query, values);
        return result.rows[0] as any;
    }

    async update(id: string, entity: Partial<ISweepAudit>): Promise<ISweepAudit | null> {
        const { setClause, values } = this.buildUpdateSet(entity);
        if (!setClause) return await this.findById(id);
        const query = `
            UPDATE "${this.tableName}"
            SET ${setClause}, updated_at = CURRENT_TIMESTAMP
            WHERE _id = $${values.length + 1}
            RETURNING *
        `;
        const result = await this.executeQuery<ISweepAudit>(query, [...values, id]);
        return (result.rows[0] as any) || null;
    }

    async delete(id: string): Promise<boolean> {
        const result = await this.executeQuery(
            `DELETE FROM "${this.tableName}" WHERE _id = $1`,
            [id]
        );
        return (result.rowCount || 0) > 0;
    }

    async executeRawQuery(query: string, params: any[]): Promise<any> {
        const result = await this.executeQuery(query, params);
        return result.rows;
    }

    async count(condition?: Partial<ISweepAudit>): Promise<number> {
        let query = `SELECT COUNT(*) as count FROM "${this.tableName}"`;
        const params: any[] = [];
        if (condition && Object.keys(condition).length > 0) {
            const { whereClause, values } = this.buildWhereClause(condition);
            query += ` ${whereClause}`;
            params.push(...values);
        }
        const result = await this.executeQuery<{ count: string }>(query, params);
        return parseInt((result.rows[0] as any)?.count || '0', 10);
    }

    async bulkCreate(entities: ISweepAudit[]): Promise<ISweepAudit[]> {
        const { valuesClause, values, columns } = this.buildBulkInsertClause(entities);
        const query = `
            INSERT INTO "${this.tableName}" (${columns.join(', ')})
            VALUES ${valuesClause}
            RETURNING *
        `;
        const result = await this.executeQuery<ISweepAudit>(query, values);
        return result.rows as any[];
    }

    async bulkUpdate(): Promise<ISweepAudit[]> {
        throw new Error('Bulk update not implemented for sweep audits');
    }

    async bulkDelete(ids: string[]): Promise<number> {
        if (ids.length === 0) return 0;
        const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');
        const result = await this.executeQuery(
            `DELETE FROM "${this.tableName}" WHERE _id IN (${placeholders})`,
            ids
        );
        return result.rowCount || 0;
    }
}

