import { inject, injectable } from 'inversify';
import { BaseRepository } from '../BaseRepository';
import { TransactionManager } from '../Abstractions/TransactionManager';
import { ITradingRate } from '../../../../Core/Application/Interface/Entities/trading/ITradingRate';
import { ITradingRateRepository } from '../../../../Core/Application/Interface/Repositories/ITradingRateRepository';
import { TableNames } from '../../../../Core/Application/Enums/TableNames';
import { TYPES } from '../../../../Core/Types/Constants';
import { DatabaseError } from '../../../../Core/Application/Error/AppError';

@injectable()
export class TradingRateRepository extends BaseRepository<ITradingRate> implements ITradingRateRepository {
    constructor(
        @inject(TYPES.TransactionManager) transactionManager: TransactionManager
    ) {
        super(transactionManager, TableNames.TRADING_RATES);
    }

    async findById(id: string): Promise<ITradingRate | null> {
        try {
            const result = await this.executeQuery<ITradingRate>(
                `SELECT * FROM "${this.tableName}" WHERE _id = $1`,
                [id]
            );
            return (result.rows[0] as any) || null;
        } catch (error: any) {
            console.error('TradingRateRepository::findById(): ', {
                message: error.message,
                stack: error.stack,
                tableName: this.tableName
            });
            throw new DatabaseError(`Failed to find trading rate by id: ${error.message}`);
        }
    }

    async findAll(): Promise<ITradingRate[]> {
        try {
            const query = `SELECT * FROM "${this.tableName}" ORDER BY created_at DESC`;
            console.log('TradingRateRepository::findAll() - Executing query:', query);
            const result = await this.executeQuery<ITradingRate>(query, []);
            console.log('TradingRateRepository::findAll() - Found records:', result.rows.length);
            return result.rows as any[];
        } catch (error: any) {
            console.error('TradingRateRepository::findAll(): ', {
                message: error.message,
                stack: error.stack,
                tableName: this.tableName
            });
            throw new DatabaseError(`Failed to find all trading rates: ${error.message}`);
        }
    }

    async findByCondition(condition: Partial<ITradingRate>): Promise<ITradingRate[]> {
        try {
            const keys = Object.keys(condition);
            const values = Object.values(condition);
            const whereClause = keys.map((key, index) => `${key} = $${index + 1}`).join(' AND ');
            
            const result = await this.executeQuery<ITradingRate>(
                `SELECT * FROM "${this.tableName}" WHERE ${whereClause} ORDER BY created_at DESC`,
                values
            );
            return result.rows as any[];
        } catch (error: any) {
            console.error('TradingRateRepository::findByCondition(): ', {
                message: error.message,
                stack: error.stack,
                tableName: this.tableName
            });
            throw new DatabaseError(`Failed to find trading rates by condition: ${error.message}`);
        }
    }

    async create(entity: ITradingRate): Promise<ITradingRate> {
        try {
            const columns = Object.keys(entity).filter(key => key !== '_id' && entity[key as keyof ITradingRate] !== undefined);
            const values = columns.map(col => entity[col as keyof ITradingRate]);
            const placeholders = columns.map((_, index) => `$${index + 1}`).join(', ');
            const columnNames = columns.map(col => `"${col}"`).join(', ');

            const query = `
                INSERT INTO "${this.tableName}" (${columnNames})
                VALUES (${placeholders})
                RETURNING *
            `;

            const result = await this.executeQuery<ITradingRate>(query, values);
            return result.rows[0] as any;
        } catch (error: any) {
            console.error('TradingRateRepository::create(): ', {
                message: error.message,
                stack: error.stack,
                tableName: this.tableName
            });
            throw new DatabaseError(`Failed to create trading rate: ${error.message}`);
        }
    }

    async update(id: string, entity: Partial<ITradingRate>): Promise<ITradingRate | null> {
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

            const result = await this.executeQuery<ITradingRate>(query, [...values, id]);
            return (result.rows[0] as any) || null;
        } catch (error: any) {
            console.error('TradingRateRepository::update(): ', {
                message: error.message,
                stack: error.stack,
                tableName: this.tableName
            });
            throw new DatabaseError(`Failed to update trading rate: ${error.message}`);
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
            console.error('TradingRateRepository::delete(): ', {
                message: error.message,
                stack: error.stack,
                tableName: this.tableName
            });
            throw new DatabaseError(`Failed to delete trading rate: ${error.message}`);
        }
    }

    async findActive(): Promise<ITradingRate | null> {
        try {
            const result = await this.executeQuery<ITradingRate>(
                `SELECT * FROM "${this.tableName}" WHERE is_active = true ORDER BY created_at DESC LIMIT 1`,
                []
            );
            return (result.rows[0] as any) || null;
        } catch (error: any) {
            console.error('TradingRateRepository::findActive(): ', {
                message: error.message,
                stack: error.stack,
                tableName: this.tableName
            });
            throw new DatabaseError(`Failed to find active trading rate: ${error.message}`);
        }
    }

    async findActiveByCryptoType(cryptoType: string): Promise<ITradingRate | null> {
        try {
            const result = await this.executeQuery<ITradingRate>(
                `SELECT * FROM "${this.tableName}" WHERE crypto_type = $1 AND is_active = true ORDER BY created_at DESC LIMIT 1`,
                [cryptoType]
            );
            return (result.rows[0] as any) || null;
        } catch (error: any) {
            console.error('TradingRateRepository::findActiveByCryptoType(): ', {
                message: error.message,
                stack: error.stack,
                tableName: this.tableName,
                cryptoType
            });
            throw new DatabaseError(`Failed to find active trading rate for crypto type: ${error.message}`);
        }
    }

    async executeRawQuery(query: string, params: any[]): Promise<any> {
        try {
            const result = await this.executeQuery(query, params);
            return result.rows;
        } catch (error: any) {
            console.error('TradingRateRepository::executeRawQuery(): ', {
                message: error.message,
                stack: error.stack,
                tableName: this.tableName
            });
            throw new DatabaseError(`Failed to execute raw query: ${error.message}`);
        }
    }

    async count(condition?: Partial<ITradingRate>): Promise<number> {
        try {
            let query = `SELECT COUNT(*) as count FROM "${this.tableName}"`;
            const params: any[] = [];

            if (condition && Object.keys(condition).length > 0) {
                const keys = Object.keys(condition);
                const values = Object.values(condition);
                const whereClause = keys.map((key, index) => `${key} = $${index + 1}`).join(' AND ');
                query += ` WHERE ${whereClause}`;
                params.push(...values);
            }

            const result = await this.executeQuery<{ count: string }>(query, params);
            return parseInt((result.rows[0] as any)?.count || '0', 10);
        } catch (error: any) {
            console.error('TradingRateRepository::count(): ', {
                message: error.message,
                stack: error.stack,
                tableName: this.tableName
            });
            throw new DatabaseError(`Failed to count trading rates: ${error.message}`);
        }
    }

    async bulkCreate(entities: ITradingRate[]): Promise<ITradingRate[]> {
        try {
            if (entities.length === 0) return [];

            const columns = Object.keys(entities[0]).filter(key => key !== '_id');
            const columnNames = columns.map(col => `"${col}"`).join(', ');
            
            const values: any[] = [];
            const placeholders: string[] = [];
            
            entities.forEach((entity, entityIndex) => {
                const rowPlaceholders = columns.map((_, colIndex) => {
                    const paramIndex = entityIndex * columns.length + colIndex + 1;
                    values.push(entity[columns[colIndex] as keyof ITradingRate]);
                    return `$${paramIndex}`;
                }).join(', ');
                placeholders.push(`(${rowPlaceholders})`);
            });

            const query = `
                INSERT INTO "${this.tableName}" (${columnNames})
                VALUES ${placeholders.join(', ')}
                RETURNING *
            `;

            const result = await this.executeQuery<ITradingRate>(query, values);
            return result.rows as any[];
        } catch (error: any) {
            console.error('TradingRateRepository::bulkCreate(): ', {
                message: error.message,
                stack: error.stack,
                tableName: this.tableName
            });
            throw new DatabaseError(`Failed to bulk create trading rates: ${error.message}`);
        }
    }

    async bulkUpdate(entities: Partial<ITradingRate>[]): Promise<ITradingRate[]> {
        // This is complex for trading rates, so we'll do individual updates
        const results: ITradingRate[] = [];
        for (const entity of entities) {
            if (entity._id) {
                const updated = await this.update(entity._id, entity);
                if (updated) results.push(updated);
            }
        }
        return results;
    }

    async bulkDelete(ids: string[]): Promise<number> {
        try {
            if (ids.length === 0) return 0;
            
            const placeholders = ids.map((_, index) => `$${index + 1}`).join(', ');
            const result = await this.executeQuery(
                `DELETE FROM "${this.tableName}" WHERE _id IN (${placeholders})`,
                ids
            );
            return result.rowCount || 0;
        } catch (error: any) {
            console.error('TradingRateRepository::bulkDelete(): ', {
                message: error.message,
                stack: error.stack,
                tableName: this.tableName
            });
            throw new DatabaseError(`Failed to bulk delete trading rates: ${error.message}`);
        }
    }
}

