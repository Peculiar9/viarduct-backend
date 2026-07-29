import { inject, injectable } from 'inversify';
import { BaseRepository } from '../BaseRepository';
import { TransactionManager } from '../Abstractions/TransactionManager';
import { IPlatformCryptoAddress, PlatformCryptoAsset } from '../../../../Core/Application/Interface/Entities/trading/IPlatformCryptoAddress';
import { IPlatformCryptoAddressRepository } from '../../../../Core/Application/Interface/Repositories/IPlatformCryptoAddressRepository';
import { TableNames } from '../../../../Core/Application/Enums/TableNames';
import { TYPES } from '../../../../Core/Types/Constants';

@injectable()
export class PlatformCryptoAddressRepository
    extends BaseRepository<IPlatformCryptoAddress>
    implements IPlatformCryptoAddressRepository
{
    constructor(@inject(TYPES.TransactionManager) transactionManager: TransactionManager) {
        super(transactionManager, TableNames.PLATFORM_CRYPTO_ADDRESSES);
    }

    async create(entity: IPlatformCryptoAddress): Promise<IPlatformCryptoAddress> {
        const { columns, values, placeholders } = this.getEntityColumns(entity as Partial<IPlatformCryptoAddress>);
        const query = `INSERT INTO "${this.tableName}" (${columns.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`;
        const result = await this.executeQuery<IPlatformCryptoAddress>(query, values);
        return result.rows[0] as any;
    }

    async findById(id: string): Promise<IPlatformCryptoAddress | null> {
        const result = await this.executeQuery<IPlatformCryptoAddress>(
            `SELECT * FROM "${this.tableName}" WHERE _id = $1`,
            [id]
        );
        return (result.rows[0] as any) || null;
    }

    async findAll(filters: {
        asset?: PlatformCryptoAsset;
        is_active?: boolean;
    } = {}): Promise<IPlatformCryptoAddress[]> {
        const clauses: string[] = [];
        const values: unknown[] = [];

        if (filters.asset) {
            values.push(filters.asset);
            clauses.push(`asset = $${values.length}`);
        }
        if (filters.is_active !== undefined) {
            values.push(filters.is_active);
            clauses.push(`is_active = $${values.length}`);
        }

        const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
        const result = await this.executeQuery<IPlatformCryptoAddress>(
            `SELECT * FROM "${this.tableName}" ${where} ORDER BY asset ASC, created_at ASC`,
            values
        );
        return result.rows as any[];
    }

    async findByAddress(address: string): Promise<IPlatformCryptoAddress | null> {
        const result = await this.executeQuery<IPlatformCryptoAddress>(
            `SELECT * FROM "${this.tableName}" WHERE LOWER(address) = LOWER($1) LIMIT 1`,
            [address]
        );
        return (result.rows[0] as any) || null;
    }

    async assignNextAddress(asset: PlatformCryptoAsset): Promise<IPlatformCryptoAddress | null> {
        const result = await this.executeQuery<IPlatformCryptoAddress>(
            `UPDATE "${this.tableName}"
             SET last_assigned_at = NOW(), updated_at = NOW()
             WHERE _id = (
                 SELECT _id FROM "${this.tableName}"
                 WHERE asset = $1 AND is_active = TRUE
                 ORDER BY last_assigned_at ASC NULLS FIRST, created_at ASC
                 LIMIT 1
                 FOR UPDATE SKIP LOCKED
             )
             RETURNING *`,
            [asset]
        );
        return (result.rows[0] as any) || null;
    }

    async update(id: string, entity: Partial<IPlatformCryptoAddress>): Promise<IPlatformCryptoAddress | null> {
        const { setClause, values } = this.buildUpdateSet(entity);
        if (!setClause) return null;
        const query = `UPDATE "${this.tableName}" SET ${setClause}, updated_at = NOW() WHERE _id = $${values.length + 1} RETURNING *`;
        const result = await this.executeQuery<IPlatformCryptoAddress>(query, [...values, id]);
        return (result.rows[0] as any) || null;
    }

    async softDelete(id: string): Promise<IPlatformCryptoAddress | null> {
        const result = await this.executeQuery<IPlatformCryptoAddress>(
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

    async findByCondition(condition: Partial<IPlatformCryptoAddress>): Promise<IPlatformCryptoAddress[]> {
        const keys = Object.keys(condition);
        const values = Object.values(condition);
        if (keys.length === 0) {
            return this.findAll();
        }
        const whereClause = keys.map((key, index) => `"${key}" = $${index + 1}`).join(' AND ');
        const result = await this.executeQuery<IPlatformCryptoAddress>(
            `SELECT * FROM "${this.tableName}" WHERE ${whereClause} ORDER BY created_at DESC`,
            values
        );
        return result.rows as any[];
    }

    async executeRawQuery(query: string, params: any[]): Promise<any> {
        return await this.executeQuery(query, params);
    }

    async count(condition?: Partial<IPlatformCryptoAddress>): Promise<number> {
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

    async bulkCreate(entities: IPlatformCryptoAddress[]): Promise<IPlatformCryptoAddress[]> {
        if (entities.length === 0) return [];
        const { valuesClause, values, columns } = this.buildBulkInsertClause(entities);
        const columnNames = columns.map((col) => `"${col}"`).join(', ');
        const query = `INSERT INTO "${this.tableName}" (${columnNames}) VALUES ${valuesClause} RETURNING *`;
        const result = await this.executeQuery<IPlatformCryptoAddress>(query, values);
        return result.rows as any[];
    }

    async bulkUpdate(entities: Partial<IPlatformCryptoAddress>[]): Promise<IPlatformCryptoAddress[]> {
        if (entities.length === 0) return [];
        const { updateClause, values } = this.buildBulkUpdateClause(entities);
        const ids = entities.map((e) => (e as any)._id).filter(Boolean);
        const query = `UPDATE "${this.tableName}" SET ${updateClause}, updated_at = NOW() WHERE _id IN (${ids.map((_, i) => `$${values.length + i + 1}`).join(', ')}) RETURNING *`;
        const result = await this.executeQuery<IPlatformCryptoAddress>(query, [...values, ...ids]);
        return result.rows as any[];
    }

    async bulkDelete(ids: string[]): Promise<number> {
        if (ids.length === 0) return 0;
        const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');
        const result = await this.executeQuery(`DELETE FROM "${this.tableName}" WHERE _id IN (${placeholders})`, ids);
        return result.rowCount || 0;
    }
}
