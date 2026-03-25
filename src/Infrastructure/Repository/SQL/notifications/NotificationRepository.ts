import { inject, injectable } from 'inversify';
import { BaseRepository } from '../BaseRepository';
import { TransactionManager } from '../Abstractions/TransactionManager';
import { TableNames } from '../../../../Core/Application/Enums/TableNames';
import { TYPES } from '../../../../Core/Types/Constants';
import { INotification } from '../../../../Core/Application/Interface/Entities/notifications/INotification';
import { DatabaseError } from '../../../../Core/Application/Error/AppError';

@injectable()
export class NotificationRepository extends BaseRepository<INotification> {
    constructor(@inject(TYPES.TransactionManager) transactionManager: TransactionManager) {
        super(transactionManager, TableNames.NOTIFICATIONS);
    }

    async findById(id: string): Promise<INotification | null> {
        const result = await this.executeQuery<INotification>(
            `SELECT * FROM "${this.tableName}" WHERE _id = $1`,
            [id]
        );
        return (result.rows[0] as any) || null;
    }

    async findAll(): Promise<INotification[]> {
        const result = await this.executeQuery<INotification>(
            `SELECT * FROM "${this.tableName}" ORDER BY created_at DESC`
        );
        return result.rows as any[];
    }

    async findByCondition(condition: Partial<INotification>): Promise<INotification[]> {
        const { whereClause, values } = this.buildWhereClause(condition);
        const result = await this.executeQuery<INotification>(
            `SELECT * FROM "${this.tableName}" ${whereClause} ORDER BY created_at DESC`,
            values
        );
        return result.rows as any[];
    }

    async create(entity: INotification): Promise<INotification> {
        const { columns, values, placeholders } = this.getEntityColumns(entity);
        const query = `INSERT INTO "${this.tableName}" (${columns.join(', ')})
            VALUES (${placeholders.join(', ')})
            RETURNING *`;
        const result = await this.executeQuery<INotification>(query, values);
        return result.rows[0] as any;
    }

    async update(id: string, entity: Partial<INotification>): Promise<INotification | null> {
        const { setClause, values } = this.buildUpdateSet(entity);
        if (!setClause) throw new Error('No fields to update');
        const query = `UPDATE "${this.tableName}"
            SET ${setClause}, updated_at = NOW()
            WHERE _id = $${values.length + 1}
            RETURNING *`;
        const result = await this.executeQuery<INotification>(query, [...values, id]);
        return (result.rows[0] as any) || null;
    }

    async delete(id: string, deletedBy?: string): Promise<boolean> {
        const result = await this.executeQuery(
            `DELETE FROM "${this.tableName}" WHERE _id = $1`,
            [id]
        );
        return (result.rowCount || 0) > 0;
    }

    async executeRawQuery(query: string, params: any[]): Promise<any> {
        const result = await this.executeQuery(query, params);
        return result.rows;
    }

    async count(condition?: Partial<INotification>): Promise<number> {
        if (condition) {
            const { whereClause, values } = this.buildWhereClause(condition);
            const result = await this.executeQuery<{ count: string }>(
                `SELECT COUNT(*) as count FROM "${this.tableName}" ${whereClause}`,
                values
            );
            return parseInt((result.rows[0] as any)?.count || '0', 10);
        }
        const result = await this.executeQuery<{ count: string }>(
            `SELECT COUNT(*) as count FROM "${this.tableName}"`
        );
        return parseInt((result.rows[0] as any)?.count || '0', 10);
    }

    async bulkCreate(entities: INotification[]): Promise<INotification[]> {
        if (entities.length === 0) return [];
        const { valuesClause, values, columns } = this.buildBulkInsertClause(entities);
        const query = `
            INSERT INTO "${this.tableName}" (${columns.join(', ')})
            VALUES ${valuesClause}
            RETURNING *
        `;
        const result = await this.executeQuery<INotification>(query, values);
        return result.rows as any[];
    }

    async bulkUpdate(entities: Partial<INotification>[]): Promise<INotification[]> {
        if (entities.length === 0) return [];
        const { updateClause, values } = this.buildBulkUpdateClause(entities);
        const ids = entities.map(e => (e as any)._id);
        const query = `
            UPDATE "${this.tableName}"
            SET ${updateClause}
            WHERE _id = ANY($${values.length + 1}::uuid[])
            RETURNING *
        `;
        try {
            const result = await this.executeQuery<INotification>(query, [...values, ids]);
            return result.rows as any[];
        } catch (error: any) {
            throw new DatabaseError(`Bulk notification update failed: ${error.message}`);
        }
    }

    async bulkDelete(ids: string[]): Promise<number> {
        if (ids.length === 0) return 0;
        const query = `
            DELETE FROM "${this.tableName}"
            WHERE _id = ANY($1::uuid[])
            RETURNING _id
        `;
        const result = await this.executeQuery(query, [ids]);
        return result.rowCount || 0;
    }

    async findForUser(
        userId: string,
        options: { unreadOnly?: boolean; title?: string; type?: string; limit: number; offset: number }
    ): Promise<INotification[]> {
        const { unreadOnly, limit, offset, title, type } = options;
        const conditions: string[] = ['user_id = $1'];
        const values: any[] = [userId];
        let paramIndex = 2;

        if (unreadOnly) {
            conditions.push(`has_been_read_by_user = false`);
        }

        if (type) {
            conditions.push(`type = $${paramIndex}`);
            values.push(type);
            paramIndex++;
        }

        if (title && String(title).trim() !== '') {
            conditions.push(`title ILIKE $${paramIndex}`);
            values.push(`%${String(title).trim()}%`);
            paramIndex++;
        }

        const query = `SELECT * FROM "${this.tableName}"
            WHERE ${conditions.join(' AND ')}
            ORDER BY created_at DESC
            LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        values.push(limit, offset);
        const result = await this.executeQuery<INotification>(query, values);
        return result.rows as any[];
    }

    async countForUser(userId: string, options: { unreadOnly?: boolean; title?: string; type?: string }): Promise<number> {
        const conditions: string[] = ['user_id = $1'];
        const values: any[] = [userId];
        let paramIndex = 2;

        if (options.unreadOnly) {
            conditions.push(`has_been_read_by_user = false`);
        }

        if (options.type) {
            conditions.push(`type = $${paramIndex}`);
            values.push(options.type);
            paramIndex++;
        }

        if (options.title && String(options.title).trim() !== '') {
            conditions.push(`title ILIKE $${paramIndex}`);
            values.push(`%${String(options.title).trim()}%`);
            paramIndex++;
        }

        const query = `SELECT COUNT(*) as count FROM "${this.tableName}" WHERE ${conditions.join(' AND ')}`;
        const result = await this.executeQuery<{ count: string }>(query, values);
        return parseInt((result.rows[0] as any)?.count || '0', 10);
    }

    async findForAdmin(
        options: { userId?: string; unreadOnly?: boolean; title?: string; type?: string; limit: number; offset: number }
    ): Promise<INotification[]> {
        const { userId, unreadOnly, limit, offset, title, type } = options;
        const conditions: string[] = [];
        const values: any[] = [];
        let paramIndex = 1;

        if (userId) {
            conditions.push(`user_id = $${paramIndex}`);
            values.push(userId);
            paramIndex++;
        }
        if (unreadOnly) {
            conditions.push(`has_been_read_by_admin = false`);
        }

        if (type) {
            conditions.push(`type = $${paramIndex}`);
            values.push(type);
            paramIndex++;
        }

        if (title && String(title).trim() !== '') {
            conditions.push(`title ILIKE $${paramIndex}`);
            values.push(`%${String(title).trim()}%`);
            paramIndex++;
        }

        let query = `SELECT * FROM "${this.tableName}"`;
        if (conditions.length > 0) query += ` WHERE ${conditions.join(' AND ')}`;
        query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        values.push(limit, offset);

        const result = await this.executeQuery<INotification>(query, values);
        return result.rows as any[];
    }

    async countForAdmin(options: { userId?: string; unreadOnly?: boolean; title?: string; type?: string }): Promise<number> {
        const conditions: string[] = [];
        const values: any[] = [];
        let paramIndex = 1;

        if (options.userId) {
            conditions.push(`user_id = $${paramIndex}`);
            values.push(options.userId);
            paramIndex++;
        }
        if (options.unreadOnly) {
            conditions.push(`has_been_read_by_admin = false`);
        }

        if (options.type) {
            conditions.push(`type = $${paramIndex}`);
            values.push(options.type);
            paramIndex++;
        }

        if (options.title && String(options.title).trim() !== '') {
            conditions.push(`title ILIKE $${paramIndex}`);
            values.push(`%${String(options.title).trim()}%`);
            paramIndex++;
        }

        let query = `SELECT COUNT(*) as count FROM "${this.tableName}"`;
        if (conditions.length > 0) query += ` WHERE ${conditions.join(' AND ')}`;

        const result = await this.executeQuery<{ count: string }>(query, values);
        return parseInt((result.rows[0] as any)?.count || '0', 10);
    }

    async markReadByUser(userId: string, notificationId: string): Promise<INotification | null> {
        const result = await this.executeQuery<INotification>(
            `UPDATE "${this.tableName}"
             SET has_been_read_by_user = true, updated_at = NOW()
             WHERE _id = $1 AND user_id = $2
             RETURNING *`,
            [notificationId, userId]
        );
        return (result.rows[0] as any) || null;
    }

    async markReadByUserMany(userId: string, ids?: string[]): Promise<number> {
        if (ids && ids.length > 0) {
            const result = await this.executeQuery(
                `UPDATE "${this.tableName}"
                 SET has_been_read_by_user = true, updated_at = NOW()
                 WHERE user_id = $1 AND _id = ANY($2::uuid[])`,
                [userId, ids]
            );
            return result.rowCount || 0;
        }

        const result = await this.executeQuery(
            `UPDATE "${this.tableName}"
             SET has_been_read_by_user = true, updated_at = NOW()
             WHERE user_id = $1`,
            [userId]
        );
        return result.rowCount || 0;
    }

    async markReadByAdmin(notificationId: string): Promise<INotification | null> {
        const result = await this.executeQuery<INotification>(
            `UPDATE "${this.tableName}"
             SET has_been_read_by_admin = true, updated_at = NOW()
             WHERE _id = $1
             RETURNING *`,
            [notificationId]
        );
        return (result.rows[0] as any) || null;
    }

    async markReadByAdminMany(ids?: string[], userId?: string): Promise<number> {
        const conditions: string[] = [];
        const values: any[] = [];
        let paramIndex = 1;

        if (ids && ids.length > 0) {
            conditions.push(`_id = ANY($${paramIndex}::uuid[])`);
            values.push(ids);
            paramIndex++;
        }

        if (userId) {
            conditions.push(`user_id = $${paramIndex}`);
            values.push(userId);
            paramIndex++;
        }

        let query = `UPDATE "${this.tableName}"
            SET has_been_read_by_admin = true, updated_at = NOW()`;
        if (conditions.length > 0) {
            query += ` WHERE ${conditions.join(' AND ')}`;
        }

        const result = await this.executeQuery(query, values);
        return result.rowCount || 0;
    }
}

