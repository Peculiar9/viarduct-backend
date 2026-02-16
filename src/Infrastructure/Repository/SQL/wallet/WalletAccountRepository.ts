import { inject, injectable } from 'inversify';
import { BaseRepository } from '../BaseRepository';
import { TransactionManager } from '../Abstractions/TransactionManager';
import { IWalletAccount } from '../../../../Core/Application/Interface/Entities/wallet/IWalletAccount';
import { TableNames } from '../../../../Core/Application/Enums/TableNames';
import { TYPES } from '../../../../Core/Types/Constants';
import { DatabaseError } from '../../../../Core/Application/Error/AppError';

@injectable()
export class WalletAccountRepository extends BaseRepository<IWalletAccount> {
    constructor(
        @inject(TYPES.TransactionManager) transactionManager: TransactionManager
    ) {
        super(transactionManager, TableNames.WALLET_ACCOUNTS);
    }

    async findByWalletId(walletId: string): Promise<IWalletAccount[]> {
        try {
            const result = await this.executeQuery<IWalletAccount>(
                `SELECT * FROM "${this.tableName}" WHERE wallet_id = $1 ORDER BY created_at`,
                [walletId]
            );
            return result.rows as any[];
        } catch (error: any) {
            console.error('WalletAccountRepository::findByWalletId(): ', {
                message: error.message,
                stack: error.stack,
                tableName: this.tableName
            });
            throw error;
        }
    }

    async findByWalletIdAndCurrencyId(walletId: string, currencyId: string): Promise<IWalletAccount | null> {
        try {
            const result = await this.executeQuery<IWalletAccount>(
                `SELECT * FROM "${this.tableName}" WHERE wallet_id = $1 AND currency_id = $2`,
                [walletId, currencyId]
            );
            return (result.rows[0] as any) || null;
        } catch (error: any) {
            console.error('WalletAccountRepository::findByWalletIdAndCurrencyId(): ', {
                message: error.message,
                stack: error.stack,
                tableName: this.tableName
            });
            throw error;
        }
    }

    async updateBalance(walletAccountId: string, newBalance: number, newAvailableBalance: number, newLockedBalance: number): Promise<IWalletAccount | null> {
        try {
            const query = `
                UPDATE "${this.tableName}"
                SET balance = $1,
                    available_balance = $2,
                    locked_balance = $3,
                    updated_at = NOW()
                WHERE _id = $4
                RETURNING *
            `;
            const result = await this.executeQuery<IWalletAccount>(query, [
                newBalance,
                newAvailableBalance,
                newLockedBalance,
                walletAccountId
            ]);
            return (result.rows[0] as any) || null;
        } catch (error: any) {
            console.error('WalletAccountRepository::updateBalance(): ', {
                message: error.message,
                stack: error.stack,
                tableName: this.tableName
            });
            throw error;
        }
    }

    async findById(id: string): Promise<IWalletAccount | null> {
        try {
            const result = await this.executeQuery<IWalletAccount>(
                `SELECT * FROM "${this.tableName}" WHERE _id = $1`,
                [id]
            );
            return (result.rows[0] as any) || null;
        } catch (error: any) {
            console.error('WalletAccountRepository::findById(): ', {
                message: error.message,
                stack: error.stack,
                tableName: this.tableName
            });
            throw error;
        }
    }

    async findAll(): Promise<IWalletAccount[]> {
        try {
            const result = await this.executeQuery<IWalletAccount>(
                `SELECT * FROM "${this.tableName}" ORDER BY created_at DESC`
            );
            return result.rows as any[];
        } catch (error: any) {
            console.error('WalletAccountRepository::findAll(): ', {
                message: error.message,
                stack: error.stack,
                tableName: this.tableName
            });
            throw error;
        }
    }

    async findByCondition(condition: Partial<IWalletAccount>): Promise<IWalletAccount[]> {
        const { whereClause, values } = this.buildWhereClause(condition);
        const result = await this.executeQuery<IWalletAccount>(
            `SELECT * FROM "${this.tableName}" ${whereClause}`,
            values
        );
        return result.rows as any[];
    }

    async create(entity: IWalletAccount): Promise<IWalletAccount> {
        try {
            const { columns, values, placeholders } = this.getEntityColumns(entity);
            const query = `INSERT INTO "${this.tableName}" (${columns.join(', ')})
            VALUES (${placeholders.join(', ')})
            RETURNING *
            `;

            const result = await this.executeQuery<IWalletAccount>(query, values);
            return result.rows[0] as any;
        } catch (error: any) {
            console.error('WalletAccountRepository::create(): ', {
                message: error.message,
                stack: error.stack,
                tableName: this.tableName
            });
            throw error;
        }
    }

    async update(id: string, entity: Partial<IWalletAccount>): Promise<IWalletAccount | null> {
        const { setClause, values } = this.buildUpdateSet(entity);
        
        if (!setClause) {
            throw new Error('No fields to update');
        }
        
        const query = `UPDATE "${this.tableName}" 
            SET ${setClause}, updated_at = NOW()
            WHERE _id = $${values.length + 1}
            RETURNING *`;
        
        const result = await this.executeQuery<IWalletAccount>(query, [...values, id]);
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

    async count(condition?: Partial<IWalletAccount>): Promise<number> {
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

    async bulkCreate(entities: IWalletAccount[]): Promise<IWalletAccount[]> {
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
            const result = await this.executeQuery<IWalletAccount>(query, values);
            return result.rows as any[];
        } catch (error: any) {
            throw new DatabaseError(`Bulk wallet account creation failed: ${error.message}`);
        }
    }

    async bulkUpdate(entities: Partial<IWalletAccount>[]): Promise<IWalletAccount[]> {
        if (entities.length === 0) {
            return [];
        }

        const { updateClause, values } = this.buildBulkUpdateClause(entities);
        const walletAccountIds = entities.map(account => (account as any)._id);

        const query = `
            UPDATE "${this.tableName}"
            SET ${updateClause} 
            WHERE _id = ANY($${values.length + 1}::uuid[])
            RETURNING *
        `;

        try {
            const result = await this.executeQuery<IWalletAccount>(query, [...values, walletAccountIds]);
            return result.rows as any[];
        } catch (error: any) {
            throw new DatabaseError(`Bulk wallet account update failed: ${error.message}`);
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
            throw new DatabaseError(`Bulk wallet account deletion failed: ${error.message}`);
        }
    }

    async findByAddress(address: string): Promise<IWalletAccount | null> {
        try {
            const result = await this.executeQuery<IWalletAccount>(
                `SELECT * FROM "${this.tableName}" WHERE address = $1 LIMIT 1`,
                [address]
            );
            return (result.rows[0] as any) || null;
        } catch (error: any) {
            throw new DatabaseError(`Failed to find wallet account by address: ${error.message}`);
        }
    }
}

