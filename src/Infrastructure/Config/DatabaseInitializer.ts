import { inject, injectable } from 'inversify';
import { TYPES } from '../../Core/Types/Constants';
import { TableNames } from '../../Core/Application/Enums/TableNames';
import { TransactionManager } from '../Repository/SQL/Abstractions/TransactionManager';
import { User } from '../../Core/Application/Entities/User';
import { getEntityMetadata, getIndexMetadata } from '../../extensions/decorators';
import { DatabaseError } from '../../Core/Application/Error/AppError';
import { Console } from '../Utils/Console';
import { FileManager } from '../../Core/Application/Entities/FileManager';
import { UserKYC } from '../../Core/Application/Entities/UserKYC';
import { Verification } from '../../Core/Application/Entities/Verification';
import { Role } from '../../Core/Application/Entities/Role';
import { Permission } from '../../Core/Application/Entities/Permission';
import { Currency } from '../../Core/Application/Entities/Currency';
import { Wallet } from '../../Core/Application/Entities/Wallet';
import { WalletAccount } from '../../Core/Application/Entities/WalletAccount';
import { TradingRate } from '../../Core/Application/Entities/TradingRate';
import { TradingOrder } from '../../Core/Application/Entities/TradingOrder';
import { TradeIntent } from '../../Core/Application/Entities/TradeIntent';
import { Transaction } from '../../Core/Application/Entities/Transaction';
import { BitcoinTransaction } from '../../Core/Application/Entities/BitcoinTransaction';
import { EthereumTransaction } from '../../Core/Application/Entities/EthereumTransaction';
import { UTXO } from '../../Core/Application/Entities/UTXO';
import { SweepAudit } from '../../Core/Application/Entities/SweepAudit';
import { WithdrawalRequest } from '../../Core/Application/Entities/WithdrawalRequest';
import { UserBankAccount } from '../../Core/Application/Entities/UserBankAccount';
import { AdminPayoutConsent } from '../../Core/Application/Entities/AdminPayoutConsent';
import { PlatformCryptoAddress } from '../../Core/Application/Entities/PlatformCryptoAddress';
import { UserDeviceToken } from '../../Core/Application/Entities/UserDeviceToken';
import { UserTransactionPin } from '../../Core/Application/Entities/UserTransactionPin';
import { GiftCardSubmission } from '../../Core/Application/Entities/GiftCardSubmission';
import { Card } from '../../Core/Application/Entities/Card';
import { Notification } from '../../Core/Application/Entities/Notification';
import { Dispute } from '../../Core/Application/Entities/Dispute';
import { Chat } from '../../Core/Application/Entities/Chat';
import { ChatMessage } from '../../Core/Application/Entities/ChatMessage';
import { SystemAnnouncement } from '../../Core/Application/Entities/SystemAnnouncement';
import { SystemAnnouncementDelivery } from '../../Core/Application/Entities/SystemAnnouncementDelivery';

@injectable()
export class DatabaseInitializer {
    constructor(
        @inject(TYPES.TransactionManager) private transactionManager: TransactionManager,
    ) { }

    async initializeTables(): Promise<void> {
        // STEP 1: DEFINE THE CORRECT AND FINAL CREATION ORDER
        const creationOrder = [
            { entity: User, tableName: TableNames.USERS },
            { entity: Role, tableName: TableNames.ROLES },
            { entity: Permission, tableName: TableNames.PERMISSIONS },
            { entity: Currency, tableName: TableNames.CURRENCIES },
            { entity: Wallet, tableName: TableNames.WALLETS },
            { entity: WalletAccount, tableName: TableNames.WALLET_ACCOUNTS },
            { entity: Transaction, tableName: TableNames.TRANSACTIONS },
            { entity: TradingRate, tableName: TableNames.TRADING_RATES },
            { entity: TradingOrder, tableName: TableNames.TRADING_ORDERS },
            { entity: UserBankAccount, tableName: TableNames.USER_BANK_ACCOUNTS },
            { entity: TradeIntent, tableName: TableNames.TRADE_INTENTS },
            { entity: AdminPayoutConsent, tableName: TableNames.ADMIN_PAYOUT_CONSENTS },
            { entity: PlatformCryptoAddress, tableName: TableNames.PLATFORM_CRYPTO_ADDRESSES },
            { entity: UserDeviceToken, tableName: TableNames.USER_DEVICE_TOKENS },
            { entity: FileManager, tableName: TableNames.FILE_MANAGER },
            { entity: UserKYC, tableName: TableNames.USER_KYC },
            { entity: Verification, tableName: TableNames.VERIFICATIONS },
            { entity: BitcoinTransaction, tableName: TableNames.BITCOIN_TRANSACTIONS },
            { entity: EthereumTransaction, tableName: TableNames.ETHEREUM_TRANSACTIONS },
            { entity: UTXO, tableName: TableNames.UTXOS },
            { entity: SweepAudit, tableName: TableNames.SWEEP_AUDITS },
            { entity: WithdrawalRequest, tableName: TableNames.WITHDRAWAL_REQUESTS },
            { entity: UserTransactionPin, tableName: TableNames.USER_TRANSACTION_PINS },
            { entity: Card, tableName: TableNames.CARDS },
            { entity: GiftCardSubmission, tableName: TableNames.GIFT_CARD_SUBMISSIONS },
            { entity: Notification, tableName: TableNames.NOTIFICATIONS },
            { entity: Dispute, tableName: TableNames.DISPUTES },
            { entity: Chat, tableName: TableNames.CHATS },
            { entity: ChatMessage, tableName: TableNames.CHAT_MESSAGES },
            { entity: SystemAnnouncement, tableName: TableNames.SYSTEM_ANNOUNCEMENTS },
            { entity: SystemAnnouncementDelivery, tableName: TableNames.SYSTEM_ANNOUNCEMENT_DELIVERIES },
        ];

        // STEP 2: PROCESS EACH TABLE INDIVIDUALLY TO ISOLATE FAILURES
        for (const { entity, tableName } of creationOrder) {
            Console.info(`Starting transaction for table: ${tableName}`);
            try {
                // Each table gets its own transaction. This stops the cascading "transaction aborted" errors.
                await this.transactionManager.beginTransaction();

                const tableExists = await this.checkTableExists(tableName);

                if (!tableExists) {
                    Console.info(`-> Table does not exist. Attempting to create: ${tableName}`);
                    await this.createTableIfNotExists(entity, tableName);
                    Console.info(`-> Successfully created table: ${tableName}`);

                    // Seeding is part of the same transaction for atomicity.
                    await this.seedDataToDatabase(tableName);
                    Console.info(`-> Successfully seeded data for table: ${tableName}`);
                } else {
                    Console.info(`-> Table exists. Attempting to update schema: ${tableName}`);
                    await this.updateTableSchema(entity, tableName);
                    Console.info(`-> Successfully updated schema for table: ${tableName}`);
                }

                await this.transactionManager.commit();
                Console.info(`Committed transaction for table: ${tableName}\n`);

            } catch (error: any) {
                // If we are here, this specific table is the ROOT CAUSE of the failure.
                Console.error(error, { message: `FATAL ERROR: Transaction failed for table: ${tableName}. This is the primary point of failure.` });

                try {
                    await this.transactionManager.rollback();
                } catch (rollbackError) {
                    Console.error(rollbackError as Error, { message: 'Rollback failed after initialization error.' });
                }

                // Re-throw the catastrophic error to stop the server startup.
                throw new DatabaseError(`Failed to initialize table: ${tableName}. Reason: ${error.message}`);
            }
        }

        // Create junction tables after main tables
        await this.createJunctionTables();

        Console.info('All database tables initialized/updated successfully');
    }

    private async createJunctionTables(): Promise<void> {
        try {
            await this.transactionManager.beginTransaction();

            // Create role_permissions junction table
            const rolePermissionsExists = await this.checkTableExists(TableNames.ROLE_PERMISSIONS);
            if (!rolePermissionsExists) {
                await this.transactionManager.getClient().query(`
                    CREATE TABLE IF NOT EXISTS "${TableNames.ROLE_PERMISSIONS}" (
                        role_id UUID NOT NULL,
                        permission_id UUID NOT NULL,
                        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                        PRIMARY KEY (role_id, permission_id),
                        CONSTRAINT fk_role_permissions_role 
                            FOREIGN KEY (role_id) REFERENCES "${TableNames.ROLES}" (_id) ON DELETE CASCADE,
                        CONSTRAINT fk_role_permissions_permission 
                            FOREIGN KEY (permission_id) REFERENCES "${TableNames.PERMISSIONS}" (_id) ON DELETE CASCADE
                    );
                `);
                Console.info(`Junction table created: ${TableNames.ROLE_PERMISSIONS}`);
            }

            // Create user_roles junction table
            const userRolesExists = await this.checkTableExists(TableNames.USER_ROLES);
            if (!userRolesExists) {
                await this.transactionManager.getClient().query(`
                    CREATE TABLE IF NOT EXISTS "${TableNames.USER_ROLES}" (
                        user_id UUID NOT NULL,
                        role_id UUID NOT NULL,
                        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                        PRIMARY KEY (user_id, role_id),
                        CONSTRAINT fk_user_roles_user 
                            FOREIGN KEY (user_id) REFERENCES "${TableNames.USERS}" (_id) ON DELETE CASCADE,
                        CONSTRAINT fk_user_roles_role 
                            FOREIGN KEY (role_id) REFERENCES "${TableNames.ROLES}" (_id) ON DELETE CASCADE
                    );
                `);
                Console.info(`Junction table created: ${TableNames.USER_ROLES}`);
            }

            // Add unique constraint for wallet_accounts (one account per currency per wallet)
            const walletAccountsExists = await this.checkTableExists(TableNames.WALLET_ACCOUNTS);
            if (walletAccountsExists) {
                try {
                    // Check if constraint already exists
                    const constraintCheckQuery = `
                        SELECT constraint_name 
                        FROM information_schema.table_constraints 
                        WHERE table_name = $1 
                        AND constraint_name = 'unique_wallet_currency';
                    `;
                    const { rows } = await this.transactionManager.getClient().query(constraintCheckQuery, [TableNames.WALLET_ACCOUNTS]);
                    
                    if (rows.length === 0) {
                        await this.transactionManager.getClient().query(`
                            ALTER TABLE "${TableNames.WALLET_ACCOUNTS}"
                            ADD CONSTRAINT unique_wallet_currency 
                            UNIQUE (wallet_id, currency_id);
                        `);
                        Console.info(`Unique constraint added to: ${TableNames.WALLET_ACCOUNTS}`);
                    } else {
                        Console.info(`Unique constraint already exists on: ${TableNames.WALLET_ACCOUNTS}`);
                    }
                } catch (error: any) {
                    // Constraint might already exist or table might not exist yet
                    if (!error.message.includes('already exists') && !error.message.includes('does not exist')) {
                        Console.error(error, { message: `Failed to add unique constraint to ${TableNames.WALLET_ACCOUNTS}` });
                    }
                }
            }

            await this.transactionManager.commit();
            Console.info('Junction tables initialized successfully');
        } catch (error: any) {
            await this.transactionManager.rollback();
            Console.error(error, { message: 'Failed to create junction tables' });
            throw new DatabaseError(`Failed to create junction tables: ${error.message}`);
        }
    }

    private async createTableIfNotExists(entity: Function, tableName: string): Promise<void> {
        try {
            const metadata = getEntityMetadata(entity);
            const indexMetaData = getIndexMetadata(entity, tableName);
            Console.info("Entity metadata retrieved", { tableName, columnsCount: metadata.columns.length, constraintsCount: metadata.constraints.length });
            Console.info("Index metadata retrieved", { tableName, indexCount: indexMetaData.length });

            // Check if table exists first
            const tableExistsQuery = `
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_schema = 'public' 
                    AND table_name = $1
                );
            `;
            const { rows } = await this.transactionManager.getClient().query(tableExistsQuery, [tableName]);

            if (rows[0].exists) {
                Console.info(`Table already exists, skipping creation`, { tableName });
                return;
            }

            await this.dropExistingConstraints(tableName);

            const allDefinitions = [
                ...metadata.columns,
                ...metadata.constraints
            ].join(',\n');

            const query = `
                CREATE TABLE IF NOT EXISTS "${tableName}" (
                    ${allDefinitions}
                );`;


            console.log({ query });
            Console.info("Executing table creation query", { tableName });
            await this.transactionManager.getClient().query(query);
            Console.info(`Table initialized successfully`, { tableName });

            // Create indexes after table creation
            if (indexMetaData.length > 0) {
                Console.info(`Creating indexes`, { tableName, indexCount: indexMetaData.length });
                for (const indexStatement of indexMetaData) {
                    Console.info(`Executing index statement`, { indexStatement });
                    await this.transactionManager.getClient().query(indexStatement);
                }
                Console.info(`Indexes created successfully`, { tableName, indexCount: indexMetaData.length });
            }
        } catch (error: any) {
            Console.error(error, { message: `Failed to initialize table`, tableName });
            throw new DatabaseError(`Failed to create table ${tableName}: ${error.message}`);
        }
    }

    private async updateTableSchema(entity: Function, tableName: string): Promise<void> {
        try {
            const metadata = getEntityMetadata(entity);
            const indexMetaData = getIndexMetadata(entity, tableName);
            Console.info("Schema update started", { tableName });

            // Get current table schema
            const currentSchemaQuery = `
                SELECT 
                    column_name, 
                    data_type,
                    is_nullable,
                    column_default
                FROM information_schema.columns 
                WHERE table_name = $1 AND table_schema = 'public';
            `;
            const { rows: currentColumns } = await this.transactionManager.getClient().query(currentSchemaQuery, [tableName]);
            Console.info("Current schema retrieved", { tableName, columnCount: currentColumns.length });

            // Get current indexes
            const currentIndexesQuery = `
                SELECT 
                    i.relname as index_name,
                    a.attname as column_name,
                    ix.indisunique as is_unique
                FROM pg_class t
                JOIN pg_index ix ON t.oid = ix.indrelid
                JOIN pg_class i ON i.oid = ix.indexrelid
                JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
                WHERE t.relname = $1
                AND i.relname NOT LIKE 'pg_%';
            `;
            const { rows: currentIndexes } = await this.transactionManager.getClient().query(currentIndexesQuery, [tableName]);
            Console.info("Current indexes retrieved", { tableName, indexCount: currentIndexes.length });

            // Process each column from metadata
            for (const column of metadata.columns) {
                const columnName = column.split(' ')[0].replace(/"/g, '');
                const columnType = column.split(' ').slice(1).join(' ');

                // Check if column exists (case-insensitive comparison)
                // PostgreSQL's information_schema returns lowercase, but we store with quotes (case-sensitive)
                const existingColumn = currentColumns.find(c => 
                    c.column_name.toLowerCase() === columnName.toLowerCase()
                );

                if (!existingColumn) {
                    // Add new column
                    const addColumnQuery = `ALTER TABLE "${tableName}" ADD COLUMN ${column};`;
                    Console.info(`Adding new column`, { tableName, columnName, columnType });
                    await this.transactionManager.getClient().query(addColumnQuery);
                    Console.info(`Column added successfully`, { tableName, columnName });
                } else {
                    // If the expected type is JSONB but the existing type isn't, attempt a safe type migration.
                    // This is needed for evolving array columns (e.g. TEXT[] -> JSONB).
                    const expectedIsJsonb = columnType.toLowerCase().includes('jsonb');
                    const existingType = String(existingColumn.data_type || '').toLowerCase();
                    if (expectedIsJsonb && existingType !== 'jsonb') {
                        try {
                            // Important: Postgres may fail the TYPE change if the existing DEFAULT can't be cast
                            // (e.g. DEFAULT ARRAY[]::TEXT[]). We drop default first, then set JSONB default after.
                            const spName = `sp_${tableName}_${columnName}_to_jsonb`.replace(/[^a-zA-Z0-9_]/g, '_');
                            await this.transactionManager.getClient().query(`SAVEPOINT ${spName};`);

                            Console.info(`Altering column type to JSONB`, { tableName, columnName, from: existingType });

                            // Drop default if any (safe even if none)
                            await this.transactionManager.getClient().query(
                                `ALTER TABLE "${tableName}" ALTER COLUMN "${columnName}" DROP DEFAULT;`
                            );

                            // Convert column values to JSONB
                            await this.transactionManager.getClient().query(
                                `ALTER TABLE "${tableName}" ALTER COLUMN "${columnName}" TYPE JSONB USING to_jsonb("${columnName}");`
                            );

                            // Re-apply JSONB default if the entity definition includes DEFAULT
                            if (columnType.toLowerCase().includes('default')) {
                                await this.transactionManager.getClient().query(
                                    `ALTER TABLE "${tableName}" ALTER COLUMN "${columnName}" SET DEFAULT '[]'::jsonb;`
                                );
                            }

                            await this.transactionManager.getClient().query(`RELEASE SAVEPOINT ${spName};`);
                            Console.info(`Column type altered successfully`, { tableName, columnName });
                        } catch (alterError: any) {
                            try {
                                const spName = `sp_${tableName}_${columnName}_to_jsonb`.replace(/[^a-zA-Z0-9_]/g, '_');
                                await this.transactionManager.getClient().query(`ROLLBACK TO SAVEPOINT ${spName};`);
                                await this.transactionManager.getClient().query(`RELEASE SAVEPOINT ${spName};`);
                            } catch {
                                // ignore rollback-to-savepoint failures
                            }
                            Console.error(alterError, { message: 'Failed to alter column type to JSONB', tableName, columnName });
                            // Don't throw by default; continue schema updates for other columns.
                        }
                    } else {
                        Console.info(`Column already exists, skipping`, { tableName, columnName: existingColumn.column_name });
                    }
                }
                // Note: We're not modifying existing columns to avoid data loss
            }

            // Create or update indexes
            if (indexMetaData.length > 0) {
                Console.info(`Updating indexes`, { tableName, indexCount: indexMetaData.length });
                for (const indexStatement of indexMetaData) {
                    Console.info(`Executing index statement`, { indexStatement });
                    await this.transactionManager.getClient().query(indexStatement);
                }
                Console.info(`Indexes updated successfully`, { tableName });
            }

            Console.info(`Schema update completed`, { tableName });
        } catch (error: any) {
            Console.error(error, { message: `Failed to update schema`, tableName });
            throw new DatabaseError(`Failed to update schema for ${tableName}: ${error.message}`);
        }
    }

    private async dropExistingConstraints(tableName: string): Promise<void> {
        try {
            // Get all constraints for the table
            const constraintsQuery = `
                SELECT conname, contype
                FROM pg_constraint
                JOIN pg_namespace ON pg_constraint.connamespace = pg_namespace.oid
                JOIN pg_class ON pg_constraint.conrelid = pg_class.oid
                WHERE relname = $1 AND nspname = 'public';
            `;

            const { rows: constraints } = await this.transactionManager.getClient()
                .query(constraintsQuery, [tableName]);

            // Drop each constraint
            for (const constraint of constraints) {
                const dropQuery = `
                    ALTER TABLE "${tableName}"
                    DROP CONSTRAINT IF EXISTS "${constraint.conname}" CASCADE;
                `;
                await this.transactionManager.getClient().query(dropQuery);
                console.log(`Dropped constraint ${constraint.conname} from ${tableName}`);
            }
        } catch (error: any) {
            console.error(`Failed to drop constraints for ${tableName}:`, error);
            throw new DatabaseError(`Failed to drop constraints: ${error.message}`);
        }
    }

    private async seedDataToDatabase(tableName: string): Promise<void> {
        // Generic seeding logic or empty
    }

    private async checkTableExists(tableName: string): Promise<boolean> {
        try {
            Console.info(`Checking if table exists`, { tableName });
            const query = `
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_schema = 'public' 
                    AND table_name = $1
                );
            `;
            const { rows } = await this.transactionManager.getClient().query(query, [tableName]);
            const exists = rows[0].exists;
            Console.info(`Table existence check result`, { tableName, exists });
            return exists;
        } catch (error: any) {
            Console.error(error, { message: `Failed to check if table exists`, tableName });
            throw new DatabaseError(`Failed to check if table ${tableName} exists: ${error.message}`);
        }
    }

    // PostGIS removed as it might be specific to previous project (Solar mapping), 
    // or kept if we consider "Locations" a generic feature. 
    // Previous plan didn't mention removing it, but InstallerService used it. 
    // I'll leave it out for a pure generic boilerplate unless Location-Based features are desired.
    // Given the prompt "final scheming", a clean boilerplate is better.
    // But wait, "AddressProof" in documents implies location.
    // I will exclude PostGIS init for simplicity in the boilerplate version.

}