import { inject, injectable } from 'inversify';
import { BaseRepository } from '../BaseRepository';
import { TransactionManager } from '../Abstractions/TransactionManager';
import { ICard } from '../../../../Core/Application/Interface/Entities/giftcard/ICard';
import { ICardRepository } from '../../../../Core/Application/Interface/Repositories/ICardRepository';
import { TableNames } from '../../../../Core/Application/Enums/TableNames';
import { TYPES } from '../../../../Core/Types/Constants';

@injectable()
export class CardRepository extends BaseRepository<ICard> implements ICardRepository {
    constructor(
        @inject(TYPES.TransactionManager) transactionManager: TransactionManager
    ) {
        super(transactionManager, TableNames.CARDS);
    }

    async create(entity: ICard): Promise<ICard> {
        const { columns, values, placeholders } = this.getEntityColumns(entity as Partial<ICard>);
        const query = `INSERT INTO "${this.tableName}" (${columns.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`;
        const result = await this.executeQuery<ICard>(query, values);
        return result.rows[0] as any;
    }

    async findById(id: string): Promise<ICard | null> {
        const result = await this.executeQuery<ICard>(`SELECT * FROM "${this.tableName}" WHERE _id = $1`, [id]);
        return (result.rows[0] as any) || null;
    }

    async findAll(): Promise<ICard[]> {
        const result = await this.executeQuery<ICard>(`SELECT * FROM "${this.tableName}" ORDER BY name ASC`);
        return result.rows as any[];
    }

    async update(id: string, entity: Partial<ICard>): Promise<ICard | null> {
        const { setClause, values } = this.buildUpdateSet(entity);
        if (!setClause) return this.findById(id);
        const query = `UPDATE "${this.tableName}" SET ${setClause}, updated_at = NOW() WHERE _id = $${values.length + 1} RETURNING *`;
        const result = await this.executeQuery<ICard>(query, [...values, id]);
        return (result.rows[0] as any) || null;
    }

    async delete(id: string, _deletedBy?: string): Promise<boolean> {
        const result = await this.executeQuery(`DELETE FROM "${this.tableName}" WHERE _id = $1`, [id]);
        return (result.rowCount || 0) > 0;
    }

    async findByCondition(condition: Partial<ICard>): Promise<ICard[]> {
        const keys = Object.keys(condition);
        const values = Object.values(condition);
        if (keys.length === 0) return this.findAll();
        const whereClause = keys.map((key, index) => `"${key}" = $${index + 1}`).join(' AND ');
        const result = await this.executeQuery<ICard>(
            `SELECT * FROM "${this.tableName}" WHERE ${whereClause} ORDER BY name ASC`,
            values
        );
        return result.rows as any[];
    }

    async executeRawQuery(query: string, params: any[]): Promise<any> {
        return await this.executeQuery(query, params);
    }

    async count(condition?: Partial<ICard>): Promise<number> {
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

    async bulkCreate(entities: ICard[]): Promise<ICard[]> {
        if (entities.length === 0) return [];
        const { valuesClause, values, columns } = this.buildBulkInsertClause(entities);
        const columnNames = columns.map(col => `"${col}"`).join(', ');
        const query = `INSERT INTO "${this.tableName}" (${columnNames}) VALUES ${valuesClause} RETURNING *`;
        const result = await this.executeQuery<ICard>(query, values);
        return result.rows as any[];
    }

    async bulkUpdate(entities: Partial<ICard>[]): Promise<ICard[]> {
        if (entities.length === 0) return [];
        const { updateClause, values } = this.buildBulkUpdateClause(entities);
        const ids = entities.map(e => (e as any)._id).filter(Boolean);
        const query = `UPDATE "${this.tableName}" SET ${updateClause}, updated_at = NOW() WHERE _id IN (${ids.map((_, i) => `$${values.length + i + 1}`).join(', ')}) RETURNING *`;
        const result = await this.executeQuery<ICard>(query, [...values, ...ids]);
        return result.rows as any[];
    }

    async bulkDelete(ids: string[]): Promise<number> {
        if (ids.length === 0) return 0;
        const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');
        const result = await this.executeQuery(`DELETE FROM "${this.tableName}" WHERE _id IN (${placeholders})`, ids);
        return result.rowCount || 0;
    }
}
