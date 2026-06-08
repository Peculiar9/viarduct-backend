import { inject, injectable } from 'inversify';
import { TYPES } from '../../../../Core/Types/Constants';
import { BaseRepository } from '../BaseRepository';
import { TransactionManager } from '../Abstractions/TransactionManager';
import { IEthereumTransaction } from '../../../../Core/Application/Interface/Entities/ethereum/IEthereumTransaction';
import { TableNames } from '../../../../Core/Application/Enums/TableNames';
import { DatabaseError } from '../../../../Core/Application/Error/AppError';

@injectable()
export class EthereumTransactionRepository extends BaseRepository<IEthereumTransaction> {
    constructor(
        @inject(TYPES.TransactionManager) transactionManager: TransactionManager
    ) {
        super(transactionManager, TableNames.ETHEREUM_TRANSACTIONS);
    }

    async findByTxHash(txHash: string): Promise<IEthereumTransaction | null> {
        try {
            const result = await this.executeQuery<IEthereumTransaction>(
                `SELECT * FROM "${this.tableName}" WHERE tx_hash = $1`,
                [txHash]
            );
            return (result.rows[0] as any) || null;
        } catch (error: any) {
            throw new DatabaseError(`Failed to find Ethereum transaction by hash: ${error.message}`);
        }
    }

    async findByAddress(address: string, limit: number = 50): Promise<IEthereumTransaction[]> {
        try {
            const result = await this.executeQuery<IEthereumTransaction>(
                `SELECT * FROM "${this.tableName}" WHERE address = $1 ORDER BY created_at DESC LIMIT $2`,
                [address, limit]
            );
            return result.rows as any[];
        } catch (error: any) {
            throw new DatabaseError(`Failed to find Ethereum transactions by address: ${error.message}`);
        }
    }

    async findByWalletAccountId(
        walletAccountId: string,
        limit: number = 50,
        offset: number = 0
    ): Promise<IEthereumTransaction[]> {
        try {
            const result = await this.executeQuery<IEthereumTransaction>(
                `SELECT * FROM "${this.tableName}" WHERE wallet_account_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
                [walletAccountId, limit, offset]
            );
            return result.rows as any[];
        } catch (error: any) {
            throw new DatabaseError(`Failed to find Ethereum transactions by wallet account: ${error.message}`);
        }
    }

    async create(entity: IEthereumTransaction): Promise<IEthereumTransaction> {
        try {
            const columns = Object.keys(entity).filter(
                (key) => key !== '_id' && entity[key as keyof IEthereumTransaction] !== undefined
            );
            const values = columns.map((col) => entity[col as keyof IEthereumTransaction]);
            const placeholders = columns.map((_, index) => `$${index + 1}`).join(', ');
            const columnNames = columns.map((col) => `"${col}"`).join(', ');

            const query = `
                INSERT INTO "${this.tableName}" (${columnNames})
                VALUES (${placeholders})
                RETURNING *
            `;

            const result = await this.executeQuery<IEthereumTransaction>(query, values);
            return result.rows[0] as any;
        } catch (error: any) {
            throw new DatabaseError(`Failed to create ethereum transaction: ${error.message}`);
        }
    }

    async findById(id: string): Promise<IEthereumTransaction | null> {
        try {
            const result = await this.executeQuery<IEthereumTransaction>(
                `SELECT * FROM "${this.tableName}" WHERE _id = $1`,
                [id]
            );
            return (result.rows[0] as any) || null;
        } catch (error: any) {
            throw new DatabaseError(`Failed to find Ethereum transaction by id: ${error.message}`);
        }
    }

    async findAll(): Promise<IEthereumTransaction[]> {
        try {
            const result = await this.executeQuery<IEthereumTransaction>(
                `SELECT * FROM "${this.tableName}" ORDER BY created_at DESC`
            );
            return result.rows as any[];
        } catch (error: any) {
            throw new DatabaseError(`Failed to find all Ethereum transactions: ${error.message}`);
        }
    }

    async findByCondition(condition: Partial<IEthereumTransaction>): Promise<IEthereumTransaction[]> {
        try {
            const { whereClause, values } = this.buildWhereClause(condition);
            const result = await this.executeQuery<IEthereumTransaction>(
                `SELECT * FROM "${this.tableName}" ${whereClause} ORDER BY created_at DESC`,
                values
            );
            return result.rows as any[];
        } catch (error: any) {
            throw new DatabaseError(`Failed to find Ethereum transactions by condition: ${error.message}`);
        }
    }

    async update(id: string, entity: Partial<IEthereumTransaction>): Promise<IEthereumTransaction | null> {
        try {
            const { setClause, values } = this.buildUpdateSet(entity);
            if (!setClause) {
                return this.findById(id);
            }
            const query = `
                UPDATE "${this.tableName}"
                SET ${setClause}, updated_at = CURRENT_TIMESTAMP
                WHERE _id = $${values.length + 1}
                RETURNING *
            `;
            const result = await this.executeQuery<IEthereumTransaction>(query, [...values, id]);
            return (result.rows[0] as any) || null;
        } catch (error: any) {
            throw new DatabaseError(`Failed to update Ethereum transaction: ${error.message}`);
        }
    }

    async delete(id: string): Promise<boolean> {
        try {
            const result = await this.executeQuery(`DELETE FROM "${this.tableName}" WHERE _id = $1`, [id]);
            return (result.rowCount || 0) > 0;
        } catch (error: any) {
            throw new DatabaseError(`Failed to delete Ethereum transaction: ${error.message}`);
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

    async count(condition?: Partial<IEthereumTransaction>): Promise<number> {
        try {
            let query = `SELECT COUNT(*) as count FROM "${this.tableName}"`;
            const params: any[] = [];

            if (condition && Object.keys(condition).length > 0) {
                const { whereClause, values } = this.buildWhereClause(condition);
                query += ` ${whereClause}`;
                params.push(...values);
            }

            const result = await this.executeQuery<{ count: string }>(query, params);
            return parseInt((result.rows[0] as any)?.count || '0', 10);
        } catch (error: any) {
            throw new DatabaseError(`Failed to count Ethereum transactions: ${error.message}`);
        }
    }

    async bulkCreate(entities: IEthereumTransaction[]): Promise<IEthereumTransaction[]> {
        try {
            if (entities.length === 0) return [];

            const { valuesClause, values, columns } = this.buildBulkInsertClause(entities);
            const columnNames = columns.map((col) => `"${col}"`).join(', ');

            const query = `
                INSERT INTO "${this.tableName}" (${columnNames})
                VALUES ${valuesClause}
                RETURNING *
            `;

            const result = await this.executeQuery<IEthereumTransaction>(query, values);
            return result.rows as any[];
        } catch (error: any) {
            throw new DatabaseError(`Failed to bulk create Ethereum transactions: ${error.message}`);
        }
    }

    async bulkUpdate(entities: Partial<IEthereumTransaction>[]): Promise<IEthereumTransaction[]> {
        try {
            throw new DatabaseError('Bulk update not implemented for Ethereum transactions');
        } catch (error: any) {
            throw new DatabaseError(`Failed to bulk update Ethereum transactions: ${error.message}`);
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
            throw new DatabaseError(`Failed to bulk delete Ethereum transactions: ${error.message}`);
        }
    }
}
