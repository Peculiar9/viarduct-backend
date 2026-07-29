import { inject, injectable } from 'inversify';
import { BaseRepository } from '../BaseRepository';
import { TransactionManager } from '../Abstractions/TransactionManager';
import { IUserDeviceToken } from '../../../../Core/Application/Interface/Entities/notifications/IUserDeviceToken';
import { IUserDeviceTokenRepository } from '../../../../Core/Application/Interface/Repositories/IUserDeviceTokenRepository';
import { TableNames } from '../../../../Core/Application/Enums/TableNames';
import { TYPES } from '../../../../Core/Types/Constants';

@injectable()
export class UserDeviceTokenRepository
    extends BaseRepository<IUserDeviceToken>
    implements IUserDeviceTokenRepository
{
    constructor(@inject(TYPES.TransactionManager) transactionManager: TransactionManager) {
        super(transactionManager, TableNames.USER_DEVICE_TOKENS);
    }

    async create(entity: IUserDeviceToken): Promise<IUserDeviceToken> {
        const { columns, values, placeholders } = this.getEntityColumns(entity as Partial<IUserDeviceToken>);
        const query = `INSERT INTO "${this.tableName}" (${columns.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`;
        const result = await this.executeQuery<IUserDeviceToken>(query, values);
        return result.rows[0] as any;
    }

    async findById(id: string): Promise<IUserDeviceToken | null> {
        const result = await this.executeQuery<IUserDeviceToken>(
            `SELECT * FROM "${this.tableName}" WHERE _id = $1`,
            [id]
        );
        return (result.rows[0] as any) || null;
    }

    async findByToken(token: string): Promise<IUserDeviceToken | null> {
        const result = await this.executeQuery<IUserDeviceToken>(
            `SELECT * FROM "${this.tableName}" WHERE token = $1 LIMIT 1`,
            [token]
        );
        return (result.rows[0] as any) || null;
    }

    async findByUserAndDeviceId(userId: string, deviceId: string): Promise<IUserDeviceToken | null> {
        const result = await this.executeQuery<IUserDeviceToken>(
            `SELECT * FROM "${this.tableName}"
             WHERE user_id = $1 AND device_id = $2
             ORDER BY updated_at DESC
             LIMIT 1`,
            [userId, deviceId]
        );
        return (result.rows[0] as any) || null;
    }

    async findActiveByUserId(userId: string): Promise<IUserDeviceToken[]> {
        const result = await this.executeQuery<IUserDeviceToken>(
            `SELECT * FROM "${this.tableName}"
             WHERE user_id = $1 AND is_active = TRUE
             ORDER BY last_seen_at DESC NULLS LAST, updated_at DESC`,
            [userId]
        );
        return result.rows as any[];
    }

    async update(id: string, entity: Partial<IUserDeviceToken>): Promise<IUserDeviceToken | null> {
        const { setClause, values } = this.buildUpdateSet(entity);
        if (!setClause) return null;
        const query = `UPDATE "${this.tableName}" SET ${setClause}, updated_at = NOW() WHERE _id = $${values.length + 1} RETURNING *`;
        const result = await this.executeQuery<IUserDeviceToken>(query, [...values, id]);
        return (result.rows[0] as any) || null;
    }

    async deactivateByToken(token: string): Promise<IUserDeviceToken | null> {
        const result = await this.executeQuery<IUserDeviceToken>(
            `UPDATE "${this.tableName}"
             SET is_active = FALSE, updated_at = NOW()
             WHERE token = $1
             RETURNING *`,
            [token]
        );
        return (result.rows[0] as any) || null;
    }

    async deactivateById(id: string): Promise<IUserDeviceToken | null> {
        const result = await this.executeQuery<IUserDeviceToken>(
            `UPDATE "${this.tableName}"
             SET is_active = FALSE, updated_at = NOW()
             WHERE _id = $1
             RETURNING *`,
            [id]
        );
        return (result.rows[0] as any) || null;
    }

    async delete(id: string, _deletedBy?: string): Promise<boolean> {
        const result = await this.executeQuery(`DELETE FROM "${this.tableName}" WHERE _id = $1`, [id]);
        return (result.rowCount || 0) > 0;
    }

    async findAll(): Promise<IUserDeviceToken[]> {
        const result = await this.executeQuery<IUserDeviceToken>(
            `SELECT * FROM "${this.tableName}" ORDER BY created_at DESC`
        );
        return result.rows as any[];
    }

    async findByCondition(condition: Partial<IUserDeviceToken>): Promise<IUserDeviceToken[]> {
        const keys = Object.keys(condition);
        const values = Object.values(condition);
        if (keys.length === 0) return this.findAll();
        const whereClause = keys.map((key, index) => `"${key}" = $${index + 1}`).join(' AND ');
        const result = await this.executeQuery<IUserDeviceToken>(
            `SELECT * FROM "${this.tableName}" WHERE ${whereClause} ORDER BY created_at DESC`,
            values
        );
        return result.rows as any[];
    }

    async executeRawQuery(query: string, params: any[]): Promise<any> {
        return await this.executeQuery(query, params);
    }

    async count(condition?: Partial<IUserDeviceToken>): Promise<number> {
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

    async bulkCreate(entities: IUserDeviceToken[]): Promise<IUserDeviceToken[]> {
        if (entities.length === 0) return [];
        const { valuesClause, values, columns } = this.buildBulkInsertClause(entities);
        const columnNames = columns.map((col) => `"${col}"`).join(', ');
        const query = `INSERT INTO "${this.tableName}" (${columnNames}) VALUES ${valuesClause} RETURNING *`;
        const result = await this.executeQuery<IUserDeviceToken>(query, values);
        return result.rows as any[];
    }

    async bulkUpdate(entities: Partial<IUserDeviceToken>[]): Promise<IUserDeviceToken[]> {
        if (entities.length === 0) return [];
        const { updateClause, values } = this.buildBulkUpdateClause(entities);
        const ids = entities.map((e) => (e as any)._id).filter(Boolean);
        const query = `UPDATE "${this.tableName}" SET ${updateClause}, updated_at = NOW() WHERE _id IN (${ids.map((_, i) => `$${values.length + i + 1}`).join(', ')}) RETURNING *`;
        const result = await this.executeQuery<IUserDeviceToken>(query, [...values, ...ids]);
        return result.rows as any[];
    }

    async bulkDelete(ids: string[]): Promise<number> {
        if (ids.length === 0) return 0;
        const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');
        const result = await this.executeQuery(`DELETE FROM "${this.tableName}" WHERE _id IN (${placeholders})`, ids);
        return result.rowCount || 0;
    }
}
