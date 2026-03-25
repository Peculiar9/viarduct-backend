import { inject, injectable } from 'inversify';
import { BaseRepository } from '../BaseRepository';
import { TransactionManager } from '../Abstractions/TransactionManager';
import { TYPES } from '../../../../Core/Types/Constants';
import { TableNames } from '../../../../Core/Application/Enums/TableNames';
import { IChatMessage } from '../../../../Core/Application/Interface/Entities/chat/IChatMessage';

@injectable()
export class ChatMessageRepository extends BaseRepository<IChatMessage> {
    constructor(@inject(TYPES.TransactionManager) transactionManager: TransactionManager) {
        super(transactionManager, TableNames.CHAT_MESSAGES);
    }

    async findById(id: string): Promise<IChatMessage | null> {
        const result = await this.executeQuery<IChatMessage>(
            `SELECT * FROM "${this.tableName}" WHERE _id = $1`,
            [id]
        );
        return (result.rows[0] as any) || null;
    }

    async findAll(): Promise<IChatMessage[]> {
        const result = await this.executeQuery<IChatMessage>(
            `SELECT * FROM "${this.tableName}" ORDER BY created_at ASC`
        );
        return result.rows as any[];
    }

    async findByCondition(condition: Partial<IChatMessage>): Promise<IChatMessage[]> {
        const { whereClause, values } = this.buildWhereClause(condition);
        const result = await this.executeQuery<IChatMessage>(
            `SELECT * FROM "${this.tableName}" ${whereClause} ORDER BY created_at ASC`,
            values
        );
        return result.rows as any[];
    }

    async create(entity: IChatMessage): Promise<IChatMessage> {
        const { columns, values, placeholders } = this.getEntityColumns(entity);
        const query = `INSERT INTO "${this.tableName}" (${columns.join(', ')})
            VALUES (${placeholders.join(', ')})
            RETURNING *`;
        const result = await this.executeQuery<IChatMessage>(query, values);
        return result.rows[0] as any;
    }

    async update(id: string, entity: Partial<IChatMessage>): Promise<IChatMessage | null> {
        const { setClause, values } = this.buildUpdateSet(entity);
        if (!setClause) throw new Error('No fields to update');
        const query = `UPDATE "${this.tableName}"
            SET ${setClause}
            WHERE _id = $${values.length + 1}
            RETURNING *`;
        const result = await this.executeQuery<IChatMessage>(query, [...values, id]);
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

    async count(condition?: Partial<IChatMessage>): Promise<number> {
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

    async bulkCreate(entities: IChatMessage[]): Promise<IChatMessage[]> {
        if (entities.length === 0) return [];
        const { valuesClause, values, columns } = this.buildBulkInsertClause(entities);
        const query = `
            INSERT INTO "${this.tableName}" (${columns.join(', ')})
            VALUES ${valuesClause}
            RETURNING *
        `;
        const result = await this.executeQuery<IChatMessage>(query, values);
        return result.rows as any[];
    }

    async bulkUpdate(entities: Partial<IChatMessage>[]): Promise<IChatMessage[]> {
        if (entities.length === 0) return [];
        const { updateClause, values } = this.buildBulkUpdateClause(entities);
        const ids = entities.map(e => (e as any)._id);
        const query = `
            UPDATE "${this.tableName}"
            SET ${updateClause}
            WHERE _id = ANY($${values.length + 1}::uuid[])
            RETURNING *
        `;
        const result = await this.executeQuery<IChatMessage>(query, [...values, ids]);
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

    async listForChat(chatId: string, options: { limit: number; offset: number }): Promise<IChatMessage[]> {
        const result = await this.executeQuery<IChatMessage>(
            `SELECT * FROM "${this.tableName}"
             WHERE chat_id = $1
             ORDER BY created_at ASC
             LIMIT $2 OFFSET $3`,
            [chatId, options.limit, options.offset]
        );
        return result.rows as any[];
    }

    async countForChat(chatId: string): Promise<number> {
        const result = await this.executeQuery<{ count: string }>(
            `SELECT COUNT(*) as count FROM "${this.tableName}" WHERE chat_id = $1`,
            [chatId]
        );
        return parseInt((result.rows[0] as any)?.count || '0', 10);
    }
}

