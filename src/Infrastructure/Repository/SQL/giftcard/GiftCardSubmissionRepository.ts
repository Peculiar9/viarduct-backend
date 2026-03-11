import { inject, injectable } from 'inversify';
import { BaseRepository } from '../BaseRepository';
import { TransactionManager } from '../Abstractions/TransactionManager';
import { IGiftCardSubmission } from '../../../../Core/Application/Interface/Entities/giftcard/IGiftCardSubmission';
import {
    IGiftCardSubmissionRepository,
    GiftCardSubmissionFiltersForUser,
    GiftCardSubmissionFiltersForAdmin
} from '../../../../Core/Application/Interface/Repositories/IGiftCardSubmissionRepository';
import { TableNames } from '../../../../Core/Application/Enums/TableNames';
import { TYPES } from '../../../../Core/Types/Constants';

@injectable()
export class GiftCardSubmissionRepository extends BaseRepository<IGiftCardSubmission> implements IGiftCardSubmissionRepository {
    constructor(
        @inject(TYPES.TransactionManager) transactionManager: TransactionManager
    ) {
        super(transactionManager, TableNames.GIFT_CARD_SUBMISSIONS);
    }

    async create(entity: IGiftCardSubmission): Promise<IGiftCardSubmission> {
        const imageUrls = entity.image_urls ?? [];
        const data = {
            ...entity,
            image_urls: Array.isArray(imageUrls) ? JSON.stringify(imageUrls) : imageUrls
        } as Partial<IGiftCardSubmission> & { image_urls: string };
        const { columns, values, placeholders } = this.getEntityColumns(data);
        const query = `INSERT INTO "${this.tableName}" (${columns.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`;
        const result = await this.executeQuery<IGiftCardSubmission>(query, values);
        const row = result.rows[0] as any;
        if (row && row.image_urls && typeof row.image_urls !== 'object') {
            row.image_urls = typeof row.image_urls === 'string' ? JSON.parse(row.image_urls) : row.image_urls;
        }
        return row;
    }

    async findById(id: string): Promise<IGiftCardSubmission | null> {
        const result = await this.executeQuery<IGiftCardSubmission>(
            `SELECT * FROM "${this.tableName}" WHERE _id = $1`,
            [id]
        );
        const row = result.rows[0] as any;
        if (!row) return null;
        if (row.image_urls && typeof row.image_urls !== 'object') {
            row.image_urls = typeof row.image_urls === 'string' ? JSON.parse(row.image_urls) : row.image_urls;
        }
        return row;
    }

    async findByUserId(userId: string, limit: number = 50, offset: number = 0): Promise<IGiftCardSubmission[]> {
        const result = await this.executeQuery<IGiftCardSubmission>(
            `SELECT * FROM "${this.tableName}" WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
            [userId, limit, offset]
        );
        return (result.rows as any[]).map(row => {
            if (row.image_urls && typeof row.image_urls !== 'object') {
                row.image_urls = typeof row.image_urls === 'string' ? JSON.parse(row.image_urls) : row.image_urls;
            }
            return row;
        });
    }

    async findByUserIdWithFilters(
        userId: string,
        filters: GiftCardSubmissionFiltersForUser,
        limit: number = 50,
        offset: number = 0
    ): Promise<IGiftCardSubmission[]> {
        const conditions: string[] = ['user_id = $1'];
        const values: any[] = [userId];
        let paramIndex = 2;
        if (filters.card_type != null && filters.card_type !== '') {
            conditions.push(`card_type = $${paramIndex}`);
            values.push(filters.card_type);
            paramIndex++;
        }
        if (filters.amount_ngn != null) {
            conditions.push(`amount_ngn = $${paramIndex}`);
            values.push(filters.amount_ngn);
            paramIndex++;
        }
        if (filters.status != null && filters.status !== '') {
            conditions.push(`status = $${paramIndex}`);
            values.push(filters.status);
            paramIndex++;
        }
        if (filters.date_from) {
            conditions.push(`created_at >= $${paramIndex}::timestamptz`);
            values.push(filters.date_from);
            paramIndex++;
        }
        if (filters.date_to) {
            conditions.push(`created_at <= $${paramIndex}::timestamptz`);
            values.push(filters.date_to);
            paramIndex++;
        }
        values.push(limit, offset);
        const whereClause = conditions.join(' AND ');
        const result = await this.executeQuery<IGiftCardSubmission>(
            `SELECT * FROM "${this.tableName}" WHERE ${whereClause} ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
            values
        );
        return this.mapRows(result.rows as any[]);
    }

    async countByUserIdWithFilters(userId: string, filters: GiftCardSubmissionFiltersForUser): Promise<number> {
        const conditions: string[] = ['user_id = $1'];
        const values: any[] = [userId];
        let paramIndex = 2;
        if (filters.card_type != null && filters.card_type !== '') {
            conditions.push(`card_type = $${paramIndex}`);
            values.push(filters.card_type);
            paramIndex++;
        }
        if (filters.amount_ngn != null) {
            conditions.push(`amount_ngn = $${paramIndex}`);
            values.push(filters.amount_ngn);
            paramIndex++;
        }
        if (filters.status != null && filters.status !== '') {
            conditions.push(`status = $${paramIndex}`);
            values.push(filters.status);
            paramIndex++;
        }
        if (filters.date_from) {
            conditions.push(`created_at >= $${paramIndex}::timestamptz`);
            values.push(filters.date_from);
            paramIndex++;
        }
        if (filters.date_to) {
            conditions.push(`created_at <= $${paramIndex}::timestamptz`);
            values.push(filters.date_to);
        }
        const whereClause = conditions.join(' AND ');
        const result = await this.executeQuery<{ count: string }>(
            `SELECT COUNT(*) as count FROM "${this.tableName}" WHERE ${whereClause}`,
            values
        );
        return parseInt((result.rows[0] as any)?.count || '0', 10);
    }

    private buildAdminFilterConditions(filters: GiftCardSubmissionFiltersForAdmin): { conditions: string[]; values: any[] } {
        const conditions: string[] = [];
        const values: any[] = [];
        let paramIndex = 1;
        if (filters.status != null && filters.status !== '') {
            conditions.push(`status = $${paramIndex}`);
            values.push(filters.status);
            paramIndex++;
        }
        if (filters.user_id != null && filters.user_id !== '') {
            conditions.push(`user_id = $${paramIndex}`);
            values.push(filters.user_id);
            paramIndex++;
        }
        if (filters.card_type != null && filters.card_type !== '') {
            conditions.push(`card_type = $${paramIndex}`);
            values.push(filters.card_type);
            paramIndex++;
        }
        if (filters.amount_ngn != null) {
            conditions.push(`amount_ngn = $${paramIndex}`);
            values.push(filters.amount_ngn);
            paramIndex++;
        }
        if (filters.date_from) {
            conditions.push(`created_at >= $${paramIndex}::timestamptz`);
            values.push(filters.date_from);
            paramIndex++;
        }
        if (filters.date_to) {
            conditions.push(`created_at <= $${paramIndex}::timestamptz`);
            values.push(filters.date_to);
            paramIndex++;
        }
        if (filters.transaction_id != null && filters.transaction_id !== '') {
            conditions.push(`transaction_id = $${paramIndex}`);
            values.push(filters.transaction_id);
            paramIndex++;
        }
        if (filters.validated_by != null && filters.validated_by !== '') {
            conditions.push(`validated_by = $${paramIndex}`);
            values.push(filters.validated_by);
        }
        return { conditions, values };
    }

    async findWithFilters(
        filters: GiftCardSubmissionFiltersForAdmin,
        limit: number = 50,
        offset: number = 0
    ): Promise<IGiftCardSubmission[]> {
        const { conditions, values } = this.buildAdminFilterConditions(filters);
        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
        const params = [...values, limit, offset];
        const limitParam = values.length + 1;
        const offsetParam = values.length + 2;
        const result = await this.executeQuery<IGiftCardSubmission>(
            `SELECT * FROM "${this.tableName}" ${whereClause} ORDER BY created_at DESC LIMIT $${limitParam} OFFSET $${offsetParam}`,
            params
        );
        return this.mapRows(result.rows as any[]);
    }

    async countWithFilters(filters: GiftCardSubmissionFiltersForAdmin): Promise<number> {
        const { conditions, values } = this.buildAdminFilterConditions(filters);
        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
        const result = await this.executeQuery<{ count: string }>(
            `SELECT COUNT(*) as count FROM "${this.tableName}" ${whereClause}`,
            values
        );
        return parseInt((result.rows[0] as any)?.count || '0', 10);
    }

    private mapRows(rows: any[]): IGiftCardSubmission[] {
        return rows.map(row => {
            if (row.image_urls && typeof row.image_urls !== 'object') {
                row.image_urls = typeof row.image_urls === 'string' ? JSON.parse(row.image_urls) : row.image_urls;
            }
            return row;
        });
    }

    async findPending(limit: number = 50, offset: number = 0): Promise<IGiftCardSubmission[]> {
        const result = await this.executeQuery<IGiftCardSubmission>(
            `SELECT * FROM "${this.tableName}" WHERE status = 'pending_validation' ORDER BY created_at ASC LIMIT $1 OFFSET $2`,
            [limit, offset]
        );
        return this.mapRows(result.rows as any[]);
    }

    async update(id: string, entity: Partial<IGiftCardSubmission>): Promise<IGiftCardSubmission | null> {
        const { setClause, values } = this.buildUpdateSet(entity);
        if (!setClause) return this.findById(id);
        const query = `UPDATE "${this.tableName}" SET ${setClause}, updated_at = NOW() WHERE _id = $${values.length + 1} RETURNING *`;
        const result = await this.executeQuery<IGiftCardSubmission>(query, [...values, id]);
        const row = result.rows[0] as any;
        if (!row) return null;
        if (row.image_urls && typeof row.image_urls !== 'object') {
            row.image_urls = typeof row.image_urls === 'string' ? JSON.parse(row.image_urls) : row.image_urls;
        }
        return row;
    }

    async findAll(): Promise<IGiftCardSubmission[]> {
        const result = await this.executeQuery<IGiftCardSubmission>(
            `SELECT * FROM "${this.tableName}" ORDER BY created_at DESC`
        );
        return (result.rows as any[]).map(row => {
            if (row.image_urls && typeof row.image_urls !== 'object') {
                row.image_urls = typeof row.image_urls === 'string' ? JSON.parse(row.image_urls) : row.image_urls;
            }
            return row;
        });
    }

    async findByCondition(condition: Partial<IGiftCardSubmission>): Promise<IGiftCardSubmission[]> {
        const keys = Object.keys(condition);
        const values = Object.values(condition);
        if (keys.length === 0) return this.findAll();
        const whereClause = keys.map((key, index) => `"${key}" = $${index + 1}`).join(' AND ');
        const result = await this.executeQuery<IGiftCardSubmission>(
            `SELECT * FROM "${this.tableName}" WHERE ${whereClause} ORDER BY created_at DESC`,
            values
        );
        return (result.rows as any[]).map(row => {
            if (row.image_urls && typeof row.image_urls !== 'object') {
                row.image_urls = typeof row.image_urls === 'string' ? JSON.parse(row.image_urls) : row.image_urls;
            }
            return row;
        });
    }

    async delete(id: string, _deletedBy?: string): Promise<boolean> {
        const result = await this.executeQuery(`DELETE FROM "${this.tableName}" WHERE _id = $1`, [id]);
        return (result.rowCount || 0) > 0;
    }

    async executeRawQuery(query: string, params: any[]): Promise<any> {
        return await this.executeQuery(query, params);
    }

    async count(condition?: Partial<IGiftCardSubmission>): Promise<number> {
        let query = `SELECT COUNT(*) as count FROM "${this.tableName}"`;
        const params: any[] = [];
        if (condition) {
            const { whereClause, values } = this.buildWhereClause(condition);
            query += ` ${whereClause}`;
            params.push(...values);
        }
        const result = await this.executeQuery<{ count: string }>(query, params);
        return parseInt((result.rows[0] as any)?.count || '0', 10);
    }

    async bulkCreate(entities: IGiftCardSubmission[]): Promise<IGiftCardSubmission[]> {
        if (entities.length === 0) return [];
        const { valuesClause, values, columns } = this.buildBulkInsertClause(entities);
        const columnNames = columns.map(col => `"${col}"`).join(', ');
        const query = `INSERT INTO "${this.tableName}" (${columnNames}) VALUES ${valuesClause} RETURNING *`;
        const result = await this.executeQuery<IGiftCardSubmission>(query, values);
        return result.rows as any[];
    }

    async bulkUpdate(entities: Partial<IGiftCardSubmission>[]): Promise<IGiftCardSubmission[]> {
        if (entities.length === 0) return [];
        const { updateClause, values } = this.buildBulkUpdateClause(entities);
        const ids = entities.map(e => (e as any)._id).filter(Boolean);
        const query = `UPDATE "${this.tableName}" SET ${updateClause}, updated_at = NOW() WHERE _id IN (${ids.map((_, i) => `$${values.length + i + 1}`).join(', ')}) RETURNING *`;
        const result = await this.executeQuery<IGiftCardSubmission>(query, [...values, ...ids]);
        return result.rows as any[];
    }

    async bulkDelete(ids: string[]): Promise<number> {
        if (ids.length === 0) return 0;
        const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');
        const result = await this.executeQuery(`DELETE FROM "${this.tableName}" WHERE _id IN (${placeholders})`, ids);
        return result.rowCount || 0;
    }
}
