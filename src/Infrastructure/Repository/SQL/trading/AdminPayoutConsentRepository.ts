import { inject, injectable } from 'inversify';
import { BaseRepository } from '../BaseRepository';
import { TransactionManager } from '../Abstractions/TransactionManager';
import {
    AdminPayoutConsentStatus,
    IAdminPayoutConsent
} from '../../../../Core/Application/Interface/Entities/trading/IAdminPayoutConsent';
import { IAdminPayoutConsentRepository } from '../../../../Core/Application/Interface/Repositories/IAdminPayoutConsentRepository';
import { TableNames } from '../../../../Core/Application/Enums/TableNames';
import { TYPES } from '../../../../Core/Types/Constants';

@injectable()
export class AdminPayoutConsentRepository
    extends BaseRepository<IAdminPayoutConsent>
    implements IAdminPayoutConsentRepository
{
    constructor(@inject(TYPES.TransactionManager) transactionManager: TransactionManager) {
        super(transactionManager, TableNames.ADMIN_PAYOUT_CONSENTS);
    }

    async create(entity: IAdminPayoutConsent): Promise<IAdminPayoutConsent> {
        const { columns, values, placeholders } = this.getEntityColumns(entity as Partial<IAdminPayoutConsent>);
        const query = `INSERT INTO "${this.tableName}" (${columns.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`;
        const result = await this.executeQuery<IAdminPayoutConsent>(query, values);
        return result.rows[0] as any;
    }

    async findById(id: string): Promise<IAdminPayoutConsent | null> {
        const result = await this.executeQuery<IAdminPayoutConsent>(
            `SELECT * FROM "${this.tableName}" WHERE _id = $1`,
            [id]
        );
        return (result.rows[0] as any) || null;
    }

    async findByConsentCode(code: string): Promise<IAdminPayoutConsent | null> {
        const result = await this.executeQuery<IAdminPayoutConsent>(
            `SELECT * FROM "${this.tableName}" WHERE consent_code = $1 LIMIT 1`,
            [code.trim().toUpperCase()]
        );
        return (result.rows[0] as any) || null;
    }

    async findByAdminId(
        adminId: string,
        filters: { status?: AdminPayoutConsentStatus; limit?: number; offset?: number } = {}
    ): Promise<IAdminPayoutConsent[]> {
        return this.findAll({
            admin_id: adminId,
            status: filters.status,
            limit: filters.limit,
            offset: filters.offset
        });
    }

    async findAll(filters: {
        admin_id?: string;
        status?: AdminPayoutConsentStatus;
        limit?: number;
        offset?: number;
    } = {}): Promise<IAdminPayoutConsent[]> {
        const conditions: string[] = [];
        const params: unknown[] = [];
        let paramIndex = 1;

        if (filters.admin_id) {
            conditions.push(`admin_id = $${paramIndex++}`);
            params.push(filters.admin_id);
        }
        if (filters.status) {
            conditions.push(`status = $${paramIndex++}`);
            params.push(filters.status);
        }

        const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
        const limit = filters.limit ?? 50;
        const offset = filters.offset ?? 0;
        params.push(limit, offset);

        const result = await this.executeQuery<IAdminPayoutConsent>(
            `SELECT * FROM "${this.tableName}" ${where} ORDER BY created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
            params
        );
        return result.rows as any[];
    }

    async countAll(filters: { admin_id?: string; status?: AdminPayoutConsentStatus } = {}): Promise<number> {
        const conditions: string[] = [];
        const params: unknown[] = [];
        let paramIndex = 1;

        if (filters.admin_id) {
            conditions.push(`admin_id = $${paramIndex++}`);
            params.push(filters.admin_id);
        }
        if (filters.status) {
            conditions.push(`status = $${paramIndex++}`);
            params.push(filters.status);
        }

        const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
        const result = await this.executeQuery<{ count: string }>(
            `SELECT COUNT(*) as count FROM "${this.tableName}" ${where}`,
            params
        );
        return parseInt((result.rows[0] as any)?.count || '0', 10);
    }

    async update(id: string, entity: Partial<IAdminPayoutConsent>): Promise<IAdminPayoutConsent | null> {
        const { setClause, values } = this.buildUpdateSet(entity);
        if (!setClause) return null;
        const query = `UPDATE "${this.tableName}" SET ${setClause}, updated_at = NOW() WHERE _id = $${values.length + 1} RETURNING *`;
        const result = await this.executeQuery<IAdminPayoutConsent>(query, [...values, id]);
        return (result.rows[0] as any) || null;
    }

    async findByCondition(condition: Partial<IAdminPayoutConsent>): Promise<IAdminPayoutConsent[]> {
        const keys = Object.keys(condition);
        const values = Object.values(condition);
        if (keys.length === 0) return this.findAll();
        const whereClause = keys.map((key, index) => `"${key}" = $${index + 1}`).join(' AND ');
        const result = await this.executeQuery<IAdminPayoutConsent>(
            `SELECT * FROM "${this.tableName}" WHERE ${whereClause} ORDER BY created_at DESC`,
            values
        );
        return result.rows as any[];
    }

    async delete(id: string, _deletedBy?: string): Promise<boolean> {
        const result = await this.executeQuery(`DELETE FROM "${this.tableName}" WHERE _id = $1`, [id]);
        return (result.rowCount || 0) > 0;
    }

    async findAllRecords(): Promise<IAdminPayoutConsent[]> {
        const result = await this.executeQuery<IAdminPayoutConsent>(
            `SELECT * FROM "${this.tableName}" ORDER BY created_at DESC`
        );
        return result.rows as any[];
    }

    async executeRawQuery(query: string, params: any[]): Promise<any> {
        return await this.executeQuery(query, params);
    }

    async count(condition?: Partial<IAdminPayoutConsent>): Promise<number> {
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

    async bulkCreate(entities: IAdminPayoutConsent[]): Promise<IAdminPayoutConsent[]> {
        if (entities.length === 0) return [];
        const { valuesClause, values, columns } = this.buildBulkInsertClause(entities);
        const columnNames = columns.map((col) => `"${col}"`).join(', ');
        const query = `INSERT INTO "${this.tableName}" (${columnNames}) VALUES ${valuesClause} RETURNING *`;
        const result = await this.executeQuery<IAdminPayoutConsent>(query, values);
        return result.rows as any[];
    }

    async bulkUpdate(entities: Partial<IAdminPayoutConsent>[]): Promise<IAdminPayoutConsent[]> {
        if (entities.length === 0) return [];
        const { updateClause, values } = this.buildBulkUpdateClause(entities);
        const ids = entities.map((e) => (e as any)._id).filter(Boolean);
        const query = `UPDATE "${this.tableName}" SET ${updateClause}, updated_at = NOW() WHERE _id IN (${ids.map((_, i) => `$${values.length + i + 1}`).join(', ')}) RETURNING *`;
        const result = await this.executeQuery<IAdminPayoutConsent>(query, [...values, ...ids]);
        return result.rows as any[];
    }

    async bulkDelete(ids: string[]): Promise<number> {
        if (ids.length === 0) return 0;
        const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');
        const result = await this.executeQuery(`DELETE FROM "${this.tableName}" WHERE _id IN (${placeholders})`, ids);
        return result.rowCount || 0;
    }
}
