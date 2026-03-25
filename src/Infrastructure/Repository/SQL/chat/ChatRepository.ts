import { inject, injectable } from 'inversify';
import { BaseRepository } from '../BaseRepository';
import { TransactionManager } from '../Abstractions/TransactionManager';
import { TYPES } from '../../../../Core/Types/Constants';
import { TableNames } from '../../../../Core/Application/Enums/TableNames';
import { IChat } from '../../../../Core/Application/Interface/Entities/chat/IChat';

@injectable()
export class ChatRepository extends BaseRepository<IChat> {
    constructor(@inject(TYPES.TransactionManager) transactionManager: TransactionManager) {
        super(transactionManager, TableNames.CHATS);
    }

    async findById(id: string): Promise<IChat | null> {
        const result = await this.executeQuery<IChat>(
            `SELECT * FROM "${this.tableName}" WHERE _id = $1`,
            [id]
        );
        return (result.rows[0] as any) || null;
    }

    async findAll(): Promise<IChat[]> {
        const result = await this.executeQuery<IChat>(
            `SELECT * FROM "${this.tableName}" ORDER BY COALESCE(last_message_at, created_at) DESC`
        );
        return result.rows as any[];
    }

    async findByCondition(condition: Partial<IChat>): Promise<IChat[]> {
        const { whereClause, values } = this.buildWhereClause(condition);
        const result = await this.executeQuery<IChat>(
            `SELECT * FROM "${this.tableName}" ${whereClause} ORDER BY COALESCE(last_message_at, created_at) DESC`,
            values
        );
        return result.rows as any[];
    }

    async create(entity: IChat): Promise<IChat> {
        const { columns, values, placeholders } = this.getEntityColumns(entity);
        const query = `INSERT INTO "${this.tableName}" (${columns.join(', ')})
            VALUES (${placeholders.join(', ')})
            RETURNING *`;
        const result = await this.executeQuery<IChat>(query, values);
        return result.rows[0] as any;
    }

    async update(id: string, entity: Partial<IChat>): Promise<IChat | null> {
        const { setClause, values } = this.buildUpdateSet(entity);
        if (!setClause) throw new Error('No fields to update');
        const query = `UPDATE "${this.tableName}"
            SET ${setClause}, updated_at = NOW()
            WHERE _id = $${values.length + 1}
            RETURNING *`;
        const result = await this.executeQuery<IChat>(query, [...values, id]);
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

    async count(condition?: Partial<IChat>): Promise<number> {
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

    async bulkCreate(entities: IChat[]): Promise<IChat[]> {
        if (entities.length === 0) return [];
        const { valuesClause, values, columns } = this.buildBulkInsertClause(entities);
        const query = `
            INSERT INTO "${this.tableName}" (${columns.join(', ')})
            VALUES ${valuesClause}
            RETURNING *
        `;
        const result = await this.executeQuery<IChat>(query, values);
        return result.rows as any[];
    }

    async bulkUpdate(entities: Partial<IChat>[]): Promise<IChat[]> {
        if (entities.length === 0) return [];
        const { updateClause, values } = this.buildBulkUpdateClause(entities);
        const ids = entities.map(e => (e as any)._id);
        const query = `
            UPDATE "${this.tableName}"
            SET ${updateClause}
            WHERE _id = ANY($${values.length + 1}::uuid[])
            RETURNING *
        `;
        const result = await this.executeQuery<IChat>(query, [...values, ids]);
        return result.rows as any[];
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

    async findForUser(userId: string, options: { status?: string; limit: number; offset: number }): Promise<IChat[]> {
        const conditions: string[] = ['user_id = $1'];
        const values: any[] = [userId];
        let paramIndex = 2;
        if (options.status) {
            conditions.push(`status = $${paramIndex}`);
            values.push(options.status);
            paramIndex++;
        }
        const query = `SELECT * FROM "${this.tableName}"
            WHERE ${conditions.join(' AND ')}
            ORDER BY COALESCE(last_message_at, created_at) DESC
            LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        values.push(options.limit, options.offset);
        const result = await this.executeQuery<IChat>(query, values);
        return result.rows as any[];
    }

    async countForUser(userId: string, options: { status?: string }): Promise<number> {
        const conditions: string[] = ['user_id = $1'];
        const values: any[] = [userId];
        let paramIndex = 2;
        if (options.status) {
            conditions.push(`status = $${paramIndex}`);
            values.push(options.status);
            paramIndex++;
        }
        const result = await this.executeQuery<{ count: string }>(
            `SELECT COUNT(*) as count FROM "${this.tableName}" WHERE ${conditions.join(' AND ')}`,
            values
        );
        return parseInt((result.rows[0] as any)?.count || '0', 10);
    }

    async findForAdmin(adminId: string, options: { status?: string; userId?: string; limit: number; offset: number }): Promise<IChat[]> {
        const conditions: string[] = ['admin_id = $1'];
        const values: any[] = [adminId];
        let paramIndex = 2;
        if (options.userId) {
            conditions.push(`user_id = $${paramIndex}`);
            values.push(options.userId);
            paramIndex++;
        }
        if (options.status) {
            conditions.push(`status = $${paramIndex}`);
            values.push(options.status);
            paramIndex++;
        }
        const query = `SELECT * FROM "${this.tableName}"
            WHERE ${conditions.join(' AND ')}
            ORDER BY COALESCE(last_message_at, created_at) DESC
            LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        values.push(options.limit, options.offset);
        const result = await this.executeQuery<IChat>(query, values);
        return result.rows as any[];
    }

    async countForAdmin(adminId: string, options: { status?: string; userId?: string }): Promise<number> {
        const conditions: string[] = ['admin_id = $1'];
        const values: any[] = [adminId];
        let paramIndex = 2;
        if (options.userId) {
            conditions.push(`user_id = $${paramIndex}`);
            values.push(options.userId);
            paramIndex++;
        }
        if (options.status) {
            conditions.push(`status = $${paramIndex}`);
            values.push(options.status);
            paramIndex++;
        }
        const result = await this.executeQuery<{ count: string }>(
            `SELECT COUNT(*) as count FROM "${this.tableName}" WHERE ${conditions.join(' AND ')}`,
            values
        );
        return parseInt((result.rows[0] as any)?.count || '0', 10);
    }
}

