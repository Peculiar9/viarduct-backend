import { inject, injectable } from 'inversify';
import { BaseRepository } from '../BaseRepository';
import { TransactionManager } from '../Abstractions/TransactionManager';
import { IWallet } from '../../../../Core/Application/Interface/Entities/wallet/IWallet';
import { TableNames } from '../../../../Core/Application/Enums/TableNames';
import { TYPES } from '../../../../Core/Types/Constants';
import { DatabaseError } from '../../../../Core/Application/Error/AppError';

@injectable()
export class WalletRepository extends BaseRepository<IWallet> {
    constructor(
        @inject(TYPES.TransactionManager) transactionManager: TransactionManager
    ) {
        super(transactionManager, TableNames.WALLETS);
    }

    async findByUserId(userId: string): Promise<IWallet | null> {
        try {
            const result = await this.executeQuery<IWallet>(
                `SELECT * FROM "${this.tableName}" WHERE user_id = $1`,
                [userId]
            );
            return (result.rows[0] as any) || null;
        } catch (error: any) {
            console.error('WalletRepository::findByUserId(): ', {
                message: error.message,
                stack: error.stack,
                tableName: this.tableName
            });
            throw error;
        }
    }

    async findPlatformWallet(): Promise<IWallet | null> {
        try {
            const result = await this.executeQuery<IWallet>(
                `SELECT * FROM "${this.tableName}" WHERE is_platform_wallet = true LIMIT 1`,
                []
            );
            return (result.rows[0] as any) || null;
        } catch (error: any) {
            console.error('WalletRepository::findPlatformWallet(): ', {
                message: error.message,
                stack: error.stack,
                tableName: this.tableName
            });
            throw error;
        }
    }

    async findById(id: string): Promise<IWallet | null> {
        try {
            const result = await this.executeQuery<IWallet>(
                `SELECT * FROM "${this.tableName}" WHERE _id = $1`,
                [id]
            );
            return (result.rows[0] as any) || null;
        } catch (error: any) {
            console.error('WalletRepository::findById(): ', {
                message: error.message,
                stack: error.stack,
                tableName: this.tableName
            });
            throw error;
        }
    }

    async findAll(): Promise<IWallet[]> {
        try {
            const result = await this.executeQuery<IWallet>(
                `SELECT * FROM "${this.tableName}" ORDER BY created_at DESC`
            );
            return result.rows as any[];
        } catch (error: any) {
            console.error('WalletRepository::findAll(): ', {
                message: error.message,
                stack: error.stack,
                tableName: this.tableName
            });
            throw error;
        }
    }

    async findByCondition(condition: Partial<IWallet>): Promise<IWallet[]> {
        const { whereClause, values } = this.buildWhereClause(condition);
        const result = await this.executeQuery<IWallet>(
            `SELECT * FROM "${this.tableName}" ${whereClause}`,
            values
        );
        return result.rows as any[];
    }

    async create(entity: IWallet): Promise<IWallet> {
        try {
            const { columns, values, placeholders } = this.getEntityColumns(entity);
            const query = `INSERT INTO "${this.tableName}" (${columns.join(', ')})
            VALUES (${placeholders.join(', ')})
            RETURNING *
            `;

            const result = await this.executeQuery<IWallet>(query, values);
            return result.rows[0] as any;
        } catch (error: any) {
            console.error('WalletRepository::create(): ', {
                message: error.message,
                stack: error.stack,
                tableName: this.tableName
            });
            throw error;
        }
    }

    async update(id: string, entity: Partial<IWallet>): Promise<IWallet | null> {
        const { setClause, values } = this.buildUpdateSet(entity);
        
        if (!setClause) {
            throw new Error('No fields to update');
        }
        
        const query = `UPDATE "${this.tableName}" 
            SET ${setClause}, updated_at = NOW()
            WHERE _id = $${values.length + 1}
            RETURNING *`;
        
        const result = await this.executeQuery<IWallet>(query, [...values, id]);
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

    async count(condition?: Partial<IWallet>): Promise<number> {
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

    async bulkCreate(entities: IWallet[]): Promise<IWallet[]> {
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
            const result = await this.executeQuery<IWallet>(query, values);
            return result.rows as any[];
        } catch (error: any) {
            throw new DatabaseError(`Bulk wallet creation failed: ${error.message}`);
        }
    }

    async bulkUpdate(entities: Partial<IWallet>[]): Promise<IWallet[]> {
        if (entities.length === 0) {
            return [];
        }

        const { updateClause, values } = this.buildBulkUpdateClause(entities);
        const walletIds = entities.map(wallet => (wallet as any)._id);

        const query = `
            UPDATE "${this.tableName}"
            SET ${updateClause} 
            WHERE _id = ANY($${values.length + 1}::uuid[])
            RETURNING *
        `;

        try {
            const result = await this.executeQuery<IWallet>(query, [...values, walletIds]);
            return result.rows as any[];
        } catch (error: any) {
            throw new DatabaseError(`Bulk wallet update failed: ${error.message}`);
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
            throw new DatabaseError(`Bulk wallet deletion failed: ${error.message}`);
        }
    }
}

