import { inject, injectable } from 'inversify';
import { BaseRepository } from '../BaseRepository';
import { TransactionManager } from '../Abstractions/TransactionManager';
import { TableNames } from '../../../../Core/Application/Enums/TableNames';
import { TYPES } from '../../../../Core/Types/Constants';
import { IWalletTransaction } from '../../../../Core/Application/Interface/Entities/wallet/IWalletTransaction';
import { IWalletTransactionRepository } from '../../../../Core/Application/Interface/Repositories/IWalletTransactionRepository';
import { DatabaseError } from '../../../../Core/Application/Error/AppError';

@injectable()
export class WalletTransactionRepository
    extends BaseRepository<IWalletTransaction>
    implements IWalletTransactionRepository
{
    constructor(@inject(TYPES.TransactionManager) transactionManager: TransactionManager) {
        super(transactionManager, TableNames.WALLET_TRANSACTIONS);
    }

    async create(entity: Partial<IWalletTransaction>): Promise<IWalletTransaction> {
        try {
            const columns = Object.keys(entity).filter(
                (key) => key !== '_id' && entity[key as keyof IWalletTransaction] !== undefined
            );
            const values = columns.map((col) => entity[col as keyof IWalletTransaction]);
            const placeholders = columns.map((_, index) => `$${index + 1}`).join(', ');
            const columnNames = columns.map((col) => `"${col}"`).join(', ');
            const query = `INSERT INTO "${this.tableName}" (${columnNames}) VALUES (${placeholders}) RETURNING *`;
            const result = await this.executeQuery(query, values);
            return result.rows[0] as any;
        } catch (error: any) {
            throw new DatabaseError(`Failed to create wallet transaction: ${error.message}`);
        }
    }

    async findByIncomingTxHash(txHash: string): Promise<IWalletTransaction | null> {
        try {
            const result = await this.executeQuery(
                `SELECT * FROM "${this.tableName}" WHERE LOWER(incoming_tx_hash) = LOWER($1) LIMIT 1`,
                [txHash]
            );
            return (result.rows[0] as any) || null;
        } catch (error: any) {
            throw new DatabaseError(`Failed to find wallet transaction by hash: ${error.message}`);
        }
    }

    async lockByIncomingTxHash(txHash: string): Promise<IWalletTransaction | null> {
        try {
            const result = await this.executeQuery(
                `SELECT * FROM "${this.tableName}"
                 WHERE LOWER(incoming_tx_hash) = LOWER($1)
                 LIMIT 1
                 FOR UPDATE`,
                [txHash]
            );
            return (result.rows[0] as any) || null;
        } catch (error: any) {
            throw new DatabaseError(`Failed to lock wallet transaction by hash: ${error.message}`);
        }
    }

    async update(id: string, entity: Partial<IWalletTransaction>): Promise<IWalletTransaction | null> {
        try {
            const { setClause, values } = this.buildUpdateSet(entity);
            if (!setClause) {
                return null;
            }
            const query = `UPDATE "${this.tableName}" SET ${setClause}, updated_at = NOW() WHERE _id = $${values.length + 1} RETURNING *`;
            const result = await this.executeQuery(query, [...values, id]);
            return (result.rows[0] as any) || null;
        } catch (error: any) {
            throw new DatabaseError(`Failed to update wallet transaction: ${error.message}`);
        }
    }

    async sumPendingWithdrawals(cryptoType: 'BTC' | 'ETH'): Promise<number> {
        try {
            const result = await this.executeQuery<{ total: string }>(
                `SELECT COALESCE(SUM(amount), 0) AS total
                 FROM "${this.tableName}"
                 WHERE type = 'WITHDRAWAL'
                   AND status IN ('PENDING', 'PROCESSING')
                   AND UPPER(crypto_type) = UPPER($1)`,
                [cryptoType]
            );
            return Number(parseFloat(String((result.rows[0] as any)?.total ?? '0')));
        } catch (error: any) {
            throw new DatabaseError(`Failed to sum pending withdrawals: ${error.message}`);
        }
    }

    async findById(id: string): Promise<IWalletTransaction | null> {
        try {
            const result = await this.executeQuery(
                `SELECT * FROM "${this.tableName}" WHERE _id = $1`,
                [id]
            );
            return (result.rows[0] as any) || null;
        } catch (error: any) {
            throw new DatabaseError(`Failed to find wallet transaction: ${error.message}`);
        }
    }

    async findAll(): Promise<IWalletTransaction[]> {
        try {
            const result = await this.executeQuery(
                `SELECT * FROM "${this.tableName}" ORDER BY created_at DESC`
            );
            return result.rows as any[];
        } catch (error: any) {
            throw new DatabaseError(`Failed to list wallet transactions: ${error.message}`);
        }
    }

    async findByCondition(condition: Partial<IWalletTransaction>): Promise<IWalletTransaction[]> {
        const { whereClause, values } = this.buildWhereClause(condition);
        const result = await this.executeQuery(
            `SELECT * FROM "${this.tableName}" ${whereClause}`,
            values
        );
        return result.rows as any[];
    }

    async delete(id: string, _deletedBy?: string): Promise<boolean> {
        const result = await this.executeQuery(
            `DELETE FROM "${this.tableName}" WHERE _id = $1`,
            [id]
        );
        return (result.rowCount as number) > 0;
    }

    async executeRawQuery(query: string, params: any[]): Promise<any> {
        const result = await this.executeQuery(query, params);
        return result.rows;
    }

    async count(condition?: Partial<IWalletTransaction>): Promise<number> {
        if (condition) {
            const { whereClause, values } = this.buildWhereClause(condition);
            const result = await this.executeQuery<{ count: string }>(
                `SELECT COUNT(*) as count FROM "${this.tableName}" ${whereClause}`,
                values
            );
            return parseInt((result.rows[0] as any).count, 10);
        }

        const result = await this.executeQuery<{ count: string }>(
            `SELECT COUNT(*) as count FROM "${this.tableName}"`
        );
        return parseInt((result.rows[0] as any).count, 10);
    }

    async bulkCreate(entities: IWalletTransaction[]): Promise<IWalletTransaction[]> {
        if (entities.length === 0) {
            return [];
        }

        const { valuesClause, values, columns } = this.buildBulkInsertClause(entities);
        const query = `
            INSERT INTO "${this.tableName}" (${columns.join(', ')})
            VALUES ${valuesClause}
            RETURNING *
        `;

        try {
            const result = await this.executeQuery(query, values);
            return result.rows as any[];
        } catch (error: any) {
            throw new DatabaseError(`Bulk wallet transaction creation failed: ${error.message}`);
        }
    }

    async bulkUpdate(entities: Partial<IWalletTransaction>[]): Promise<IWalletTransaction[]> {
        if (entities.length === 0) {
            return [];
        }

        const { updateClause, values } = this.buildBulkUpdateClause(entities);
        const ids = entities.map((entity) => (entity as any)._id);
        const query = `
            UPDATE "${this.tableName}"
            SET ${updateClause}
            WHERE _id = ANY($${values.length + 1}::uuid[])
            RETURNING *
        `;

        try {
            const result = await this.executeQuery(query, [...values, ids]);
            return result.rows as any[];
        } catch (error: any) {
            throw new DatabaseError(`Bulk wallet transaction update failed: ${error.message}`);
        }
    }

    async bulkDelete(ids: string[]): Promise<number> {
        if (ids.length === 0) {
            return 0;
        }

        try {
            const result = await this.executeQuery(
                `DELETE FROM "${this.tableName}" WHERE _id = ANY($1::uuid[]) RETURNING _id`,
                [ids]
            );
            return result.rowCount || 0;
        } catch (error: any) {
            throw new DatabaseError(`Bulk wallet transaction deletion failed: ${error.message}`);
        }
    }
}
