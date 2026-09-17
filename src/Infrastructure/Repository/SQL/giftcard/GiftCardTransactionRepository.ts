import { inject, injectable } from 'inversify';
import { BaseRepository } from '../BaseRepository';
import { TransactionManager } from '../Abstractions/TransactionManager';
import { IGiftCardTransaction } from '../../../../Core/Application/Interface/Entities/giftcard/IGiftCardTransaction';
import { IGiftCardTransactionRepository } from '../../../../Core/Application/Interface/Repositories/IGiftCardTransactionRepository';
import { TableNames } from '../../../../Core/Application/Enums/TableNames';
import { TYPES } from '../../../../Core/Types/Constants';

@injectable()
export class GiftCardTransactionRepository
    extends BaseRepository<IGiftCardTransaction>
    implements IGiftCardTransactionRepository
{
    constructor(@inject(TYPES.TransactionManager) transactionManager: TransactionManager) {
        super(transactionManager, TableNames.GIFT_CARD_TRANSACTIONS);
    }

    async create(entity: IGiftCardTransaction): Promise<IGiftCardTransaction> {
        const { columns, values, placeholders } = this.getEntityColumns(entity as Partial<IGiftCardTransaction>);
        const query = `INSERT INTO "${this.tableName}" (${columns.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`;
        const result = await this.executeQuery<IGiftCardTransaction>(query, values);
        return result.rows[0] as any;
    }

    async findById(id: string): Promise<IGiftCardTransaction | null> {
        const result = await this.executeQuery<IGiftCardTransaction>(
            `SELECT * FROM "${this.tableName}" WHERE _id = $1`,
            [id]
        );
        return (result.rows[0] as any) || null;
    }

    async findByUserId(userId: string, limit: number = 50, offset: number = 0): Promise<IGiftCardTransaction[]> {
        const result = await this.executeQuery<IGiftCardTransaction>(
            `SELECT * FROM "${this.tableName}" WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
            [userId, limit, offset]
        );
        return result.rows as any[];
    }

    async countByUserId(userId: string): Promise<number> {
        const result = await this.executeQuery<{ count: string }>(
            `SELECT COUNT(*)::text as count FROM "${this.tableName}" WHERE user_id = $1`,
            [userId]
        );
        return Number((result.rows[0] as any)?.count || 0);
    }

    async findByCustomIdentifier(customIdentifier: string): Promise<IGiftCardTransaction | null> {
        const result = await this.executeQuery<IGiftCardTransaction>(
            `SELECT * FROM "${this.tableName}" WHERE custom_identifier = $1 LIMIT 1`,
            [customIdentifier]
        );
        return (result.rows[0] as any) || null;
    }

    async update(id: string, entity: Partial<IGiftCardTransaction>): Promise<IGiftCardTransaction | null> {
        const { setClause, values } = this.buildUpdateSet(entity);
        if (!setClause) return null;
        const query = `UPDATE "${this.tableName}" SET ${setClause}, updated_at = NOW() WHERE _id = $${values.length + 1} RETURNING *`;
        const result = await this.executeQuery<IGiftCardTransaction>(query, [...values, id]);
        return (result.rows[0] as any) || null;
    }

    async delete(id: string, _deletedBy?: string): Promise<boolean> {
        const result = await this.executeQuery(`DELETE FROM "${this.tableName}" WHERE _id = $1`, [id]);
        return (result.rowCount || 0) > 0;
    }

    async findByCondition(condition: Partial<IGiftCardTransaction>): Promise<IGiftCardTransaction[]> {
        const keys = Object.keys(condition);
        const values = Object.values(condition);
        if (keys.length === 0) {
            const result = await this.executeQuery<IGiftCardTransaction>(
                `SELECT * FROM "${this.tableName}" ORDER BY created_at DESC`
            );
            return result.rows as any[];
        }
        const whereClause = keys.map((key, index) => `"${key}" = $${index + 1}`).join(' AND ');
        const result = await this.executeQuery<IGiftCardTransaction>(
            `SELECT * FROM "${this.tableName}" WHERE ${whereClause} ORDER BY created_at DESC`,
            values
        );
        return result.rows as any[];
    }

    async executeRawQuery(query: string, params: any[]): Promise<any> {
        return this.executeQuery(query, params);
    }

    async bulkCreate(entities: IGiftCardTransaction[]): Promise<IGiftCardTransaction[]> {
        const results: IGiftCardTransaction[] = [];
        for (const entity of entities) {
            results.push(await this.create(entity));
        }
        return results;
    }

    async bulkUpdate(entities: Partial<IGiftCardTransaction>[]): Promise<IGiftCardTransaction[]> {
        const results: IGiftCardTransaction[] = [];
        for (const entity of entities) {
            if (!entity._id) continue;
            const updated = await this.update(entity._id, entity);
            if (updated) results.push(updated);
        }
        return results;
    }

    async findAll(): Promise<IGiftCardTransaction[]> {
        const result = await this.executeQuery<IGiftCardTransaction>(
            `SELECT * FROM "${this.tableName}" ORDER BY created_at DESC`
        );
        return result.rows as any[];
    }

    async count(condition?: Partial<IGiftCardTransaction>): Promise<number> {
        if (!condition || Object.keys(condition).length === 0) {
            const result = await this.executeQuery<{ count: string }>(
                `SELECT COUNT(*)::text as count FROM "${this.tableName}"`
            );
            return Number((result.rows[0] as any)?.count || 0);
        }
        const keys = Object.keys(condition);
        const values = Object.values(condition);
        const whereClause = keys.map((key, index) => `"${key}" = $${index + 1}`).join(' AND ');
        const result = await this.executeQuery<{ count: string }>(
            `SELECT COUNT(*)::text as count FROM "${this.tableName}" WHERE ${whereClause}`,
            values
        );
        return Number((result.rows[0] as any)?.count || 0);
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
