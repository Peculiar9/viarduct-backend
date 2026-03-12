import { Container, injectable } from 'inversify';
import { ConnectionPoolManager } from '../Repository/SQL/Abstractions/ConnectionPoolManager';
import { DatabaseError } from '../../Core/Application/Error/AppError';
import { TYPES } from '../../Core/Types/Constants';
import { DatabaseInitializer } from '../Config/DatabaseInitializer';
import { RolePermissionSeeder } from '../Config/RolePermissionSeeder';
import { UserSeeder } from '../Config/UserSeeder';
import { CurrencySeeder } from '../Config/CurrencySeeder';
import { CardSeeder } from '../Config/CardSeeder';
import { IWalletService } from '../../Core/Application/Interface/Services/IWalletService';
import { WalletRepository } from '../Repository/SQL/wallet/WalletRepository';
import { Console } from '../Utils/Console';

@injectable()
export class DatabaseService {
    static async initialize(container: Container): Promise<void> {
        try {
            // Get the pool manager from the container
            // DIContainer has already configured this with proper database config
            const poolManager = container.get<ConnectionPoolManager>(TYPES.ConnectionPoolManager);
            
            // Test connection
            const client = await poolManager.getConnection();
            await client.query('SELECT NOW()');
            await poolManager.releaseConnection(client);

            // Initialize tables
            const databaseInitializer = container.get<DatabaseInitializer>(TYPES.DatabaseInitializer);
            await databaseInitializer.initializeTables();
            
            // Seed currencies (must be before wallets)
            const currencySeeder = container.get<CurrencySeeder>(TYPES.CurrencySeeder);
            await currencySeeder.seed();

            // Seed gift card catalog
            const cardSeeder = container.get<CardSeeder>(TYPES.CardSeeder);
            await cardSeeder.seed();
            
            // Seed roles and permissions
            const rolePermissionSeeder = container.get<RolePermissionSeeder>(TYPES.RolePermissionSeeder);
            await rolePermissionSeeder.seed();
            
            // Seed users (must be after roles are seeded)
            const userSeeder = container.get<UserSeeder>(TYPES.UserSeeder);
            await userSeeder.seed();
            
            // Initialize platform wallet (after currencies and users are seeded)
            const walletService = container.get<IWalletService>(TYPES.WalletService);
            const walletRepository = container.get<WalletRepository>(TYPES.WalletRepository);
            try {
                const existingPlatformWallet = await walletRepository.findPlatformWallet();
                if (!existingPlatformWallet) {
                    await walletService.initializePlatformWallet();
                    Console.info('Platform wallet initialized successfully');
                } else {
                    Console.info('Platform wallet already exists, skipping initialization');
                }
            } catch (error: any) {
                Console.error(error, { message: 'Failed to initialize platform wallet' });
                // Don't throw - platform wallet can be initialized later
            }
            
        } catch (error: any) {
            Console.error(error, { 
                message: 'Database initialization error:', 
                context: 'DatabaseService.initialize',
                error: error instanceof Error ? error.stack : String(error)
            });
            throw new DatabaseError(`Failed to initialize database: ${error.message}`);
        }
    }

    static async shutdown(container: Container): Promise<void> {
        try {
            Console.info('Starting database shutdown...', {
                context: 'DatabaseService.shutdown'
            });

            const poolManager = container.get<ConnectionPoolManager>(TYPES.ConnectionPoolManager);

            // Get current pool metrics before shutdown
            const metrics = poolManager.getMetricsSummary();
            Console.info('Pool metrics before shutdown:', {
                context: 'DatabaseService.shutdown',
                activeConnections: metrics.activeLeasedConnections,
                totalConnections: metrics.totalConnectionsCreated
            });

            // Wait up to 10 seconds for active connections to finish
            const maxWaitTime = 10000;
            const startTime = Date.now();
            
            while (metrics.activeLeasedConnections > 0 && (Date.now() - startTime) < maxWaitTime) {
                await new Promise(resolve => setTimeout(resolve, 500));
                const updatedMetrics = poolManager.getMetricsSummary();
                if (updatedMetrics.activeLeasedConnections !== metrics.activeLeasedConnections) {
                    Console.info('Active connections changed during shutdown:', {
                        context: 'DatabaseService.shutdown',
                        activeConnections: updatedMetrics.activeLeasedConnections
                    });
                }
            }

            // Final dispose of the pool
            await poolManager.dispose();
            
            Console.info('Database connections closed successfully', {
                context: 'DatabaseService.shutdown',
                shutdownDurationMs: Date.now() - startTime  
            });
        } catch (error: any) {
            Console.error(error, {
                context: 'DatabaseService.shutdown',
                message: 'Error during database shutdown'
            });
            throw error;
        }
    }
}