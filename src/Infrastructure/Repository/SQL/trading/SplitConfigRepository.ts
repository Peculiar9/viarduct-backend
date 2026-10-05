import { inject, injectable } from 'inversify';
import { BaseRepository } from '../BaseRepository';
import { TransactionManager } from '../Abstractions/TransactionManager';
import { ISplitConfig } from '../../../../Core/Application/Interface/Entities/trading/ISplitConfig';
import { ISplitConfigRepository } from '../../../../Core/Application/Interface/Repositories/ISplitConfigRepository';
import { TableNames } from '../../../../Core/Application/Enums/TableNames';
import { TYPES } from '../../../../Core/Types/Constants';

@injectable()
export class SplitConfigRepository
    extends BaseRepository<ISplitConfig>
    implements ISplitConfigRepository
{
    constructor(@inject(TYPES.TransactionManager) transactionManager: TransactionManager) {
        super(transactionManager, TableNames.SPLIT_CONFIGS);
    }

    async findByTitle(title: string): Promise<ISplitConfig | null> {
        const result = await this.executeQuery<ISplitConfig>(
            `SELECT * FROM "${this.tableName}" WHERE title = $1 LIMIT 1`,
            [title]
        );
        return (result.rows[0] as any) || null;
    }

    async upsertByTitle(title: string, value: number, updatedBy: string): Promise<ISplitConfig> {
        const result = await this.executeQuery<ISplitConfig>(
            `INSERT INTO "${this.tableName}" (title, value, updated_by, created_at, updated_at)
             VALUES ($1, $2, $3, NOW(), NOW())
             ON CONFLICT (title)
             DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = NOW()
             RETURNING *`,
            [title, value, updatedBy]
        );
        return result.rows[0] as any;
    }

    async create(entity: ISplitConfig): Promise<ISplitConfig> {
        const { columns, values, placeholders } = this.getEntityColumns(entity as Partial<ISplitConfig>);
        const query = `INSERT INTO "${this.tableName}" (${columns.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`;
        const result = await this.executeQuery<ISplitConfig>(query, values);
        return result.rows[0] as any;
    }

    async findById(id: string): Promise<ISplitConfig | null> {
        const result = await this.executeQuery<ISplitConfig>(
            `SELECT * FROM "${this.tableName}" WHERE _id = $1`,
            [id]
        );
        return (result.rows[0] as any) || null;
    }

    async findAll(): Promise<ISplitConfig[]> {
        const result = await this.executeQuery<ISplitConfig>(
            `SELECT * FROM "${this.tableName}" ORDER BY title ASC`
        );
        return result.rows as any[];
    }

    async findByCondition(condition: Partial<ISplitConfig>): Promise<ISplitConfig[]> {
        const keys = Object.keys(condition);
        const values = Object.values(condition);
        if (keys.length === 0) return this.findAll();
        const whereClause = keys.map((key, index) => `"${key}" = $${index + 1}`).join(' AND ');
        const result = await this.executeQuery<ISplitConfig>(
            `SELECT * FROM "${this.tableName}" WHERE ${whereClause} ORDER BY title ASC`,
            values
        );
        return result.rows as any[];
    }

    async update(id: string, entity: Partial<ISplitConfig>): Promise<ISplitConfig | null> {
        const { setClause, values } = this.buildUpdateSet(entity);
        if (!setClause) return null;
        const query = `UPDATE "${this.tableName}" SET ${setClause}, updated_at = NOW() WHERE _id = $${values.length + 1} RETURNING *`;
        const result = await this.executeQuery<ISplitConfig>(query, [...values, id]);
        return (result.rows[0] as any) || null;
    }

    async delete(id: string, _deletedBy?: string): Promise<boolean> {
        const result = await this.executeQuery(`DELETE FROM "${this.tableName}" WHERE _id = $1`, [id]);
        return (result.rowCount || 0) > 0;
    }

    async executeRawQuery(query: string, params: any[]): Promise<any> {
        return await this.executeQuery(query, params);
    }

    async count(condition?: Partial<ISplitConfig>): Promise<number> {
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

    async bulkCreate(entities: ISplitConfig[]): Promise<ISplitConfig[]> {
        if (entities.length === 0) return [];
        const { valuesClause, values, columns } = this.buildBulkInsertClause(entities);
        const columnNames = columns.map((col) => `"${col}"`).join(', ');
        const query = `INSERT INTO "${this.tableName}" (${columnNames}) VALUES ${valuesClause} RETURNING *`;
        const result = await this.executeQuery<ISplitConfig>(query, values);
        return result.rows as any[];
    }

    async bulkUpdate(entities: Partial<ISplitConfig>[]): Promise<ISplitConfig[]> {
        if (entities.length === 0) return [];
        const { updateClause, values } = this.buildBulkUpdateClause(entities);
        const ids = entities.map((e) => (e as any)._id).filter(Boolean);
        const query = `UPDATE "${this.tableName}" SET ${updateClause}, updated_at = NOW() WHERE _id IN (${ids
            .map((_, i) => `$${values.length + i + 1}`)
            .join(', ')}) RETURNING *`;
        const result = await this.executeQuery<ISplitConfig>(query, [...values, ...ids]);
        return result.rows as any[];
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
