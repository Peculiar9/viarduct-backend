import { inject, injectable } from "inversify";
import { BaseRepository } from "../BaseRepository";
import { TransactionManager } from "../Abstractions/TransactionManager";
import { TYPES } from "../../../../Core/Types/Constants";
import { TableNames } from "../../../../Core/Application/Enums/TableNames";
import { UserKYC } from "../../../../Core/Application/Entities/UserKYC";
import { KYCStage, KYCStatus } from "../../../../Core/Application/Interface/Entities/auth-and-user/IVerification";
import { IRepository } from "../../../../Core/Application/Interface/Persistence/Repository/IRepository";

@injectable()
export class UserKYCRepository extends BaseRepository<UserKYC> implements IRepository<UserKYC> {
  
    constructor(
        @inject(TYPES.TransactionManager) transactionManager: TransactionManager
    ) {
        super(transactionManager, TableNames.USER_KYC);
    }
    
    async findById(id: string): Promise<UserKYC | null> {
        const result = await this.executeQuery<UserKYC>(
          `SELECT * FROM ${this.tableName} WHERE _id = $1`,
          [id]
      );
         return (result.rows[0] as unknown as UserKYC) || null;
    }

      async findAll(): Promise<UserKYC[]> {
        const result = await this.executeQuery<UserKYC>(
          `SELECT * FROM ${this.tableName} ORDER BY last_updated DESC`
        );
        return result.rows as unknown as UserKYC[];
      }
    
      async findByCondition(condition: Partial<UserKYC>): Promise<UserKYC[]> {
        const { whereClause, values } = this.buildWhereClause(condition);
        const result = await this.executeQuery<UserKYC>(
          `SELECT * FROM ${this.tableName} ${whereClause} ORDER BY last_updated DESC`,
          values
        );
        return result.rows as unknown as UserKYC[];
      }
    
      async create(entity: Partial<UserKYC>): Promise<UserKYC> {
        const { columns, values, placeholders } = this.getEntityColumns(entity);
        const result = await this.executeQuery<UserKYC>(
          `INSERT INTO ${this.tableName} (${columns.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`,
          values
        );
        return result.rows[0] as unknown as UserKYC;
      }
    
      async update(id: string, entity: Partial<UserKYC>): Promise<UserKYC | null> {
        const { setClause, values } = this.buildUpdateSet(entity);
        if (!setClause) {
          throw new Error('No fields to update');
        }
        const result = await this.executeQuery<UserKYC>(
          `UPDATE ${this.tableName} SET ${setClause}, last_updated = NOW() WHERE _id = $${values.length + 1} RETURNING *`,
          [...values, id]
        );
        return result.rows[0] as unknown as UserKYC || null;
      }
    
      async delete(id: string): Promise<boolean> {
        const result = await this.executeQuery(
          `DELETE FROM ${this.tableName} WHERE _id = $1`,
          [id]
        );
        return result.rowCount as number > 0;
      }
    
      async executeRawQuery(query: string, params: any[]): Promise<any> {
        return this.executeQuery(query, params);
      }
    
      async count(condition?: Partial<UserKYC>): Promise<number> {
        let whereClause = '';
        let values: any[] = [];
        if (condition) {
          const built = this.buildWhereClause(condition);
          whereClause = built.whereClause;
          values = built.values;
        }
        const result = await this.executeQuery<{ count: string }>(
          `SELECT COUNT(*) as count FROM ${this.tableName} ${whereClause}`,
          values
        );
        return parseInt((result.rows[0] as any).count || '0', 10);
      }
    
      async bulkCreate(entities: UserKYC[]): Promise<UserKYC[]> {
        if (!entities.length) return [];
        const { valuesClause, values, columns } = this.buildBulkInsertClause(entities);
        const result = await this.executeQuery<UserKYC>(
          `INSERT INTO ${this.tableName} (${columns.join(', ')}) VALUES ${valuesClause} RETURNING *`,
          values
        );
        return result.rows as unknown as UserKYC[];
      }
    
      async bulkUpdate(entities: Partial<UserKYC>[]): Promise<UserKYC[]> {
        if (!entities.length) return [];
        const { updateClause, values } = this.buildBulkUpdateClause(entities);
        const result = await this.executeQuery<UserKYC>(
          `UPDATE ${this.tableName} SET ${updateClause} RETURNING *`,
          values
        );
        return result.rows as unknown as UserKYC[];
      }
    
      async bulkDelete(ids: string[]): Promise<number> {
        if (!ids.length) return 0;
        const { whereClause, values } = this.buildWhereInClause(ids);
        const result = await this.executeQuery(
          `DELETE FROM ${this.tableName} ${whereClause}`,
          values
        );
        return result.rowCount as number || 0;
      }
    

  async findByUserId(userId: string): Promise<UserKYC | null> {
    const result = await this.executeQuery<UserKYC>(
      `SELECT * FROM ${this.tableName} WHERE user_id = $1 LIMIT 1`,
      [userId]
    );
    return result.rows[0] as unknown as UserKYC || null;
  }

  async updateStage(userId: string, stage: KYCStage, status: KYCStatus, metadata?: Record<string, any>): Promise<UserKYC | null> {
    const result = await this.executeQuery<UserKYC>(
      `UPDATE ${this.tableName}
       SET current_stage = $1, status = $2, last_updated = NOW(), stage_metadata = COALESCE($3, stage_metadata)
       WHERE user_id = $4
       RETURNING *`,
      [stage, status, metadata ? JSON.stringify(metadata) : null, userId]
    );
    return result.rows[0] as unknown as UserKYC || null;
  }

  async setFailure(userId: string, reason: string): Promise<UserKYC | null> {
    const result = await this.executeQuery<UserKYC>(
      `UPDATE ${this.tableName}
       SET status = $1, failure_reason = $2, last_updated = NOW()
       WHERE user_id = $3
       RETURNING *`,
      [KYCStatus.FAILED, reason, userId]
    );
    return result.rows[0] as unknown as UserKYC || null;
  }

  async resetKYC(userId: string): Promise<UserKYC | null> {
    const result = await this.executeQuery<UserKYC>(
      `UPDATE ${this.tableName}
       SET current_stage = $1, status = $2, last_updated = NOW(), failure_reason = NULL, stage_metadata = '{}'::jsonb
       WHERE user_id = $3
       RETURNING *`,
      [KYCStage.NOT_STARTED, KYCStatus.PENDING, userId]
    );
    return result.rows[0] as unknown as UserKYC || null; 
  }

  async listForAdmin(options: { status?: string; userId?: string; limit: number; offset: number }): Promise<any[]> {
    const conditions: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (options.userId) {
      conditions.push(`k.user_id = $${idx}`);
      values.push(options.userId);
      idx++;
    }
    if (options.status) {
      conditions.push(`k.status = $${idx}`);
      values.push(options.status);
      idx++;
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const query = `
      SELECT
        k.*,
        jsonb_build_object(
          'id', u._id,
          'first_name', u.first_name,
          'last_name', u.last_name,
          'email', u.email,
          'profile_image', u.profile_image,
          'status', u.status,
          'is_active', u.is_active,
          'kyc_stage', u.kyc_stage,
          'has_completed_kyc', u.has_completed_kyc,
          'created_at', u.created_at,
          'updated_at', u.updated_at
        ) as "user"
      FROM "${TableNames.USER_KYC}" k
      INNER JOIN "${TableNames.USERS}" u ON u._id = k.user_id
      ${whereClause}
      ORDER BY k.last_updated DESC
      LIMIT $${idx} OFFSET $${idx + 1}
    `;
    values.push(options.limit, options.offset);

    const result = await this.executeQuery<any>(query, values);
    return result.rows as any[];
  }

  async countForAdmin(options: { status?: string; userId?: string }): Promise<number> {
    const conditions: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (options.userId) {
      conditions.push(`user_id = $${idx}`);
      values.push(options.userId);
      idx++;
    }
    if (options.status) {
      conditions.push(`status = $${idx}`);
      values.push(options.status);
      idx++;
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await this.executeQuery<{ count: string }>(
      `SELECT COUNT(*) as count FROM "${TableNames.USER_KYC}" ${whereClause}`,
      values
    );
    return parseInt((result.rows[0] as any)?.count || '0', 10);
  }

  async findWithUserById(kycId: string): Promise<any | null> {
    const result = await this.executeQuery<any>(
      `
      SELECT
        k.*,
        jsonb_build_object(
          'id', u._id,
          'first_name', u.first_name,
          'last_name', u.last_name,
          'email', u.email,
          'profile_image', u.profile_image,
          'status', u.status,
          'is_active', u.is_active,
          'kyc_stage', u.kyc_stage,
          'has_completed_kyc', u.has_completed_kyc,
          'created_at', u.created_at,
          'updated_at', u.updated_at
        ) as "user"
      FROM "${TableNames.USER_KYC}" k
      INNER JOIN "${TableNames.USERS}" u ON u._id = k.user_id
      WHERE k._id = $1
      LIMIT 1
      `,
      [kycId]
    );
    return (result.rows[0] as any) || null;
  }

  async manualVerifyById(input: { kycId: string; adminId: string; note?: string | null }): Promise<UserKYC | null> {
    const patch = {
      admin_review: {
        verified_by: input.adminId,
        verified_at: new Date().toISOString(),
        note: input.note ?? null
      }
    };
    const result = await this.executeQuery<UserKYC>(
      `
      UPDATE "${TableNames.USER_KYC}"
      SET
        status = $1,
        current_stage = $2,
        last_updated = NOW(),
        failure_reason = NULL,
        stage_metadata = COALESCE(stage_metadata, '{}'::jsonb) || $3::jsonb
      WHERE _id = $4
      RETURNING *
      `,
      [KYCStatus.COMPLETED, KYCStage.COMPLETED, JSON.stringify(patch), input.kycId]
    );
    return (result.rows[0] as any) || null;
  }

  async adminReviewById(input: { kycId: string; adminId: string; verdict: 'approve' | 'reject'; note?: string | null; reason?: string | null }): Promise<UserKYC | null> {
    const nowIso = new Date().toISOString();
    const verdict = input.verdict;

    const patch = {
      admin_review: {
        verdict,
        reviewed_by: input.adminId,
        reviewed_at: nowIso,
        note: input.note ?? null,
        reason: verdict === 'reject' ? (input.reason ?? null) : null
      }
    };

    if (verdict === 'approve') {
      const result = await this.executeQuery<UserKYC>(
        `
        UPDATE "${TableNames.USER_KYC}"
        SET
          status = $1,
          current_stage = $2,
          last_updated = NOW(),
          failure_reason = NULL,
          stage_metadata = COALESCE(stage_metadata, '{}'::jsonb) || $3::jsonb
        WHERE _id = $4
        RETURNING *
        `,
        [KYCStatus.COMPLETED, KYCStage.COMPLETED, JSON.stringify(patch), input.kycId]
      );
      return (result.rows[0] as any) || null;
    }

    const rejectReason = input.reason ?? 'KYC rejected';
    const result = await this.executeQuery<UserKYC>(
      `
      UPDATE "${TableNames.USER_KYC}"
      SET
        status = $1,
        current_stage = $2,
        last_updated = NOW(),
        failure_reason = $3,
        stage_metadata = COALESCE(stage_metadata, '{}'::jsonb) || $4::jsonb
      WHERE _id = $5
      RETURNING *
      `,
      [KYCStatus.FAILED, KYCStage.REVIEW, rejectReason, JSON.stringify(patch), input.kycId]
    );
    return (result.rows[0] as any) || null;
  }

  async getAdminKYCStats(windowDays: number = 21): Promise<{
    totals: { total: number; pending: number; approved: number; rejected: number };
    last_window: { approved: number; rejected: number };
    previous_window: { approved: number; rejected: number };
  }> {
    const days = Math.max(1, Number(windowDays || 21));
    const result = await this.executeQuery<any>(
      `
      WITH windows AS (
        SELECT
          NOW() - ($1::int || ' days')::interval AS curr_from,
          NOW() AS curr_to,
          NOW() - (($1::int * 2) || ' days')::interval AS prev_from,
          NOW() - ($1::int || ' days')::interval AS prev_to
      )
      SELECT
        (SELECT COUNT(*)::int FROM "${TableNames.USER_KYC}") as total,
        (SELECT COUNT(*)::int FROM "${TableNames.USER_KYC}" WHERE LOWER(status) IN ('pending','in-progress')) as pending,
        (SELECT COUNT(*)::int FROM "${TableNames.USER_KYC}" WHERE LOWER(status) = 'completed') as approved,
        (SELECT COUNT(*)::int FROM "${TableNames.USER_KYC}" WHERE LOWER(status) = 'failed') as rejected,

        (SELECT COUNT(*)::int FROM "${TableNames.USER_KYC}", windows w
          WHERE LOWER(status) = 'completed' AND last_updated >= w.curr_from AND last_updated < w.curr_to
        ) as approved_last_window,
        (SELECT COUNT(*)::int FROM "${TableNames.USER_KYC}", windows w
          WHERE LOWER(status) = 'failed' AND last_updated >= w.curr_from AND last_updated < w.curr_to
        ) as rejected_last_window,

        (SELECT COUNT(*)::int FROM "${TableNames.USER_KYC}", windows w
          WHERE LOWER(status) = 'completed' AND last_updated >= w.prev_from AND last_updated < w.prev_to
        ) as approved_prev_window,
        (SELECT COUNT(*)::int FROM "${TableNames.USER_KYC}", windows w
          WHERE LOWER(status) = 'failed' AND last_updated >= w.prev_from AND last_updated < w.prev_to
        ) as rejected_prev_window
      `,
      [days]
    );

    const row = (result.rows[0] as any) || {};
    return {
      totals: {
        total: row.total || 0,
        pending: row.pending || 0,
        approved: row.approved || 0,
        rejected: row.rejected || 0
      },
      last_window: {
        approved: row.approved_last_window || 0,
        rejected: row.rejected_last_window || 0
      },
      previous_window: {
        approved: row.approved_prev_window || 0,
        rejected: row.rejected_prev_window || 0
      }
    };
  }

  // async createOrUpdate(userId: string, initialStage: KYCStage = KYCStage.FACE_UPLOAD): Promise<UserKYC> {
  //   // Upsert logic: insert if not exists, else return existing
  //   const result = await this.executeQuery<UserKYC>(
  //     `INSERT INTO ${this.tableName} (user_id, current_stage, status, last_updated, stage_metadata)
  //      VALUES ($1, $2, $3, NOW(), '{}'::jsonb)
  //      ON CONFLICT (user_id) DO UPDATE SET last_updated = NOW()
  //      RETURNING *`,
  //     [userId, initialStage, KYCStatus.PENDING]
  //   );
  //   return result.rows[0] as unknown as UserKYC; 
  // }

  /**
   * Check if an identity value (BVN/NIN) already exists in any user's KYC metadata
   * @param identityType The type of identity (BVN or NIN)
   * @param identityValue The identity value to check
   * @param excludeUserId Optional user ID to exclude from the check (for updates)
   * @returns The UserKYC record if found, null otherwise
   */
  async findByIdentityValue(identityType: string, identityValue: string, excludeUserId?: string): Promise<UserKYC | null> {
    let query = `
      SELECT * FROM ${this.tableName}
      WHERE stage_metadata->'identity_verification'->>'identity_value' = $1
        AND stage_metadata->'identity_verification'->>'identity_type' = $2
    `;
    const params: any[] = [identityValue, identityType];
    
    if (excludeUserId) {
      query += ` AND user_id != $3`;
      params.push(excludeUserId);
    }
    
    query += ` LIMIT 1`;
    
    const result = await this.executeQuery<UserKYC>(query, params);
    return result.rows[0] as unknown as UserKYC || null;
  }
}