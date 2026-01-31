import { inject, injectable } from 'inversify';
import { BaseRepository } from '../BaseRepository';
import { TransactionManager } from '../Abstractions/TransactionManager';
import { ITransaction } from '../../../../Core/Application/Interface/Entities/payments/IPayment';
import { TableNames } from '../../../../Core/Application/Enums/TableNames';
import { TYPES } from '../../../../Core/Types/Constants';
import { DatabaseError } from '../../../../Core/Application/Error/AppError';

@injectable()
export class TransactionRepository extends BaseRepository<ITransaction> {
    constructor(
        @inject(TYPES.TransactionManager) transactionManager: TransactionManager
    ) {
        super(transactionManager, TableNames.TRANSACTIONS);
    }

    async findByReference(reference: string): Promise<ITransaction | null> {
        try {
            console.log('TransactionRepository::findByReference() - Searching for reference:', reference);
            const result = await this.executeQuery<ITransaction>(
                `SELECT * FROM "${this.tableName}" WHERE payment_reference = $1`,
                [reference]
            );
            console.log('TransactionRepository::findByReference() - Found rows:', result.rows.length);
            return (result.rows[0] as any) || null;
        } catch (error: any) {
            console.error('TransactionRepository::findByReference(): ', {
                message: error.message,
                stack: error.stack,
                tableName: this.tableName,
                reference
            });
            throw error;
        }
    }

    async findByTransactionId(transactionId: string): Promise<ITransaction | null> {
        try {
            const result = await this.executeQuery<ITransaction>(
                `SELECT * FROM "${this.tableName}" WHERE transaction_id = $1`,
                [transactionId]
            );
            return (result.rows[0] as any) || null;
        } catch (error: any) {
            console.error('TransactionRepository::findByTransactionId(): ', {
                message: error.message,
                stack: error.stack,
                tableName: this.tableName
            });
            throw error;
        }
    }

    async findByUserId(userId: string): Promise<ITransaction[]> {
        try {
            const result = await this.executeQuery<ITransaction>(
                `SELECT * FROM "${this.tableName}" WHERE user_id = $1 ORDER BY created_at DESC`,
                [userId]
            );
            return result.rows as any[];
        } catch (error: any) {
            console.error('TransactionRepository::findByUserId(): ', {
                message: error.message,
                stack: error.stack,
                tableName: this.tableName
            });
            throw error;
        }
    }

    async findById(id: string): Promise<ITransaction | null> {
        try {
            const result = await this.executeQuery<ITransaction>(
                `SELECT * FROM "${this.tableName}" WHERE _id = $1`,
                [id]
            );
            return (result.rows[0] as any) || null;
        } catch (error: any) {
            console.error('TransactionRepository::findById(): ', {
                message: error.message,
                stack: error.stack,
                tableName: this.tableName
            });
            throw error;
        }
    }

    async findAll(): Promise<ITransaction[]> {
        try {
            const result = await this.executeQuery<ITransaction>(
                `SELECT * FROM "${this.tableName}" ORDER BY created_at DESC`
            );
            return result.rows as any[];
        } catch (error: any) {
            console.error('TransactionRepository::findAll(): ', {
                message: error.message,
                stack: error.stack,
                tableName: this.tableName
            });
            throw error;
        }
    }

    async findByCondition(condition: Partial<ITransaction>): Promise<ITransaction[]> {
        const { whereClause, values } = this.buildWhereClause(condition);
        const result = await this.executeQuery<ITransaction>(
            `SELECT * FROM "${this.tableName}" ${whereClause}`,
            values
        );
        return result.rows as any[];
    }

    async create(entity: ITransaction): Promise<ITransaction> {
        try {
            const { columns, values, placeholders } = this.getEntityColumns(entity);
            const query = `INSERT INTO "${this.tableName}" (${columns.join(', ')})
                VALUES (${placeholders.join(', ')})
                RETURNING *
            `;

            const result = await this.executeQuery<ITransaction>(query, values);
            return result.rows[0] as any;
        } catch (error: any) {
            console.error('TransactionRepository::create(): ', {
                message: error.message,
                stack: error.stack,
                tableName: this.tableName
            });
            throw error;
        }
    }

    async update(id: string, entity: Partial<ITransaction>): Promise<ITransaction | null> {
        const { setClause, values } = this.buildUpdateSet(entity);
        
        if (!setClause) {
            throw new Error('No fields to update');
        }
        
        const query = `UPDATE "${this.tableName}" 
            SET ${setClause}, updated_at = NOW()
            WHERE _id = $${values.length + 1}
            RETURNING *`;
        
        const result = await this.executeQuery<ITransaction>(query, [...values, id]);
        return (result.rows[0] as any) || null;
    }

    async delete(id: string, deletedBy?: string): Promise<boolean> {
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

    async count(condition?: Partial<ITransaction>): Promise<number> {
        if (condition) {
            const { whereClause, values } = this.buildWhereClause(condition);
            const result = await this.executeQuery<{ count: string }>(
                `SELECT COUNT(*) as count FROM "${this.tableName}" ${whereClause}`,
                values
            );
            return parseInt((result.rows[0] as any).count);
        }

        const result = await this.executeQuery<{ count: string }>(
            `SELECT COUNT(*) as count FROM "${this.tableName}"`
        );
        return parseInt((result.rows[0] as any).count);
    }

    async bulkCreate(entities: ITransaction[]): Promise<ITransaction[]> {
        const { valuesClause, values, columns } = this.buildBulkInsertClause(entities);

        if (entities.length === 0) {
            return [];
        }

        const query = `
            INSERT INTO "${this.tableName}" (${columns.join(', ')})
            VALUES ${valuesClause}
            RETURNING *
        `;

        try {
            const result = await this.executeQuery<ITransaction>(query, values);
            return result.rows as any[];
        } catch (error: any) {
            throw new DatabaseError(`Bulk transaction creation failed: ${error.message}`);
        }
    }

    async bulkUpdate(entities: Partial<ITransaction>[]): Promise<ITransaction[]> {
        if (entities.length === 0) {
            return [];
        }

        const { updateClause, values } = this.buildBulkUpdateClause(entities);
        const transactionIds = entities.map(t => (t as any)._id);

        const query = `
            UPDATE "${this.tableName}"
            SET ${updateClause} 
            WHERE _id = ANY($${values.length + 1}::uuid[])
            RETURNING *
        `;

        try {
            const result = await this.executeQuery<ITransaction>(query, [...values, transactionIds]);
            return result.rows as any[];
        } catch (error: any) {
            throw new DatabaseError(`Bulk transaction update failed: ${error.message}`);
        }
    }

    async bulkDelete(ids: string[]): Promise<number> {
        if (ids.length === 0) {
            return 0;
        }

        const query = `
            DELETE FROM "${this.tableName}"
            WHERE _id = ANY($1::uuid[])
            RETURNING _id
        `;

        try {
            const result = await this.executeQuery(query, [ids]);
            return result.rowCount || 0;
        } catch (error: any) {
            throw new DatabaseError(`Bulk transaction deletion failed: ${error.message}`);
        }
    }
}

