import 'reflect-metadata';
import cors from 'cors';
import bodyParser from 'body-parser';
import { Container } from 'inversify';
import { InversifyExpressServer } from 'inversify-express-utils';
import { DatabaseService } from './Infrastructure/Database/DatabaseService';
import { getRouteInfo } from 'inversify-express-utils';

import './Controllers/InitController';
import './Controllers/ApiBaseController';
import './Controllers/auth/AccountController';
import './Controllers/auth/AuthController';
import './Controllers/media/MediaController';
import './Controllers/role/RoleController'; 
import './Controllers/permission/PermissionController';
import './Controllers/kyc/KYCController';
import './Controllers/kyc/AdminKYCController';
import './Controllers/payment/PaystackPaymentController';
import './Controllers/wallet/BitcoinWalletController';
import './Controllers/wallet/EthereumWalletController';
import './Controllers/wallet/PlatformWalletController';
import './Controllers/trading/PublicTradingRateController';
import './Controllers/trading/TradingRateController';
import './Controllers/trading/TradingOrderController';
import './Controllers/trading/AdminTradingOrderController';
import './Controllers/trading/TradeIntentController';
import './Controllers/trading/AdminTradeIntentController';
import './Controllers/bank/BankAccountController';
import './Controllers/trading/AdminCryptoAddressController';
import './Controllers/trading/AdminPayoutConsentController';
import './Controllers/me/MeController';
import './Controllers/me/NotificationPreferencesController';
import './Controllers/me/DeviceTokenController';
import './Controllers/withdrawal/WithdrawalController';
import './Controllers/currency/CurrencyController';
import './Controllers/card/CardController';
import './Controllers/giftcard/GiftCardController';
import './Controllers/giftcard/AdminGiftCardController';
import './Controllers/card/AdminCardController';
import './Controllers/bitcoin/BitcoinWebhookController';
import './Controllers/dashboard/AdminDashboardController';
import './Controllers/notification/NotificationController';
import './Controllers/notification/AdminNotificationController';
import './Controllers/dispute/DisputeController';
import './Controllers/dispute/AdminDisputeController';
import './Controllers/chat/ChatController';
import './Controllers/chat/AdminChatController';
import './Controllers/system-announcements/AdminSystemAnnouncementController';
import './Controllers/user/AdminUserController';

import { DIContainer } from './Core/DIContainer';
import { TYPES } from './Core/Types/Constants';
import { IOrderCompletionJob } from './Core/Application/Interface/Services/IOrderCompletionJob';
import { PlatformBtcSweepJob } from './Infrastructure/Services/bitcoin/PlatformBtcSweepJob';
import { PlatformEthSweepJob } from './Infrastructure/Services/ethereum/PlatformEthSweepJob';
import { TradeIntentSweepJob } from './Infrastructure/Services/trading/TradeIntentSweepJob';

import express, { Response, Request, NextFunction } from 'express';
import path from 'path';
import { Console } from './Infrastructure/Utils/Console';
import { LoggingConfig } from './Infrastructure/Config/LoggingConfig';

class App {
    public app: express.Application;
    private container: Container;

    constructor() {
        this.container = DIContainer.getInstance(); 
        this.app = express();
    }

    public async initialize(): Promise<express.Application> {
        try {
            
            // Initialize logging first
            LoggingConfig.getInstance().initialize(this.app);
            Console.info('✅ Logging initialized successfully');
            
            // Initialize database
            await DatabaseService.initialize(this.container);
            Console.info('✅ Database initialized successfully');

            // Setup express server with inversify
            const server = new InversifyExpressServer(this.container);
            
            server.setConfig((app: express.Application) => {
                // CORS must be first to allow preflight requests
                app.use(cors());
                
                // Body parser must be configured before other middleware
                // Use express.json() for JSON bodies (works for all HTTP methods including PATCH)
                app.use(express.json({ limit: '10mb' }));
                app.use(express.urlencoded({ extended: true, limit: '10mb' }));
                
                // Also use bodyParser as fallback
                app.use(bodyParser.json({ limit: '10mb', type: 'application/json' }));
                app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));
                
                app.set('view engine', 'ejs');
                app.set('views', path.join(__dirname, '..', 'src', 'static'));
            });

            this.app = server.build();
            this.initErrorHandling();
            this.setupGracefulShutdown();

            // Start background jobs
            this.startBackgroundJobs();

            // Log route information
            const routeInfo = getRouteInfo(this.container);
            console.log('Registered Routes:', JSON.stringify(routeInfo, null, 2));

            return this.app; 
        } catch (error: any) {
            const errorMessage = error.message || 'Unknown error';
            Console.error(error, {message: errorMessage});
            throw error;
        }
    }

    private initErrorHandling() {
        // 404 handler - must be added after all routes are defined
        this.app.use((req: Request, res: Response, next: NextFunction) => {
            // Import and use the NotFoundMiddleware
            const { NotFoundMiddleware } = require('./Middleware/NotFoundMiddleware');
            return NotFoundMiddleware.handleNotFound(req, res, next);
        });

        // Global error handler - must be the last middleware
        this.app.use((err: any, req: Request, res: Response, next: NextFunction) => {
            // Import and use the ErrorHandlerMiddleware
            const { ErrorHandlerMiddleware } = require('./Middleware/ErrorHandlerMiddleware');
            return ErrorHandlerMiddleware.handleError(err, req, res, next);
        });
    }

    private startBackgroundJobs() {
        try {
            // Start order completion job
            const orderCompletionJob = this.container.get<IOrderCompletionJob>(TYPES.OrderCompletionJob);
            orderCompletionJob.start();

            // Start platform BTC sweep job (custodial consolidation)
            const btcSweepJob = this.container.get<PlatformBtcSweepJob>(TYPES.PlatformBtcSweepJob);
            btcSweepJob.start();

            const ethSweepJob = this.container.get<PlatformEthSweepJob>(TYPES.PlatformEthSweepJob);
            ethSweepJob.start();

            const tradeIntentSweepJob = this.container.get<TradeIntentSweepJob>(TYPES.TradeIntentSweepJob);
            tradeIntentSweepJob.start();

            Console.info('✅ Background jobs started successfully');
        } catch (error: any) {
            Console.error(error, { message: 'Failed to start background jobs' });
            // Don't throw - allow server to start even if background jobs fail
        }
    }

    private setupGracefulShutdown() {
        const shutdown = async () => {
            console.log('Shutting down gracefully...');
            
            // Stop background jobs
            try {
                const orderCompletionJob = this.container.get<IOrderCompletionJob>(TYPES.OrderCompletionJob);
                orderCompletionJob.stop();
                const btcSweepJob = this.container.get<PlatformBtcSweepJob>(TYPES.PlatformBtcSweepJob);
                btcSweepJob.stop();
                const ethSweepJob = this.container.get<PlatformEthSweepJob>(TYPES.PlatformEthSweepJob);
                ethSweepJob.stop();
                const tradeIntentSweepJob = this.container.get<TradeIntentSweepJob>(TYPES.TradeIntentSweepJob);
                tradeIntentSweepJob.stop();
                // Console.info('Background jobs stopped');
            } catch (error: any) {
                Console.error(error, { message: 'Error stopping background jobs' });
            }
            
            // await DatabaseService.shutdown(this.container);
            process.exit(0);
        };

        process.on('SIGTERM', shutdown);
        process.on('SIGINT', shutdown);
    }
}

export default new App();