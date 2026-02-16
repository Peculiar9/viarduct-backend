import { inject, injectable } from 'inversify';
import { BaseRepository } from './BaseRepository';
import { TransactionManager } from './Abstractions/TransactionManager';
import { IUTXO } from '../../../Core/Application/Interface/Entities/IUTXO';
import { IUTXORepository } from '../../../Core/Application/Interface/Repositories/IUTXORepository';
import { TableNames } from '../../../Core/Application/Enums/TableNames';
import { TYPES } from '../../../Core/Types/Constants';
import { DatabaseError } from '../../../Core/Application/Error/AppError';

@injectable()
export class UTXORepository extends BaseRepository<IUTXO> implements IUTXORepository {
    constructor(
        @inject(TYPES.TransactionManager) transactionManager: TransactionManager
    ) {
        super(transactionManager, TableNames.UTXOS);
    }

    async findByAddress(address: string): Promise<IUTXO[]> {
        try {
            const result = await this.executeQuery<IUTXO>(
                `SELECT * FROM "${this.tableName}" WHERE address = $1 ORDER BY amount ASC`,
                [address]
            );
            return result.rows as any[];
        } catch (error: any) {
            throw new DatabaseError(`Failed to find UTXOs by address: ${error.message}`);
        }
    }

    async findByAddressAndStatus(address: string, status: IUTXO['status']): Promise<IUTXO[]> {
        try {
            const result = await this.executeQuery<IUTXO>(
                `SELECT * FROM "${this.tableName}" WHERE address = $1 AND status = $2 ORDER BY amount ASC`,
                [address, status]
            );
            return result.rows as any[];
        } catch (error: any) {
            throw new DatabaseError(`Failed to find UTXOs by address and status: ${error.message}`);
        }
    }

    async findAvailableByAddress(address: string, minAmount?: number): Promise<IUTXO[]> {
        try {
            let query = `SELECT * FROM "${this.tableName}" WHERE address = $1 AND status = 'available'`;
            const params: any[] = [address];
            
            if (minAmount !== undefined) {
                query += ` AND amount >= $2 ORDER BY amount ASC`;
                params.push(minAmount);
            } else {
                query += ` ORDER BY amount ASC`;
            }

            const result = await this.executeQuery<IUTXO>(query, params);
            return result.rows as any[];
        } catch (error: any) {
            throw new DatabaseError(`Failed to find available UTXOs: ${error.message}`);
        }
    }

    /**
     * Atomically reserve UTXOs for an order
     * Uses FOR UPDATE lock to prevent double-spending
     */
    async reserveUTXOs(utxoIds: string[], orderId: string): Promise<IUTXO[]> {
        const client = await this.transactionManager.getStandaloneClient();
        
        try {
            await client.query('BEGIN');

            // Lock the UTXOs and check they're available
            const placeholders = utxoIds.map((_, i) => `$${i + 1}`).join(', ');
            const lockQuery = `
                SELECT * FROM "${this.tableName}" 
                WHERE _id IN (${placeholders}) 
                AND status = 'available'
                FOR UPDATE
            `;
            
            const lockResult = await client.query<IUTXO>(lockQuery, utxoIds);
            
            if (lockResult.rows.length !== utxoIds.length) {
                await client.query('ROLLBACK');
                throw new DatabaseError('Some UTXOs are not available or do not exist');
            }

            // Update status to reserved
            // Note: orderId is $1, so UTXO IDs start from $2
            const updatePlaceholders = utxoIds.map((_, i) => `$${i + 2}`).join(', ');
            const updateQuery = `
                UPDATE "${this.tableName}"
                SET status = 'reserved',
                    reserved_for_order_id = $1,
                    updated_at = NOW()
                WHERE _id IN (${updatePlaceholders})
                RETURNING *
            `;
            
            const updateResult = await client.query<IUTXO>(
                updateQuery,
                [orderId, ...utxoIds]
            );

            await client.query('COMMIT');
            return updateResult.rows as any[];
        } catch (error: any) {
            await client.query('ROLLBACK').catch(() => {});
            throw new DatabaseError(`Failed to reserve UTXOs: ${error.message}`);
        } finally {
            await this.transactionManager.releaseStandaloneClient(client);
        }
    }

    async markAsSpent(utxoIds: string[], spentTxid: string): Promise<void> {
        try {
            const placeholders = utxoIds.map((_, i) => `$${i + 2}`).join(', ');
            await this.executeQuery(
                `UPDATE "${this.tableName}"
                 SET status = 'spent',
                     spent_txid = $1,
                     spent_at = NOW(),
                     updated_at = NOW()
                 WHERE _id IN (${placeholders})`,
                [spentTxid, ...utxoIds]
            );
        } catch (error: any) {
            throw new DatabaseError(`Failed to mark UTXOs as spent: ${error.message}`);
        }
    }

    async findByTxidAndVout(txid: string, vout: number): Promise<IUTXO | null> {
        try {
            const result = await this.executeQuery<IUTXO>(
                `SELECT * FROM "${this.tableName}" WHERE txid = $1 AND vout = $2 LIMIT 1`,
                [txid, vout]
            );
            return (result.rows[0] as any) || null;
        } catch (error: any) {
            throw new DatabaseError(`Failed to find UTXO by txid and vout: ${error.message}`);
        }
    }

    async findByOrderId(orderId: string): Promise<IUTXO[]> {
        try {
            const result = await this.executeQuery<IUTXO>(
                `SELECT * FROM "${this.tableName}" WHERE reserved_for_order_id = $1`,
                [orderId]
            );
            return result.rows as any[];
        } catch (error: any) {
            throw new DatabaseError(`Failed to find UTXOs by order ID: ${error.message}`);
        }
    }

    async findByStatus(status: IUTXO['status']): Promise<IUTXO[]> {
        try {
            const result = await this.executeQuery<IUTXO>(
                `SELECT * FROM "${this.tableName}" WHERE status = $1`,
                [status]
            );
            return result.rows as any[];
        } catch (error: any) {
            throw new DatabaseError(`Failed to find UTXOs by status: ${error.message}`);
        }
    }

    // BaseRepository required methods
    async findById(id: string): Promise<IUTXO | null> {
        try {
            const result = await this.executeQuery<IUTXO>(
                `SELECT * FROM "${this.tableName}" WHERE _id = $1 LIMIT 1`,
                [id]
            );
            return (result.rows[0] as any) || null;
        } catch (error: any) {
            throw new DatabaseError(`Failed to find UTXO by id: ${error.message}`);
        }
    }

    async findAll(): Promise<IUTXO[]> {
        try {
            const result = await this.executeQuery<IUTXO>(
                `SELECT * FROM "${this.tableName}" ORDER BY created_at DESC`
            );
            return result.rows as any[];
        } catch (error: any) {
            throw new DatabaseError(`Failed to find all UTXOs: ${error.message}`);
        }
    }

    async findByCondition(condition: Partial<IUTXO>): Promise<IUTXO[]> {
        try {
            const keys = Object.keys(condition);
            const values = Object.values(condition);
            const whereClause = keys.map((key, index) => `"${key}" = $${index + 1}`).join(' AND ');
            
            const result = await this.executeQuery<IUTXO>(
                `SELECT * FROM "${this.tableName}" WHERE ${whereClause} ORDER BY created_at DESC`,
                values
            );
            return result.rows as any[];
        } catch (error: any) {
            throw new DatabaseError(`Failed to find UTXOs by condition: ${error.message}`);
        }
    }

    async create(entity: IUTXO): Promise<IUTXO> {
        try {
            const columns = Object.keys(entity).filter(key => key !== '_id' && entity[key as keyof IUTXO] !== undefined);
            const values = columns.map(col => entity[col as keyof IUTXO]);
            const placeholders = columns.map((_, index) => `$${index + 1}`).join(', ');
            const columnNames = columns.map(col => `"${col}"`).join(', ');

            const query = `
                INSERT INTO "${this.tableName}" (${columnNames})
                VALUES (${placeholders})
                RETURNING *
            `;

            const result = await this.executeQuery<IUTXO>(query, values);
            return result.rows[0] as any;
        } catch (error: any) {
            throw new DatabaseError(`Failed to create UTXO: ${error.message}`);
        }
    }

    async update(id: string, entity: Partial<IUTXO>): Promise<IUTXO | null> {
        try {
            const { setClause, values } = this.buildUpdateSet(entity);
            
            if (setClause === '') {
                // No fields to update
                return await this.findById(id);
            }

            const query = `
                UPDATE "${this.tableName}"
                SET ${setClause}, "updated_at" = NOW()
                WHERE _id = $${values.length + 1}
                RETURNING *
            `;

            const result = await this.executeQuery<IUTXO>(query, [...values, id]);
            return (result.rows[0] as any) || null;
        } catch (error: any) {
            throw new DatabaseError(`Failed to update UTXO: ${error.message}`);
        }
    }

    async delete(id: string, deletedBy?: string): Promise<boolean> {
        try {
            const result = await this.executeQuery(
                `DELETE FROM "${this.tableName}" WHERE _id = $1`,
                [id]
            );
            return (result.rowCount || 0) > 0;
        } catch (error: any) {
            throw new DatabaseError(`Failed to delete UTXO: ${error.message}`);
        }
    }

    async executeRawQuery(query: string, params: any[]): Promise<any> {
        return await this.executeQuery(query, params);
    }

    async count(condition?: Partial<IUTXO>): Promise<number> {
        try {
            let query = `SELECT COUNT(*) as count FROM "${this.tableName}"`;
            const params: any[] = [];

            if (condition) {
                const { whereClause, values } = this.buildWhereClause(condition);
                query += ` ${whereClause}`;
                params.push(...values);
            }

            const result = await this.executeQuery<{ count: string }>(query, params);
            return parseInt((result.rows[0] as any)?.count || '0', 10);
        } catch (error: any) {
            throw new DatabaseError(`Failed to count UTXOs: ${error.message}`);
        }
    }

    async bulkCreate(entities: IUTXO[]): Promise<IUTXO[]> {
        try {
            if (entities.length === 0) return [];

            const { valuesClause, values, columns } = this.buildBulkInsertClause(entities);
            const columnNames = columns.map(col => `"${col}"`).join(', ');

            const query = `
                INSERT INTO "${this.tableName}" (${columnNames})
                VALUES ${valuesClause}
                RETURNING *
            `;

            const result = await this.executeQuery<IUTXO>(query, values);
            return result.rows as any[];
        } catch (error: any) {
            throw new DatabaseError(`Failed to bulk create UTXOs: ${error.message}`);
        }
    }

    async bulkUpdate(entities: Partial<IUTXO>[]): Promise<IUTXO[]> {
        try {
            if (entities.length === 0) return [];

            const { updateClause, values } = this.buildBulkUpdateClause(entities);
            const ids = entities.map(e => (e as any)._id).filter(Boolean);

            const query = `
                UPDATE "${this.tableName}"
                SET ${updateClause}, "updated_at" = NOW()
                WHERE _id IN (${ids.map((_, i) => `$${values.length + i + 1}`).join(', ')})
                RETURNING *
            `;

            const result = await this.executeQuery<IUTXO>(query, [...values, ...ids]);
            return result.rows as any[];
        } catch (error: any) {
            throw new DatabaseError(`Failed to bulk update UTXOs: ${error.message}`);
        }
    }

    async bulkDelete(ids: string[]): Promise<number> {
        try {
            if (ids.length === 0) return 0;

            const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');
            const result = await this.executeQuery(
                `DELETE FROM "${this.tableName}" WHERE _id IN (${placeholders})`,
                ids
            );
            return result.rowCount || 0;
        } catch (error: any) {
            throw new DatabaseError(`Failed to bulk delete UTXOs: ${error.message}`);
        }
    }
}

