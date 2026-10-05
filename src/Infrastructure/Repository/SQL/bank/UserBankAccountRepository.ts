import { inject, injectable } from 'inversify';
import { BaseRepository } from '../BaseRepository';
import { TransactionManager } from '../Abstractions/TransactionManager';
import { IUserBankAccount } from '../../../../Core/Application/Interface/Entities/bank/IUserBankAccount';
import { IUserBankAccountRepository } from '../../../../Core/Application/Interface/Repositories/IUserBankAccountRepository';
import { TableNames } from '../../../../Core/Application/Enums/TableNames';
import { TYPES } from '../../../../Core/Types/Constants';

@injectable()
export class UserBankAccountRepository extends BaseRepository<IUserBankAccount> implements IUserBankAccountRepository {
    constructor(@inject(TYPES.TransactionManager) transactionManager: TransactionManager) {
        super(transactionManager, TableNames.USER_BANK_ACCOUNTS);
    }

    async create(entity: IUserBankAccount): Promise<IUserBankAccount> {
        const { columns, values, placeholders } = this.getEntityColumns(entity as Partial<IUserBankAccount>);
        const query = `INSERT INTO "${this.tableName}" (${columns.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`;
        const result = await this.executeQuery<IUserBankAccount>(query, values);
        return result.rows[0] as any;
    }

    async findById(id: string): Promise<IUserBankAccount | null> {
        const result = await this.executeQuery<IUserBankAccount>(
            `SELECT * FROM "${this.tableName}" WHERE _id = $1`,
            [id]
        );
        return (result.rows[0] as any) || null;
    }

    async findByUserId(userId: string): Promise<IUserBankAccount[]> {
        const result = await this.executeQuery<IUserBankAccount>(
            `SELECT * FROM "${this.tableName}"
             WHERE user_id = $1 AND type = 'user' AND is_active = TRUE
             ORDER BY created_at DESC`,
            [userId]
        );
        return result.rows as any[];
    }

    async findCorporateAccounts(activeOnly = true): Promise<IUserBankAccount[]> {
        const query = activeOnly
            ? `SELECT * FROM "${this.tableName}" WHERE type = 'corporate' AND is_active = TRUE ORDER BY is_default DESC, created_at ASC`
            : `SELECT * FROM "${this.tableName}" WHERE type = 'corporate' ORDER BY is_default DESC, created_at ASC`;
        const result = await this.executeQuery<IUserBankAccount>(query);
        return result.rows as any[];
    }

    async findActiveCorporateDefault(): Promise<IUserBankAccount | null> {
        const result = await this.executeQuery<IUserBankAccount>(
            `SELECT * FROM "${this.tableName}"
             WHERE type = 'corporate' AND is_active = TRUE
             ORDER BY is_default DESC, created_at ASC
             LIMIT 1`
        );
        return (result.rows[0] as any) || null;
    }

    async findUserDuplicate(
        userId: string,
        accountNumber: string,
        bankCode: string
    ): Promise<IUserBankAccount | null> {
        const result = await this.executeQuery<IUserBankAccount>(
            `SELECT * FROM "${this.tableName}"
             WHERE user_id = $1 AND type = 'user' AND is_active = TRUE
               AND account_number = $2 AND bank_code = $3
             LIMIT 1`,
            [userId, accountNumber, bankCode]
        );
        return (result.rows[0] as any) || null;
    }

    async findUserAccountByNumberAndCode(
        userId: string,
        accountNumber: string,
        bankCode?: string
    ): Promise<IUserBankAccount | null> {
        const normalized = String(accountNumber || '').replace(/\D/g, '');
        const padded = normalized.padStart(10, '0');
        const stripped = normalized.replace(/^0+/, '') || '0';

        if (bankCode) {
            const exact = await this.executeQuery<IUserBankAccount>(
                `SELECT * FROM "${this.tableName}"
                 WHERE user_id = $1 AND type = 'user'
                   AND (
                     account_number = $2
                     OR LPAD(REGEXP_REPLACE(account_number, '\\D', '', 'g'), 10, '0') = $3
                     OR REGEXP_REPLACE(account_number, '^0+', '') = $4
                   )
                   AND bank_code = $5
                 ORDER BY is_active DESC, updated_at DESC
                 LIMIT 1`,
                [userId, accountNumber, padded, stripped, bankCode]
            );
            if (exact.rows[0]) return exact.rows[0] as any;
        }

        const byNumber = await this.executeQuery<IUserBankAccount>(
            `SELECT * FROM "${this.tableName}"
             WHERE user_id = $1 AND type = 'user'
               AND (
                 account_number = $2
                 OR LPAD(REGEXP_REPLACE(COALESCE(account_number, ''), '\\D', '', 'g'), 10, '0') = $3
                 OR REGEXP_REPLACE(COALESCE(account_number, ''), '^0+', '') = $4
               )
             ORDER BY is_active DESC, updated_at DESC
             LIMIT 1`,
            [userId, accountNumber, padded, stripped]
        );
        return (byNumber.rows[0] as any) || null;
    }

    async findPreviousPayoutBankByAccountNumber(
        userId: string,
        accountNumber: string
    ): Promise<{
        account_number: string;
        bank_code: string;
        bank_name: string;
        account_name: string;
        bank_account_id?: string;
    } | null> {
        const normalized = String(accountNumber || '').replace(/\D/g, '');
        const padded = normalized.padStart(10, '0');
        const stripped = normalized.replace(/^0+/, '') || '0';

        const fromOrders = await this.executeQuery(
            `SELECT
                metadata->'payout_bank'->>'account_number' AS account_number,
                metadata->'payout_bank'->>'bank_code' AS bank_code,
                metadata->'payout_bank'->>'bank_name' AS bank_name,
                metadata->'payout_bank'->>'account_name' AS account_name
             FROM "${TableNames.TRADING_ORDERS}"
             WHERE user_id = $1
               AND type = 'sell'
               AND metadata->'payout_bank'->>'account_number' IS NOT NULL
               AND (
                 metadata->'payout_bank'->>'account_number' = $2
                 OR LPAD(REGEXP_REPLACE(metadata->'payout_bank'->>'account_number', '\\D', '', 'g'), 10, '0') = $3
                 OR REGEXP_REPLACE(metadata->'payout_bank'->>'account_number', '^0+', '') = $4
               )
             ORDER BY created_at DESC
             LIMIT 1`,
            [userId, accountNumber, padded, stripped]
        );
        const orderRow = fromOrders.rows[0] as any;
        if (orderRow?.account_name) {
            return orderRow;
        }

        const fromIntents = await this.executeQuery(
            `SELECT
                recipient_account_number AS account_number,
                recipient_bank_code AS bank_code,
                recipient_bank_name AS bank_name,
                recipient_account_name AS account_name
             FROM "${TableNames.TRADE_INTENTS}"
             WHERE user_id = $1
               AND type = 'sell'
               AND recipient_account_number IS NOT NULL
               AND (
                 recipient_account_number = $2
                 OR LPAD(REGEXP_REPLACE(recipient_account_number, '\\D', '', 'g'), 10, '0') = $3
                 OR REGEXP_REPLACE(recipient_account_number, '^0+', '') = $4
               )
             ORDER BY created_at DESC
             LIMIT 1`,
            [userId, accountNumber, padded, stripped]
        );
        const intentRow = fromIntents.rows[0] as any;
        if (intentRow?.account_name) {
            return intentRow;
        }

        return null;
    }

    async update(id: string, entity: Partial<IUserBankAccount>): Promise<IUserBankAccount | null> {
        const { setClause, values } = this.buildUpdateSet(entity);
        if (!setClause) return null;
        const query = `UPDATE "${this.tableName}" SET ${setClause}, updated_at = NOW() WHERE _id = $${values.length + 1} RETURNING *`;
        const result = await this.executeQuery<IUserBankAccount>(query, [...values, id]);
        return (result.rows[0] as any) || null;
    }

    async clearCorporateDefaults(): Promise<void> {
        await this.executeQuery(
            `UPDATE "${this.tableName}" SET is_default = FALSE, updated_at = NOW() WHERE type = 'corporate'`
        );
    }

    async delete(id: string, _deletedBy?: string): Promise<boolean> {
        const result = await this.executeQuery(`DELETE FROM "${this.tableName}" WHERE _id = $1`, [id]);
        return (result.rowCount || 0) > 0;
    }

    async findAll(): Promise<IUserBankAccount[]> {
        const result = await this.executeQuery<IUserBankAccount>(
            `SELECT * FROM "${this.tableName}" ORDER BY created_at DESC`
        );
        return result.rows as any[];
    }

    async findByCondition(condition: Partial<IUserBankAccount>): Promise<IUserBankAccount[]> {
        const keys = Object.keys(condition);
        const values = Object.values(condition);
        if (keys.length === 0) return this.findAll();
        const whereClause = keys.map((key, index) => `"${key}" = $${index + 1}`).join(' AND ');
        const result = await this.executeQuery<IUserBankAccount>(
            `SELECT * FROM "${this.tableName}" WHERE ${whereClause} ORDER BY created_at DESC`,
            values
        );
        return result.rows as any[];
    }

    async executeRawQuery(query: string, params: any[]): Promise<any> {
        return await this.executeQuery(query, params);
    }

    async count(condition?: Partial<IUserBankAccount>): Promise<number> {
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

    async bulkCreate(entities: IUserBankAccount[]): Promise<IUserBankAccount[]> {
        if (entities.length === 0) return [];
        const { valuesClause, values, columns } = this.buildBulkInsertClause(entities);
        const columnNames = columns.map((col) => `"${col}"`).join(', ');
        const query = `INSERT INTO "${this.tableName}" (${columnNames}) VALUES ${valuesClause} RETURNING *`;
        const result = await this.executeQuery<IUserBankAccount>(query, values);
        return result.rows as any[];
    }

    async bulkUpdate(entities: Partial<IUserBankAccount>[]): Promise<IUserBankAccount[]> {
        if (entities.length === 0) return [];
        const { updateClause, values } = this.buildBulkUpdateClause(entities);
        const ids = entities.map((e) => (e as any)._id).filter(Boolean);
        const query = `UPDATE "${this.tableName}" SET ${updateClause}, updated_at = NOW() WHERE _id IN (${ids.map((_, i) => `$${values.length + i + 1}`).join(', ')}) RETURNING *`;
        const result = await this.executeQuery<IUserBankAccount>(query, [...values, ...ids]);
        return result.rows as any[];
    }

    async bulkDelete(ids: string[]): Promise<number> {
        if (ids.length === 0) return 0;
        const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');
        const result = await this.executeQuery(`DELETE FROM "${this.tableName}" WHERE _id IN (${placeholders})`, ids);
        return result.rowCount || 0;
    }
}
