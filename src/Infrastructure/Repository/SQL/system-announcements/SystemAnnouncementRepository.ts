import { inject, injectable } from 'inversify';
import { BaseRepository } from '../BaseRepository';
import { TransactionManager } from '../Abstractions/TransactionManager';
import { TYPES } from '../../../../Core/Types/Constants';
import { TableNames } from '../../../../Core/Application/Enums/TableNames';
import { ISystemAnnouncement } from '../../../../Core/Application/Interface/Entities/system-announcements/ISystemAnnouncement';

@injectable()
export class SystemAnnouncementRepository extends BaseRepository<ISystemAnnouncement> {
    constructor(@inject(TYPES.TransactionManager) transactionManager: TransactionManager) {
        super(transactionManager, TableNames.SYSTEM_ANNOUNCEMENTS);
    }

    async findById(id: string): Promise<ISystemAnnouncement | null> {
        const result = await this.executeQuery<ISystemAnnouncement>(
            `SELECT * FROM "${this.tableName}" WHERE _id = $1`,
            [id]
        );
        return (result.rows[0] as any) || null;
    }

    async findAll(): Promise<ISystemAnnouncement[]> {
        const result = await this.executeQuery<ISystemAnnouncement>(
            `SELECT * FROM "${this.tableName}" ORDER BY created_at DESC`
        );
        return result.rows as any[];
    }

    async findByCondition(condition: Partial<ISystemAnnouncement>): Promise<ISystemAnnouncement[]> {
        const { whereClause, values } = this.buildWhereClause(condition);
        const result = await this.executeQuery<ISystemAnnouncement>(
            `SELECT * FROM "${this.tableName}" ${whereClause} ORDER BY created_at DESC`,
            values
        );
        return result.rows as any[];
    }

    async findForAdmin(options: { status?: string; limit: number; offset: number }): Promise<ISystemAnnouncement[]> {
        const conditions: string[] = [];
        const values: any[] = [];
        let idx = 1;

        if (options.status) {
            conditions.push(`status = $${idx}`);
            values.push(options.status);
            idx++;
        }

        const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
        const query = `
            SELECT *
            FROM "${this.tableName}"
            ${where}
            ORDER BY created_at DESC
            LIMIT $${idx} OFFSET $${idx + 1}
        `;
        values.push(options.limit, options.offset);

        const result = await this.executeQuery<ISystemAnnouncement>(query, values);
        return result.rows as any[];
    }

    async countForAdmin(options: { status?: string }): Promise<number> {
        const conditions: string[] = [];
        const values: any[] = [];
        let idx = 1;

        if (options.status) {
            conditions.push(`status = $${idx}`);
            values.push(options.status);
            idx++;
        }

        const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
        const result = await this.executeQuery<{ count: string }>(
            `SELECT COUNT(*) as count FROM "${this.tableName}" ${where}`,
            values
        );
        return parseInt((result.rows[0] as any)?.count || '0', 10);
    }

    async create(entity: ISystemAnnouncement): Promise<ISystemAnnouncement> {
        const { columns, values, placeholders } = this.getEntityColumns(entity);
        const result = await this.executeQuery<ISystemAnnouncement>(
            `INSERT INTO "${this.tableName}" (${columns.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`,
            values
        );
        return result.rows[0] as any;
    }

    async update(id: string, entity: Partial<ISystemAnnouncement>): Promise<ISystemAnnouncement | null> {
        const { setClause, values } = this.buildUpdateSet(entity);
        if (!setClause) throw new Error('No fields to update');
        const result = await this.executeQuery<ISystemAnnouncement>(
            `UPDATE "${this.tableName}"
             SET ${setClause}, updated_at = NOW()
             WHERE _id = $${values.length + 1}
             RETURNING *`,
            [...values, id]
        );
        return (result.rows[0] as any) || null;
    }

    async delete(id: string): Promise<boolean> {
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

    async count(condition?: Partial<ISystemAnnouncement>): Promise<number> {
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

    async bulkCreate(entities: ISystemAnnouncement[]): Promise<ISystemAnnouncement[]> {
        if (entities.length === 0) return [];
        const { valuesClause, values, columns } = this.buildBulkInsertClause(entities);
        const result = await this.executeQuery<ISystemAnnouncement>(
            `INSERT INTO "${this.tableName}" (${columns.join(', ')})
             VALUES ${valuesClause}
             RETURNING *`,
            values
        );
        return result.rows as any[];
    }

    async bulkUpdate(entities: Partial<ISystemAnnouncement>[]): Promise<ISystemAnnouncement[]> {
        if (entities.length === 0) return [];
        const { updateClause, values } = this.buildBulkUpdateClause(entities);
        const ids = entities.map(e => (e as any)._id);
        const result = await this.executeQuery<ISystemAnnouncement>(
            `UPDATE "${this.tableName}"
             SET ${updateClause}
             WHERE _id = ANY($${values.length + 1}::uuid[])
             RETURNING *`,
            [...values, ids]
        );
        return result.rows as any[];
    }

    async bulkDelete(ids: string[]): Promise<number> {
        if (ids.length === 0) return 0;
        const result = await this.executeQuery(
            `DELETE FROM "${this.tableName}" WHERE _id = ANY($1::uuid[]) RETURNING _id`,
            [ids]
        );
        return result.rowCount || 0;
    }

    async incrementCounters(input: { id: string; sentDelta?: number; failedDelta?: number }): Promise<ISystemAnnouncement | null> {
        const sentDelta = Number(input.sentDelta ?? 0);
        const failedDelta = Number(input.failedDelta ?? 0);
        const result = await this.executeQuery<ISystemAnnouncement>(
            `UPDATE "${this.tableName}"
             SET sent_count = sent_count + $1,
                 failed_count = failed_count + $2,
                 updated_at = NOW()
             WHERE _id = $3
             RETURNING *`,
            [sentDelta, failedDelta, input.id]
        );
        return (result.rows[0] as any) || null;
    }

    async setTotals(input: { id: string; total: number }): Promise<ISystemAnnouncement | null> {
        const result = await this.executeQuery<ISystemAnnouncement>(
            `UPDATE "${this.tableName}"
             SET total_recipients = $1, updated_at = NOW()
             WHERE _id = $2
             RETURNING *`,
            [Number(input.total || 0), input.id]
        );
        return (result.rows[0] as any) || null;
    }
}

