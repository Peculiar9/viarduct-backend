import { inject, injectable } from 'inversify';
import { TYPES } from '../../../../Core/Types/Constants';
import { TableNames } from '../../../../Core/Application/Enums/TableNames';
import { DatabaseError, ServiceError } from '../../../../Core/Application/Error/AppError';
import { ICustodyDerivationCounterRepository } from '../../../../Core/Application/Interface/Repositories/ICustodyDerivationCounterRepository';
import { CustodyAsset } from '../../../../Core/Application/Interface/Services/ICustodyProvider';
import { ConnectionPoolManager } from '../Abstractions/ConnectionPoolManager';
import { EnvironmentConfig } from '../../../Config/EnvironmentConfig';
import { Console } from '../../../Utils/Console';
import {
    assertThresh0ldPathIndex,
    formatThresh0ldDerivationPath,
    parseDerivationPathIndex
} from '../../../Services/custody/thresh0ld/Thresh0ldDerivationPath';
import { THRESH0LD_ADDRESS_INDEX_BATCH_SIZE } from '../../../Services/custody/thresh0ld/Thresh0ldTypes';

/**
 * Singleton-safe sequential HD index allocator for Thresh0ld deposit addresses.
 * Uses the connection pool directly so it can be injected into singleton custody providers.
 */
@injectable()
export class CustodyDerivationCounterRepository implements ICustodyDerivationCounterRepository {
    private readonly tableName = TableNames.CUSTODY_DERIVATION_COUNTERS;
    private readonly intentsTable = TableNames.TRADE_INTENTS;

    constructor(
        @inject(TYPES.ConnectionPoolManager) private readonly poolManager: ConnectionPoolManager
    ) {}

    async peekNextIndex(cryptoType: CustodyAsset): Promise<number> {
        await this.ensureCounterRow(cryptoType);
        const client = await this.poolManager.getConnection();
        try {
            const result = await client.query(
                `SELECT next_index FROM "${this.tableName}" WHERE UPPER(crypto_type) = UPPER($1) LIMIT 1`,
                [cryptoType]
            );
            return Number(result.rows[0]?.next_index ?? 0);
        } finally {
            await this.poolManager.releaseConnection(client);
        }
    }

    async allocateNextIndex(cryptoType: CustodyAsset): Promise<number> {
        try {
            await this.ensureCounterRow(cryptoType);
            const client = await this.poolManager.getConnection();
            try {
                const result = await client.query(
                    `UPDATE "${this.tableName}"
                     SET next_index = next_index + 1,
                         updated_at = CURRENT_TIMESTAMP
                     WHERE UPPER(crypto_type) = UPPER($1)
                     RETURNING (next_index - 1) AS allocated_index, next_index`,
                    [cryptoType]
                );

                const allocated = Number(result.rows[0]?.allocated_index);
                if (!Number.isInteger(allocated)) {
                    throw new ServiceError(`Failed to allocate derivation index for ${cryptoType}`);
                }

                assertThresh0ldPathIndex(allocated);

                if (allocated > 0) {
                    const previousPath = formatThresh0ldDerivationPath(allocated - 1);
                    const gap = await client.query(
                        `SELECT COUNT(*)::int AS count
                         FROM "${this.intentsTable}"
                         WHERE type = 'sell'
                           AND UPPER(crypto_type) = UPPER($1)
                           AND deposit_derivation_path = $2`,
                        [cryptoType, previousPath]
                    );
                    if (Number(gap.rows[0]?.count ?? 0) === 0) {
                        Console.warn('Thresh0ld derivation gap detected', {
                            cryptoType,
                            allocatedIndex: allocated,
                            expectedPreviousPath: previousPath,
                            message:
                                'No trade intent found for the previous sequential path. Thresh0ld gap limit may skip deposits until the sequence is contiguous from the watcher head.'
                        });
                    }
                }

                Console.info('Allocated sequential Thresh0ld derivation index', {
                    cryptoType,
                    allocatedIndex: allocated,
                    deposit_derivation_path: formatThresh0ldDerivationPath(allocated),
                    nextIndexAfterAllocate: Number(result.rows[0]?.next_index)
                });

                return allocated;
            } finally {
                await this.poolManager.releaseConnection(client);
            }
        } catch (error: any) {
            if (error instanceof ServiceError) throw error;
            throw new DatabaseError(`Failed to allocate derivation index: ${error.message}`);
        }
    }

    private async ensureCounterRow(cryptoType: CustodyAsset): Promise<void> {
        const client = await this.poolManager.getConnection();
        try {
            const existing = await client.query(
                `SELECT next_index FROM "${this.tableName}" WHERE UPPER(crypto_type) = UPPER($1) LIMIT 1`,
                [cryptoType]
            );
            if (existing.rows.length > 0) {
                return;
            }

            const seed = await this.resolveSeedIndex(client, cryptoType);
            assertThresh0ldPathIndex(seed);

            Console.info('Seeding custody derivation counter', {
                cryptoType,
                next_index: seed,
                deposit_derivation_path_will_start_at: formatThresh0ldDerivationPath(seed)
            });

            await client.query(
                `INSERT INTO "${this.tableName}" (crypto_type, next_index, created_at, updated_at)
                 VALUES ($1, $2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                 ON CONFLICT (crypto_type) DO NOTHING`,
                [cryptoType, seed]
            );
        } finally {
            await this.poolManager.releaseConnection(client);
        }
    }

    private async resolveSeedIndex(client: any, cryptoType: CustodyAsset): Promise<number> {
        const envKey = `THRESH0LD_DERIVATION_NEXT_INDEX_${cryptoType}`;
        const envRaw = EnvironmentConfig.get(envKey, '').trim();
        if (envRaw !== '') {
            const forced = Number.parseInt(envRaw, 10);
            if (!Number.isInteger(forced) || forced < 0 || forced >= THRESH0LD_ADDRESS_INDEX_BATCH_SIZE) {
                throw new ServiceError(
                    `${envKey} must be an integer in 0..${THRESH0LD_ADDRESS_INDEX_BATCH_SIZE - 1}`
                );
            }
            Console.warn('Using env override for Thresh0ld derivation next index', {
                envKey,
                forcedNextIndex: forced
            });
            return forced;
        }

        const paths = await client.query(
            `SELECT deposit_derivation_path
             FROM "${this.intentsTable}"
             WHERE type = 'sell'
               AND UPPER(crypto_type) = UPPER($1)
               AND deposit_derivation_path IS NOT NULL
               AND BTRIM(deposit_derivation_path) <> ''`,
            [cryptoType]
        );

        let maxIndex: number | null = null;
        for (const row of paths.rows as Array<{ deposit_derivation_path?: string }>) {
            const idx = parseDerivationPathIndex(row.deposit_derivation_path);
            if (idx == null) continue;
            if (maxIndex == null || idx > maxIndex) maxIndex = idx;
        }

        if (maxIndex == null) {
            return 0;
        }

        const next = maxIndex + 1;
        if (next >= THRESH0LD_ADDRESS_INDEX_BATCH_SIZE) {
            throw new ServiceError(
                `Thresh0ld derivation index exhausted for ${cryptoType} (max ${THRESH0LD_ADDRESS_INDEX_BATCH_SIZE - 1})`
            );
        }

        const expectedCount = maxIndex + 1;
        if (paths.rows.length < expectedCount) {
            Console.warn('Historical derivation gap while seeding counter', {
                cryptoType,
                maxIndex,
                expectedContiguousCount: expectedCount,
                intentsWithPaths: paths.rows.length,
                hint: `Set ${envKey}=0 only if starting a fresh sequential range on a new/reset Thresh0ld wallet watch head`
            });
        }

        return next;
    }
}
