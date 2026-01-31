import { inject, injectable } from 'inversify';
import { BaseRepository } from '../BaseRepository';
import { TransactionManager } from '../Abstractions/TransactionManager';
import { ICurrency } from '../../../../Core/Application/Interface/Entities/wallet/ICurrency';
import { TableNames } from '../../../../Core/Application/Enums/TableNames';
import { TYPES } from '../../../../Core/Types/Constants';
import { DatabaseError } from '../../../../Core/Application/Error/AppError';

@injectable()
export class CurrencyRepository extends BaseRepository<ICurrency> {
    constructor(
        @inject(TYPES.TransactionManager) transactionManager: TransactionManager
    ) {
        super(transactionManager, TableNames.CURRENCIES);
    }

    async findByCode(code: string): Promise<ICurrency | null> {
        try {
            const result = await this.executeQuery<ICurrency>(
                `SELECT * FROM "${this.tableName}" WHERE code = $1`,
                [code]
            );
            return (result.rows[0] as any) || null;
        } catch (error: any) {
            console.error('CurrencyRepository::findByCode(): ', {
                message: error.message,
                stack: error.stack,
                tableName: this.tableName
            });
            throw error;
        }
    }

    async findAll(): Promise<ICurrency[]> {
        try {
            const result = await this.executeQuery<ICurrency>(
                `SELECT * FROM "${this.tableName}" ORDER BY type, code`
            );
            return result.rows as any[];
        } catch (error: any) {
            console.error('CurrencyRepository::findAll(): ', {
                message: error.message,
                stack: error.stack,
                tableName: this.tableName
            });
            throw error;
        }
    }

    async findByType(type: 'fiat' | 'crypto'): Promise<ICurrency[]> {
        try {
            const result = await this.executeQuery<ICurrency>(
                `SELECT * FROM "${this.tableName}" WHERE type = $1 AND is_active = true ORDER BY code`,
                [type]
            );
            return result.rows as any[];
        } catch (error: any) {
            console.error('CurrencyRepository::findByType(): ', {
                message: error.message,
                stack: error.stack,
                tableName: this.tableName
            });
            throw error;
        }
    }

    async findById(id: string): Promise<ICurrency | null> {
        try {
            const result = await this.executeQuery<ICurrency>(
                `SELECT * FROM "${this.tableName}" WHERE _id = $1`,
                [id]
            );
            return (result.rows[0] as any) || null;
        } catch (error: any) {
            console.error('CurrencyRepository::findById(): ', {
                message: error.message,
                stack: error.stack,
                tableName: this.tableName
            });
            throw error;
        }
    }

    async findByCondition(condition: Partial<ICurrency>): Promise<ICurrency[]> {
        const { whereClause, values } = this.buildWhereClause(condition);
        const result = await this.executeQuery<ICurrency>(
            `SELECT * FROM "${this.tableName}" ${whereClause}`,
            values
        );
        return result.rows as any[];
    }

    async create(entity: ICurrency): Promise<ICurrency> {
        try {
            const { columns, values, placeholders } = this.getEntityColumns(entity);
            const query = `INSERT INTO "${this.tableName}" (${columns.join(', ')})
            VALUES (${placeholders.join(', ')})
            RETURNING *
            `;

            const result = await this.executeQuery<ICurrency>(query, values);
            return result.rows[0] as any;
        } catch (error: any) {
            console.error('CurrencyRepository::create(): ', {
                message: error.message,
                stack: error.stack,
                tableName: this.tableName
            });
            throw error;
        }
    }

    async update(id: string, entity: Partial<ICurrency>): Promise<ICurrency | null> {
        const { setClause, values } = this.buildUpdateSet(entity);
        
        if (!setClause) {
            throw new Error('No fields to update');
        }
        
        const query = `UPDATE "${this.tableName}" 
            SET ${setClause}, updated_at = NOW()
            WHERE _id = $${values.length + 1}
            RETURNING *`;
        
        const result = await this.executeQuery<ICurrency>(query, [...values, id]);
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

    async count(condition?: Partial<ICurrency>): Promise<number> {
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

    async bulkCreate(entities: ICurrency[]): Promise<ICurrency[]> {
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
            const result = await this.executeQuery<ICurrency>(query, values);
            return result.rows as any[];
        } catch (error: any) {
            throw new DatabaseError(`Bulk currency creation failed: ${error.message}`);
        }
    }

    async bulkUpdate(entities: Partial<ICurrency>[]): Promise<ICurrency[]> {
        if (entities.length === 0) {
            return [];
        }

        const { updateClause, values } = this.buildBulkUpdateClause(entities);
        const currencyIds = entities.map(currency => (currency as any)._id);

        const query = `
            UPDATE "${this.tableName}"
            SET ${updateClause} 
            WHERE _id = ANY($${values.length + 1}::uuid[])
            RETURNING *
        `;

        try {
            const result = await this.executeQuery<ICurrency>(query, [...values, currencyIds]);
            return result.rows as any[];
        } catch (error: any) {
            throw new DatabaseError(`Bulk currency update failed: ${error.message}`);
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
            throw new DatabaseError(`Bulk currency deletion failed: ${error.message}`);
        }
    }
}

