import { inject, injectable } from 'inversify';
import { BaseRepository } from '../BaseRepository';
import { TransactionManager } from '../Abstractions/TransactionManager';
import { IUser } from '../../../../Core/Application/Interface/Entities/auth-and-user/IUser';
import { TableNames } from '../../../../Core/Application/Enums/TableNames';
import { TYPES } from '../../../../Core/Types/Constants';
import { DatabaseError } from '../../../../Core/Application/Error/AppError';

@injectable()
export class UserRepository extends BaseRepository<IUser> {

    constructor(
        @inject(TYPES.TransactionManager) transactionManager: TransactionManager
    ) {
        super(transactionManager, TableNames.USERS);
    }

    async findById(id: string): Promise<any> {
        try {
            const result = await this.executeQuery<IUser>(
                `SELECT * FROM ${this.tableName} WHERE _id = $1`,
                [id]
            );
            return result.rows[0] || null;
        } catch (error: any) {
            console.error('UserRepository::findById(): ', {
                message: error.message,
                stack: error.stack
            });
        }
    }

    async findByPhone(phone: string): Promise<IUser | undefined | null> {
        try {
            const result = await this.executeQuery<IUser>(
                `SELECT * FROM ${this.tableName} WHERE phone = $1`,
                [phone]
            );
            return (result.rows[0] as unknown as IUser) || null;
        } catch (error: any) {
            console.error('UserRepository::findByPhone(): ', {
                message: error.message,
                stack: error.stack
            });
            return null;
        }
    }

    async findAll(): Promise<any> {
        const result = await this.executeQuery<IUser>(
            `SELECT * FROM ${this.tableName} ORDER BY created_at DESC`
        );
        return result.rows;
    }

    // async create(entity: IUser): Promise<IUser> {
    async create(entity: IUser): Promise<any> {
        try {
            const { columns, values, placeholders } = this.getEntityColumns(entity);
            const query = `INSERT INTO ${this.tableName} (${columns.join(', ')})
            VALUES (${placeholders.join(', ')})
            RETURNING *
            `;

            const result = await this.executeQuery<IUser>(query, values);
            return result.rows[0];
        } catch (error: any) {
            console.error('UserRepository::create(): ', {
                message: error.message,
                stack: error.stack
            });
        }
    }

    async findByCondition(condition: Partial<IUser>): Promise<any> {
        const { whereClause, values } = this.buildWhereClause(condition);
        const result = await this.executeQuery<IUser>(
            `SELECT * FROM ${this.tableName} ${whereClause}`,
            values
        );
        return result.rows;
    }

    async update(id: string, entity: Partial<IUser>): Promise<any> {
        const { setClause, values } = this.buildUpdateSet(entity);
        
        if (!setClause) {
            throw new Error('No fields to update');
        }
        
        const query = `UPDATE ${this.tableName} 
            SET ${setClause}, updated_at = NOW()
            WHERE _id = $${values.length + 1}
            RETURNING *`;
        
        console.log('UserRepository::update() SQL:', query);
        console.log('UserRepository::update() Values:', [...values, id]);
        
        const result = await this.executeQuery<IUser>(query, [...values, id]);
        return result.rows[0] || null;
    }

    async updateNotificationPreferences(userId: string, preferences: Record<string, boolean>): Promise<IUser | null> {
        const result = await this.executeQuery<IUser>(
            `UPDATE ${this.tableName}
             SET "notification_preferences" = $1::jsonb, updated_at = NOW()
             WHERE _id = $2
             RETURNING *`,
            [JSON.stringify(preferences || {}), userId]
        );
        return (result.rows[0] as any) || null;
    }

    async listEligibleForSystemAnnouncements(options: { limit: number; offset: number }): Promise<Array<{ _id: string; email: string | null; first_name: string; last_name: string }>> {
        const result = await this.executeQuery<any>(
            `
            SELECT _id, email, first_name, last_name
            FROM "${this.tableName}"
            WHERE is_active = true
              AND COALESCE((notification_preferences->>'system_announcements')::boolean, true) = true
            ORDER BY created_at ASC
            LIMIT $1 OFFSET $2
            `,
            [options.limit, options.offset]
        );
        return (result.rows as any[]) || [];
    }

    async updateByPhone(phone: string, entity: Partial<IUser>): Promise<any> {
        const { setClause, values } = this.buildUpdateSet(entity);
        const result = await this.executeQuery<IUser>(
            `UPDATE ${this.tableName} 
            SET ${setClause}, updated_at = NOW()
            WHERE phone = $2
            RETURNING *`,
            [...values, phone]
        );
        return result.rows[0] || null;
    }

    async delete(id: string): Promise<boolean> {
        const result = await this.executeQuery(
            `DELETE FROM ${this.tableName} WHERE _id = $1`,
            [id]
        );
        return result.rowCount as number > 0;
    }

    async deleteByEmail(email: string): Promise<boolean> {
        const result = await this.executeQuery(
            `DELETE FROM ${this.tableName} WHERE email = $1`,
            [email]
        );
        return result.rowCount as number > 0;
    }

    async executeRawQuery(query: string, params: any[]): Promise<any> {
        const result = await this.executeQuery(query, params);
        return result.rows;
    }

    async count(condition?: Partial<IUser>): Promise<number> {
        if (condition) {
            const { whereClause, values } = this.buildWhereClause(condition);
            const result = await this.executeQuery<{ count: string }>(
                `SELECT COUNT(*) as count FROM ${this.tableName} ${whereClause}`,
                values
            );
            return parseInt((result.rows[0] as any).count);
        }

        const result = await this.executeQuery<{ count: string }>(
            `SELECT COUNT(*) as count FROM ${this.tableName}`
        );
        return parseInt((result.rows[0] as any).count);
    }

    async findByEmail(email: string): Promise<IUser | null> {
        const query = `SELECT * FROM ${this.tableName} WHERE email = $1`;
        const result = await this.executeQuery<IUser>(
            query,
            [email.toLowerCase()]
        );
        return result.rows[0] as any || null;
    }



    /**
     * Creates multiple users in a single transaction
     * @param users Array of users to create
     * @returns Array of created users
     */
    async bulkCreate(users: IUser[]): Promise<any> {
        const { valuesClause, values, columns } = this.buildBulkInsertClause(users);

        if (users.length === 0) {
            return [];
        }

        const query = `
            INSERT INTO ${this.tableName} (${columns.join(', ')})
            VALUES ${valuesClause}
            RETURNING *
        `;

        try {
            const result = await this.executeQuery<IUser>(query, values);
            return result.rows;
        } catch (error: any) {
            throw new DatabaseError(`Bulk user creation failed: ${error.message}`);
        }
    }

    /**
     * Updates multiple users in a single transaction
     * @param users Array of users with their IDs and update data
     * @returns Array of updated users
     */
    async bulkUpdate(users: Partial<IUser>[]): Promise<any> {
        if (users.length === 0) {
            return [];
        }

        const { updateClause, values } = this.buildBulkUpdateClause(users);
        const userIds = users.map(user => (user as any)._id);

        const query = `
            UPDATE ${this.tableName}
            SET ${updateClause} 
            WHERE _id = ANY($${values.length + 1}::uuid[])
            RETURNING *
        `;

        try {
            const result = await this.executeQuery<IUser>(query, [...values, userIds]);
            return result.rows;
        } catch (error: any) {
            throw new DatabaseError(`Bulk user update failed: ${error.message}`);
        }
    }

    /**
     * Deletes multiple users by their IDs
     * @param ids Array of user IDs to delete
     * @returns Number of deleted users
     */
    async bulkDelete(ids: string[]): Promise<any> {
        if (ids.length === 0) {
            return 0;
        }

        const query = `
            DELETE FROM ${this.tableName}
            WHERE _id = ANY($1::uuid[])
            RETURNING _id
        `;

        try {
            const result = await this.executeQuery(query, [ids]);
            return result.rowCount;
        } catch (error: any) {
            throw new DatabaseError(`Bulk user deletion failed: ${error.message}`);
        }
    }

    async findForAdminList(options: {
        q?: string;
        status?: string;
        is_active?: boolean;
        limit: number;
        offset: number;
    }): Promise<any[]> {
        const conditions: string[] = [];
        const values: any[] = [];
        let idx = 1;

        if (options.q) {
            conditions.push(`(
                u.first_name ILIKE $${idx}
                OR u.last_name ILIKE $${idx}
                OR u.email ILIKE $${idx}
                OR u.phone ILIKE $${idx}
            )`);
            values.push(`%${options.q}%`);
            idx++;
        }

        if (options.status) {
            conditions.push(`u.status = $${idx}`);
            values.push(options.status);
            idx++;
        }

        if (typeof options.is_active === 'boolean') {
            conditions.push(`u.is_active = $${idx}`);
            values.push(options.is_active);
            idx++;
        }

        const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

        const query = `
            SELECT
              u._id,
              u.first_name,
              u.last_name,
              u.email,
              u.phone,
              u.profile_image,
              u.status,
              u.is_active,
              u.has_completed_kyc,
              u.kyc_stage,
              u.has_set_transaction_pin,
              u.created_at,
              u.updated_at,
              COALESCE(jsonb_agg(DISTINCT r.name) FILTER (WHERE r.name IS NOT NULL), '[]'::jsonb) as roles
            FROM "${TableNames.USERS}" u
            LEFT JOIN "${TableNames.USER_ROLES}" ur ON ur.user_id = u._id
            LEFT JOIN "${TableNames.ROLES}" r ON r._id = ur.role_id
            ${where}
            GROUP BY u._id
            ORDER BY u.created_at DESC
            LIMIT $${idx} OFFSET $${idx + 1}
        `;
        values.push(options.limit, options.offset);

        const result = await this.executeQuery<any>(query, values);
        return result.rows as any[];
    }

    async countForAdminList(options: { q?: string; status?: string; is_active?: boolean }): Promise<number> {
        const conditions: string[] = [];
        const values: any[] = [];
        let idx = 1;

        if (options.q) {
            conditions.push(`(
                first_name ILIKE $${idx}
                OR last_name ILIKE $${idx}
                OR email ILIKE $${idx}
                OR phone ILIKE $${idx}
            )`);
            values.push(`%${options.q}%`);
            idx++;
        }

        if (options.status) {
            conditions.push(`status = $${idx}`);
            values.push(options.status);
            idx++;
        }

        if (typeof options.is_active === 'boolean') {
            conditions.push(`is_active = $${idx}`);
            values.push(options.is_active);
            idx++;
        }

        const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
        const result = await this.executeQuery<{ count: string }>(
            `SELECT COUNT(*) as count FROM "${TableNames.USERS}" ${where}`,
            values
        );
        return parseInt((result.rows[0] as any)?.count || '0', 10);
    }

    async findByIdForAdmin(userId: string): Promise<any | null> {
        const result = await this.executeQuery<any>(
            `
            SELECT
              u._id,
              u.first_name,
              u.last_name,
              u.email,
              u.phone,
              u.profile_image,
              u.status,
              u.is_active,
              u.has_completed_kyc,
              u.kyc_stage,
              u.has_set_transaction_pin,
              u.notification_preferences,
              u.deactivation_reason,
              u.deactivated_at,
              u.created_at,
              u.updated_at,
              COALESCE((
                SELECT jsonb_agg(DISTINCT r.name)
                FROM "${TableNames.USER_ROLES}" ur
                INNER JOIN "${TableNames.ROLES}" r ON r._id = ur.role_id
                WHERE ur.user_id = u._id
              ), '[]'::jsonb) as roles,
              COALESCE((
                SELECT jsonb_agg(DISTINCT p.value)
                FROM "${TableNames.USER_ROLES}" ur
                INNER JOIN "${TableNames.ROLE_PERMISSIONS}" rp ON rp.role_id = ur.role_id
                INNER JOIN "${TableNames.PERMISSIONS}" p ON p._id = rp.permission_id
                WHERE ur.user_id = u._id
              ), '[]'::jsonb) as permissions
            FROM "${TableNames.USERS}" u
            WHERE u._id = $1
            LIMIT 1
            `,
            [userId]
        );
        return (result.rows[0] as any) || null;
    }

    async deactivateUser(userId: string, reason: string): Promise<IUser | null> {
        const result = await this.executeQuery<IUser>(
            `
            UPDATE "${TableNames.USERS}"
            SET
              is_active = false,
              status = 'inactive',
              deactivation_reason = $1,
              deactivated_at = NOW(),
              refresh_token = NULL,
              updated_at = NOW()
            WHERE _id = $2
            RETURNING *
            `,
            [String(reason).trim(), userId]
        );
        return (result.rows[0] as any) || null;
    }
}