import { inject, injectable } from 'inversify';
import { BaseRepository } from '../BaseRepository';
import { TransactionManager } from '../Abstractions/TransactionManager';
import { ITradeIntent, TradeIntentStatus, TradeIntentType } from '../../../../Core/Application/Interface/Entities/trading/ITradeIntent';
import { ITradeIntentRepository } from '../../../../Core/Application/Interface/Repositories/ITradeIntentRepository';
import { TableNames } from '../../../../Core/Application/Enums/TableNames';
import { TYPES } from '../../../../Core/Types/Constants';
import { DatabaseError } from '../../../../Core/Application/Error/AppError';

@injectable()
export class TradeIntentRepository extends BaseRepository<ITradeIntent> implements ITradeIntentRepository {
    constructor(@inject(TYPES.TransactionManager) transactionManager: TransactionManager) {
        super(transactionManager, TableNames.TRADE_INTENTS);
    }

    async findById(id: string): Promise<ITradeIntent | null> {
        try {
            const result = await this.executeQuery(`SELECT * FROM "${this.tableName}" WHERE _id = $1`, [id]);
            return (result.rows[0] as any) || null;
        } catch (error: any) {
            throw new DatabaseError(`Failed to find trade intent by id: ${error.message}`);
        }
    }

    async findAll(): Promise<ITradeIntent[]> {
        try {
            const result = await this.executeQuery(`SELECT * FROM "${this.tableName}" ORDER BY created_at DESC`);
            return result.rows as any[];
        } catch (error: any) {
            throw new DatabaseError(`Failed to find all trade intents: ${error.message}`);
        }
    }

    async findByCondition(condition: Partial<ITradeIntent>): Promise<ITradeIntent[]> {
        try {
            const { whereClause, values } = this.buildWhereClause(condition);
            const result = await this.executeQuery(
                `SELECT * FROM "${this.tableName}" WHERE ${whereClause} ORDER BY created_at DESC`,
                values
            );
            return result.rows as any[];
        } catch (error: any) {
            throw new DatabaseError(`Failed to find trade intents by condition: ${error.message}`);
        }
    }

    async create(entity: Partial<ITradeIntent>): Promise<ITradeIntent> {
        try {
            const columns = Object.keys(entity).filter(
                (key) => key !== '_id' && entity[key as keyof ITradeIntent] !== undefined
            );
            const values = columns.map((col) => entity[col as keyof ITradeIntent]);
            const placeholders = columns.map((_, index) => `$${index + 1}`).join(', ');
            const columnNames = columns.map((col) => `"${col}"`).join(', ');
            const query = `INSERT INTO "${this.tableName}" (${columnNames}) VALUES (${placeholders}) RETURNING *`;
            const result = await this.executeQuery(query, values);
            return result.rows[0] as any;
        } catch (error: any) {
            throw new DatabaseError(`Failed to create trade intent: ${error.message}`);
        }
    }

    async update(id: string, entity: Partial<ITradeIntent>): Promise<ITradeIntent | null> {
        try {
            const { setClause, values } = this.buildUpdateSet(entity);
            if (!setClause) {
                throw new DatabaseError('No fields to update');
            }
            const query = `UPDATE "${this.tableName}" SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE _id = $${values.length + 1} RETURNING *`;
            const result = await this.executeQuery(query, [...values, id]);
            return (result.rows[0] as any) || null;
        } catch (error: any) {
            throw new DatabaseError(`Failed to update trade intent: ${error.message}`);
        }
    }

    async delete(id: string): Promise<boolean> {
        try {
            const result = await this.executeQuery(`DELETE FROM "${this.tableName}" WHERE _id = $1`, [id]);
            return (result.rowCount || 0) > 0;
        } catch (error: any) {
            throw new DatabaseError(`Failed to delete trade intent: ${error.message}`);
        }
    }

    async executeRawQuery(query: string, params: any[]): Promise<any> {
        try {
            const result = await this.executeQuery(query, params);
            return result.rows;
        } catch (error: any) {
            throw new DatabaseError(`Failed to execute raw query: ${error.message}`);
        }
    }

    async count(condition?: Partial<ITradeIntent>): Promise<number> {
        try {
            let query = `SELECT COUNT(*) as count FROM "${this.tableName}"`;
            const params: any[] = [];
            if (condition && Object.keys(condition).length > 0) {
                const { whereClause, values } = this.buildWhereClause(condition);
                query += ` ${whereClause}`;
                params.push(...values);
            }
            const result = await this.executeQuery(query, params);
            return parseInt((result.rows[0] as any)?.count || '0', 10);
        } catch (error: any) {
            throw new DatabaseError(`Failed to count trade intents: ${error.message}`);
        }
    }

    async bulkCreate(entities: Partial<ITradeIntent>[]): Promise<ITradeIntent[]> {
        const created: ITradeIntent[] = [];
        for (const entity of entities) {
            created.push(await this.create(entity));
        }
        return created;
    }

    async bulkUpdate(entities: Partial<ITradeIntent>[]): Promise<ITradeIntent[]> {
        const updated: ITradeIntent[] = [];
        for (const entity of entities) {
            if (!entity._id) continue;
            const row = await this.update(entity._id, entity);
            if (row) updated.push(row);
        }
        return updated;
    }

    async bulkDelete(ids: string[]): Promise<number> {
        let count = 0;
        for (const id of ids) {
            if (await this.delete(id)) count++;
        }
        return count;
    }

    async findByUserId(userId: string, limit: number = 50, offset: number = 0): Promise<ITradeIntent[]> {
        try {
            const result = await this.executeQuery(
                `SELECT * FROM "${this.tableName}" WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
                [userId, limit, offset]
            );
            return result.rows as any[];
        } catch (error: any) {
            throw new DatabaseError(`Failed to find trade intents by user: ${error.message}`);
        }
    }

    async findByDepositAddress(address: string): Promise<ITradeIntent | null> {
        try {
            const result = await this.executeQuery(
                `SELECT * FROM "${this.tableName}" WHERE LOWER(deposit_address) = LOWER($1) LIMIT 1`,
                [address]
            );
            return (result.rows[0] as any) || null;
        } catch (error: any) {
            throw new DatabaseError(`Failed to find trade intent by deposit address: ${error.message}`);
        }
    }

    async findByIncomingTxHash(txHash: string): Promise<ITradeIntent | null> {
        try {
            const result = await this.executeQuery(
                `SELECT * FROM "${this.tableName}" WHERE incoming_tx_hash = $1 LIMIT 1`,
                [txHash]
            );
            return (result.rows[0] as any) || null;
        } catch (error: any) {
            throw new DatabaseError(`Failed to find trade intent by tx hash: ${error.message}`);
        }
    }

    async findWithFilters(filters: {
        status?: TradeIntentStatus;
        type?: TradeIntentType;
        crypto_type?: string;
        user_id?: string;
        date_from?: string;
        date_to?: string;
        limit?: number;
        offset?: number;
    }): Promise<ITradeIntent[]> {
        const { where, params } = this.buildFilterClause(filters);
        const limit = filters.limit ?? 50;
        const offset = filters.offset ?? 0;
        const limitIndex = params.length + 1;
        const offsetIndex = params.length + 2;

        try {
            const result = await this.executeQuery(
                `SELECT * FROM "${this.tableName}" ${where} ORDER BY created_at DESC LIMIT $${limitIndex} OFFSET $${offsetIndex}`,
                [...params, limit, offset]
            );
            return result.rows as any[];
        } catch (error: any) {
            throw new DatabaseError(`Failed to find trade intents with filters: ${error.message}`);
        }
    }

    async countWithFilters(filters: {
        status?: TradeIntentStatus;
        type?: TradeIntentType;
        crypto_type?: string;
        user_id?: string;
        date_from?: string;
        date_to?: string;
    }): Promise<number> {
        const { where, params } = this.buildFilterClause(filters);
        try {
            const result = await this.executeQuery(
                `SELECT COUNT(*) as count FROM "${this.tableName}" ${where}`,
                params
            );
            return parseInt((result.rows[0] as any)?.count || '0', 10);
        } catch (error: any) {
            throw new DatabaseError(`Failed to count trade intents with filters: ${error.message}`);
        }
    }

    private buildFilterClause(filters: {
        status?: TradeIntentStatus;
        type?: TradeIntentType;
        crypto_type?: string;
        user_id?: string;
        date_from?: string;
        date_to?: string;
    }): { where: string; params: unknown[] } {
        const conditions: string[] = [];
        const params: unknown[] = [];
        let paramIndex = 1;

        if (filters.status) {
            conditions.push(`status = $${paramIndex++}`);
            params.push(filters.status);
        }
        if (filters.type) {
            conditions.push(`"type" = $${paramIndex++}`);
            params.push(filters.type);
        }
        if (filters.crypto_type) {
            conditions.push(`UPPER(crypto_type) = $${paramIndex++}`);
            params.push(filters.crypto_type.toUpperCase());
        }
        if (filters.user_id) {
            conditions.push(`user_id = $${paramIndex++}`);
            params.push(filters.user_id);
        }
        if (filters.date_from) {
            conditions.push(`created_at >= $${paramIndex++}`);
            params.push(filters.date_from);
        }
        if (filters.date_to) {
            conditions.push(`created_at <= $${paramIndex++}`);
            params.push(filters.date_to);
        }

        const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
        return { where, params };
    }

    async findSellIntentsReadyForSweep(limit: number = 100): Promise<ITradeIntent[]> {
        try {
            const result = await this.executeQuery(
                `SELECT * FROM "${this.tableName}"
                 WHERE type = 'sell'
                   AND status = 'settled'
                   AND deposit_address IS NOT NULL
                   AND swept_at IS NULL
                 ORDER BY settled_at ASC NULLS LAST
                 LIMIT $1`,
                [limit]
            );
            return result.rows as any[];
        } catch (error: any) {
            throw new DatabaseError(`Failed to find sell intents ready for sweep: ${error.message}`);
        }
    }
}
