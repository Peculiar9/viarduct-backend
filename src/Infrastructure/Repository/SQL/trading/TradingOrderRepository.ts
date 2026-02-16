import { inject, injectable } from 'inversify';
import { BaseRepository } from '../BaseRepository';
import { TransactionManager } from '../Abstractions/TransactionManager';
import { ITradingOrder, TradingOrderStatus, TradingOrderType } from '../../../../Core/Application/Interface/Entities/trading/ITradingOrder';
import { ITradingOrderRepository } from '../../../../Core/Application/Interface/Repositories/ITradingOrderRepository';
import { TableNames } from '../../../../Core/Application/Enums/TableNames';
import { TYPES } from '../../../../Core/Types/Constants';
import { DatabaseError } from '../../../../Core/Application/Error/AppError';

@injectable()
export class TradingOrderRepository extends BaseRepository<ITradingOrder> implements ITradingOrderRepository {
    constructor(
        @inject(TYPES.TransactionManager) transactionManager: TransactionManager
    ) {
        super(transactionManager, TableNames.TRADING_ORDERS);
    }

    async findByUserId(userId: string, limit: number = 50, offset: number = 0): Promise<ITradingOrder[]> {
        try {
            const result = await this.executeQuery<ITradingOrder>(
                `SELECT * FROM "${this.tableName}" WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
                [userId, limit, offset]
            );
            return result.rows as any[];
        } catch (error: any) {
            throw new DatabaseError(`Failed to find orders by user: ${error.message}`);
        }
    }

    async findByStatus(status: TradingOrderStatus, limit: number = 50): Promise<ITradingOrder[]> {
        try {
            const result = await this.executeQuery<ITradingOrder>(
                `SELECT * FROM "${this.tableName}" WHERE status = $1 ORDER BY created_at DESC LIMIT $2`,
                [status, limit]
            );
            return result.rows as any[];
        } catch (error: any) {
            throw new DatabaseError(`Failed to find orders by status: ${error.message}`);
        }
    }

    async findByBitcoinTxHash(txHash: string): Promise<ITradingOrder | null> {
        try {
            const result = await this.executeQuery<ITradingOrder>(
                `SELECT * FROM "${this.tableName}" WHERE bitcoin_tx_hash = $1 OR bitcoin_tx_hash_outgoing = $1 LIMIT 1`,
                [txHash]
            );
            return (result.rows[0] as any) || null;
        } catch (error: any) {
            throw new DatabaseError(`Failed to find order by tx hash: ${error.message}`);
        }
    }

    async findByBitcoinTxHashOutgoing(txHash: string): Promise<ITradingOrder | null> {
        try {
            const result = await this.executeQuery<ITradingOrder>(
                `SELECT * FROM "${this.tableName}" WHERE bitcoin_tx_hash_outgoing = $1 LIMIT 1`,
                [txHash]
            );
            return (result.rows[0] as any) || null;
        } catch (error: any) {
            throw new DatabaseError(`Failed to find order by outgoing tx hash: ${error.message}`);
        }
    }

    async findByPaymentReference(paymentReference: string): Promise<ITradingOrder | null> {
        try {
            const result = await this.executeQuery<ITradingOrder>(
                `SELECT * FROM "${this.tableName}" WHERE payment_reference = $1 LIMIT 1`,
                [paymentReference]
            );
            return (result.rows[0] as any) || null;
        } catch (error: any) {
            throw new DatabaseError(`Failed to find order by payment reference: ${error.message}`);
        }
    }

    async findById(id: string): Promise<ITradingOrder | null> {
        try {
            const result = await this.executeQuery<ITradingOrder>(
                `SELECT * FROM "${this.tableName}" WHERE _id = $1`,
                [id]
            );
            return (result.rows[0] as any) || null;
        } catch (error: any) {
            throw new DatabaseError(`Failed to find order by id: ${error.message}`);
        }
    }

    async findAll(): Promise<ITradingOrder[]> {
        try {
            const result = await this.executeQuery<ITradingOrder>(
                `SELECT * FROM "${this.tableName}" ORDER BY created_at DESC`
            );
            return result.rows as any[];
        } catch (error: any) {
            throw new DatabaseError(`Failed to find all orders: ${error.message}`);
        }
    }

    async findByCondition(condition: Partial<ITradingOrder>): Promise<ITradingOrder[]> {
        try {
            const { whereClause, values } = this.buildWhereClause(condition);
            const result = await this.executeQuery<ITradingOrder>(
                `SELECT * FROM "${this.tableName}" WHERE ${whereClause} ORDER BY created_at DESC`,
                values
            );
            return result.rows as any[];
        } catch (error: any) {
            throw new DatabaseError(`Failed to find orders by condition: ${error.message}`);
        }
    }

    /**
     * Find orders with filters (for admin)
     * @param filters - Filter options: userId, status, type
     * @param limit - Maximum number of results
     * @param offset - Number of results to skip
     */
    async findWithFilters(
        filters: {
            userId?: string;
            status?: TradingOrderStatus;
            type?: TradingOrderType;
        },
        limit: number = 50,
        offset: number = 0
    ): Promise<ITradingOrder[]> {
        try {
            const conditions: string[] = [];
            const values: any[] = [];
            let paramIndex = 1;

            if (filters.userId) {
                conditions.push(`user_id = $${paramIndex}`);
                values.push(filters.userId);
                paramIndex++;
            }

            if (filters.status) {
                conditions.push(`status = $${paramIndex}`);
                values.push(filters.status);
                paramIndex++;
            }

            if (filters.type) {
                conditions.push(`"type" = $${paramIndex}`);
                values.push(filters.type);
                paramIndex++;
            }

            let query = `SELECT * FROM "${this.tableName}"`;
            
            if (conditions.length > 0) {
                query += ` WHERE ${conditions.join(' AND ')}`;
            }

            query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
            values.push(limit, offset);

            const result = await this.executeQuery<ITradingOrder>(query, values);
            return result.rows as any[];
        } catch (error: any) {
            throw new DatabaseError(`Failed to find orders with filters: ${error.message}`);
        }
    }

    async create(entity: ITradingOrder): Promise<ITradingOrder> {
        try {
            const columns = Object.keys(entity).filter(key => key !== '_id' && entity[key as keyof ITradingOrder] !== undefined);
            const values = columns.map(col => entity[col as keyof ITradingOrder]);
            const placeholders = columns.map((_, index) => `$${index + 1}`).join(', ');
            const columnNames = columns.map(col => `"${col}"`).join(', ');

            const query = `
                INSERT INTO "${this.tableName}" (${columnNames})
                VALUES (${placeholders})
                RETURNING *
            `;

            const result = await this.executeQuery<ITradingOrder>(query, values);
            return result.rows[0] as any;
        } catch (error: any) {
            throw new DatabaseError(`Failed to create order: ${error.message}`);
        }
    }

    async update(id: string, entity: Partial<ITradingOrder>): Promise<ITradingOrder | null> {
        try {
            const { setClause, values } = this.buildUpdateSet(entity);
            
            if (!setClause) {
                throw new DatabaseError('No fields to update');
            }

            const query = `
                UPDATE "${this.tableName}"
                SET ${setClause}, updated_at = CURRENT_TIMESTAMP
                WHERE _id = $${values.length + 1}
                RETURNING *
            `;

            const result = await this.executeQuery<ITradingOrder>(query, [...values, id]);
            return (result.rows[0] as any) || null;
        } catch (error: any) {
            throw new DatabaseError(`Failed to update order: ${error.message}`);
        }
    }

    async delete(id: string): Promise<boolean> {
        try {
            const result = await this.executeQuery(
                `DELETE FROM "${this.tableName}" WHERE _id = $1`,
                [id]
            );
            return (result.rowCount || 0) > 0;
        } catch (error: any) {
            throw new DatabaseError(`Failed to delete order: ${error.message}`);
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

    async count(condition?: Partial<ITradingOrder>): Promise<number> {
        try {
            let query = `SELECT COUNT(*) as count FROM "${this.tableName}"`;
            const params: any[] = [];

            if (condition && Object.keys(condition).length > 0) {
                const { whereClause, values } = this.buildWhereClause(condition);
                // whereClause already includes "WHERE" prefix, so just append it
                query += ` ${whereClause}`;
                params.push(...values);
            }

            const result = await this.executeQuery<{ count: string }>(query, params);
            return parseInt((result.rows[0] as any)?.count || '0', 10);
        } catch (error: any) {
            throw new DatabaseError(`Failed to count orders: ${error.message}`);
        }
    }

    async bulkCreate(entities: ITradingOrder[]): Promise<ITradingOrder[]> {
        try {
            if (entities.length === 0) return [];

            const { valuesClause, values, columns } = this.buildBulkInsertClause(entities);
            const columnNames = columns.map(col => `"${col}"`).join(', ');

            const query = `
                INSERT INTO "${this.tableName}" (${columnNames})
                VALUES ${valuesClause}
                RETURNING *
            `;

            const result = await this.executeQuery<ITradingOrder>(query, values);
            return result.rows as any[];
        } catch (error: any) {
            throw new DatabaseError(`Failed to bulk create orders: ${error.message}`);
        }
    }

    async bulkUpdate(entities: Partial<ITradingOrder>[]): Promise<ITradingOrder[]> {
        try {
            // Implementation would go here if needed
            throw new DatabaseError('Bulk update not implemented for trading orders');
        } catch (error: any) {
            throw new DatabaseError(`Failed to bulk update orders: ${error.message}`);
        }
    }

    async bulkDelete(ids: string[]): Promise<number> {
        try {
            if (ids.length === 0) return 0;

            const placeholders = ids.map((_, index) => `$${index + 1}`).join(', ');
            const query = `
                DELETE FROM "${this.tableName}"
                WHERE _id IN (${placeholders})
                RETURNING _id
            `;

            const result = await this.executeQuery(query, ids);
            return result.rowCount || 0;
        } catch (error: any) {
            throw new DatabaseError(`Failed to bulk delete orders: ${error.message}`);
        }
    }
}

