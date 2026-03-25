import { inject, injectable } from 'inversify';
import { BaseRepository } from '../BaseRepository';
import { TransactionManager } from '../Abstractions/TransactionManager';
import { TYPES } from '../../../../Core/Types/Constants';
import { TableNames } from '../../../../Core/Application/Enums/TableNames';
import { ISystemAnnouncementDelivery } from '../../../../Core/Application/Interface/Entities/system-announcements/ISystemAnnouncementDelivery';
import { SystemAnnouncementDeliveryStatus } from '../../../../Core/Application/Enums/SystemAnnouncementDeliveryStatus';

@injectable()
export class SystemAnnouncementDeliveryRepository extends BaseRepository<ISystemAnnouncementDelivery> {
    constructor(@inject(TYPES.TransactionManager) transactionManager: TransactionManager) {
        super(transactionManager, TableNames.SYSTEM_ANNOUNCEMENT_DELIVERIES);
    }

    async findById(id: string): Promise<ISystemAnnouncementDelivery | null> {
        const result = await this.executeQuery<ISystemAnnouncementDelivery>(
            `SELECT * FROM "${this.tableName}" WHERE _id = $1`,
            [id]
        );
        return (result.rows[0] as any) || null;
    }

    async findAll(): Promise<ISystemAnnouncementDelivery[]> {
        const result = await this.executeQuery<ISystemAnnouncementDelivery>(
            `SELECT * FROM "${this.tableName}" ORDER BY created_at DESC`
        );
        return result.rows as any[];
    }

    async findByCondition(condition: Partial<ISystemAnnouncementDelivery>): Promise<ISystemAnnouncementDelivery[]> {
        const { whereClause, values } = this.buildWhereClause(condition);
        const result = await this.executeQuery<ISystemAnnouncementDelivery>(
            `SELECT * FROM "${this.tableName}" ${whereClause} ORDER BY created_at DESC`,
            values
        );
        return result.rows as any[];
    }

    async create(entity: ISystemAnnouncementDelivery): Promise<ISystemAnnouncementDelivery> {
        const { columns, values, placeholders } = this.getEntityColumns(entity);
        const result = await this.executeQuery<ISystemAnnouncementDelivery>(
            `INSERT INTO "${this.tableName}" (${columns.join(', ')})
             VALUES (${placeholders.join(', ')})
             RETURNING *`,
            values
        );
        return result.rows[0] as any;
    }

    async update(id: string, entity: Partial<ISystemAnnouncementDelivery>): Promise<ISystemAnnouncementDelivery | null> {
        const { setClause, values } = this.buildUpdateSet(entity);
        if (!setClause) throw new Error('No fields to update');
        const result = await this.executeQuery<ISystemAnnouncementDelivery>(
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

    async count(condition?: Partial<ISystemAnnouncementDelivery>): Promise<number> {
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

    async bulkUpdate(entities: Partial<ISystemAnnouncementDelivery>[]): Promise<ISystemAnnouncementDelivery[]> {
        if (entities.length === 0) return [];
        const { updateClause, values } = this.buildBulkUpdateClause(entities);
        const ids = entities.map(e => (e as any)._id);
        const result = await this.executeQuery<ISystemAnnouncementDelivery>(
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

    async bulkCreate(entities: ISystemAnnouncementDelivery[]): Promise<ISystemAnnouncementDelivery[]> {
        if (entities.length === 0) return [];
        const { valuesClause, values, columns } = this.buildBulkInsertClause(entities);
        const result = await this.executeQuery<ISystemAnnouncementDelivery>(
            `INSERT INTO "${this.tableName}" (${columns.join(', ')})
             VALUES ${valuesClause}
             RETURNING *`,
            values
        );
        return result.rows as any[];
    }

    async tryMarkProcessing(deliveryId: string): Promise<ISystemAnnouncementDelivery | null> {
        const result = await this.executeQuery<ISystemAnnouncementDelivery>(
            `UPDATE "${this.tableName}"
             SET status = $1, updated_at = NOW()
             WHERE _id = $2 AND status IN ($3, $4)
             RETURNING *`,
            [
                SystemAnnouncementDeliveryStatus.PROCESSING,
                deliveryId,
                SystemAnnouncementDeliveryStatus.PENDING,
                SystemAnnouncementDeliveryStatus.FAILED
            ]
        );
        return (result.rows[0] as any) || null;
    }

    async markSent(deliveryId: string): Promise<ISystemAnnouncementDelivery | null> {
        const result = await this.executeQuery<ISystemAnnouncementDelivery>(
            `UPDATE "${this.tableName}"
             SET status = $1, sent_at = NOW(), updated_at = NOW()
             WHERE _id = $2
             RETURNING *`,
            [SystemAnnouncementDeliveryStatus.SENT, deliveryId]
        );
        return (result.rows[0] as any) || null;
    }

    async markSkipped(deliveryId: string): Promise<ISystemAnnouncementDelivery | null> {
        const result = await this.executeQuery<ISystemAnnouncementDelivery>(
            `UPDATE "${this.tableName}"
             SET status = $1, sent_at = NOW(), updated_at = NOW()
             WHERE _id = $2
             RETURNING *`,
            [SystemAnnouncementDeliveryStatus.SKIPPED, deliveryId]
        );
        return (result.rows[0] as any) || null;
    }

    async markFailed(deliveryId: string, attempts: number, error: string): Promise<ISystemAnnouncementDelivery | null> {
        const result = await this.executeQuery<ISystemAnnouncementDelivery>(
            `UPDATE "${this.tableName}"
             SET status = $1, attempts = $2, last_error = $3, updated_at = NOW()
             WHERE _id = $4
             RETURNING *`,
            [SystemAnnouncementDeliveryStatus.FAILED, attempts, error?.slice(0, 4000) || null, deliveryId]
        );
        return (result.rows[0] as any) || null;
    }

    async countsForAnnouncement(announcementId: string): Promise<{ total: number; sent: number; failed: number; pending: number; processing: number }> {
        const result = await this.executeQuery<any>(
            `
            SELECT
              COUNT(*)::int as total,
              COUNT(*) FILTER (WHERE status IN ($2, $6))::int as sent,
              COUNT(*) FILTER (WHERE status = $3)::int as failed,
              COUNT(*) FILTER (WHERE status = $4)::int as pending,
              COUNT(*) FILTER (WHERE status = $5)::int as processing
            FROM "${this.tableName}"
            WHERE announcement_id = $1
            `,
            [
                announcementId,
                SystemAnnouncementDeliveryStatus.SENT,
                SystemAnnouncementDeliveryStatus.FAILED,
                SystemAnnouncementDeliveryStatus.PENDING,
                SystemAnnouncementDeliveryStatus.PROCESSING,
                SystemAnnouncementDeliveryStatus.SKIPPED
            ]
        );
        const row = (result.rows[0] as any) || {};
        return {
            total: row.total || 0,
            sent: row.sent || 0,
            failed: row.failed || 0,
            pending: row.pending || 0,
            processing: row.processing || 0
        };
    }
}

