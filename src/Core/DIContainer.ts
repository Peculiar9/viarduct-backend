import { Container } from 'inversify';
import { APP_NAME, TYPES } from './Types/Constants';
import { UserRepository } from '../Infrastructure/Repository/SQL/users/UserRepository';
import { TransactionManager } from '../Infrastructure/Repository/SQL/Abstractions/TransactionManager';
import { ConnectionPoolManager } from '../Infrastructure/Repository/SQL/Abstractions/ConnectionPoolManager';
import { AuthenticationService } from '../Infrastructure/Services/AuthenticationService';
import { RegistrationService } from '../Infrastructure/Services/RegistrationService';
import { UserProfileService } from '../Infrastructure/Services/UserProfileService';
import { TokenService } from '../Infrastructure/Services/TokenService';
import { AuthHelpers } from '../Infrastructure/Services/helpers/AuthHelpers';
import { ITokenService } from './Application/Interface/Services/ITokenService';
import { AuthMiddleware } from '../Middleware/AuthMiddleware';
import { getDatabaseConfig } from '../Infrastructure/Database/DatabaseConfig';
import { PoolOptions } from 'pg';
import { UserService } from '../Infrastructure/Services/UserService';
import { SMSService } from '../Infrastructure/Services/SMSService';
import { IAWSHelper } from './Application/Interface/Services/IAWSHelper';
import { AWSHelper } from '../Infrastructure/Services/external-api-services/AWSHelper';
import { VerificationRepository } from '../Infrastructure/Repository/SQL/auth/VerificationRepository';
import { OTPService } from '../Infrastructure/Services/OTPService';
import { DatabaseInitializer } from '../Infrastructure/Config/DatabaseInitializer';
import { IAuthService } from './Application/Interface/Services/IAuthService';
import { IAuthenticationService } from './Application/Interface/Services/IAuthenticationService';
import { IRegistrationService } from './Application/Interface/Services/IRegistrationService';
import { IUserProfileService } from './Application/Interface/Services/IUserProfileService';
import { IEmailService } from './Application/Interface/Services/IEmailService';
import { EmailService } from '../Infrastructure/Services/EmailService';
import { LinkedAccountsRepository } from '../Infrastructure/Repository/SQL/auth/LinkedAccountsRepository';
import { FileManagerRepository } from '../Infrastructure/Repository/SQL/files/FileManagerRepository';
import { FileService } from '../Infrastructure/Services/FileService';
import { IFileService } from './Application/Interface/Services/IFileService';
import { ISMSService } from './Application/Interface/Services/ISMSService';
import { IOTPService } from './Application/Interface/Services/IOTPService';
import { AuthServiceHelper } from '../Infrastructure/Services/helpers/AuthServiceHelper';
import { AWSFileFormatterHelper } from '../Infrastructure/Services/external-api-services/AWSFileFormatterHelper';
import { IAuthUseCase } from './Application/Interface/UseCases/IAuthUseCase';
import { AuthUseCase } from './Application/UseCases/AuthUseCase';
import { IAccountUseCase } from './Application/Interface/UseCases/IAccountUseCase';
import { AccountUseCase } from './Application/UseCases/AccountUseCase';
import { UserKYCRepository } from '../Infrastructure/Repository/SQL/auth/UserKYCRepository';
import { IMediaService } from './Application/Interface/Services/IMediaService';
import { CloudinaryService } from '../Infrastructure/Services/media/CloudinaryService';
import { ITwilioService } from './Application/Interface/Services/ITwilioService';
import { TwilioService } from '../Infrastructure/Services/TwilioService';
import { ITwilioEmailService } from './Application/Interface/Services/ITwilioEmailService';
import { TwilioEmailService } from '../Infrastructure/Services/TwilioEmailService';
import { SMTPEmailService } from '../Infrastructure/Services/external-api-services/SMTPEmailService';
import { RoleRepository } from '../Infrastructure/Repository/SQL/roles/RoleRepository';
import { PermissionRepository } from '../Infrastructure/Repository/SQL/permissions/PermissionRepository';
import { IRoleUseCase } from './Application/Interface/UseCases/IRoleUseCase';
import { IKYCUseCase } from './Application/Interface/UseCases/IKYCUseCase';
import { KYCUseCase } from './Application/UseCases/KYCUseCase';
import { RoleUseCase } from './Application/UseCases/RoleUseCase';
import { IPermissionUseCase } from './Application/Interface/UseCases/IPermissionUseCase';
import { PermissionUseCase } from './Application/UseCases/PermissionUseCase';
import { RolePermissionSeeder } from '../Infrastructure/Config/RolePermissionSeeder';
import { UserSeeder } from '../Infrastructure/Config/UserSeeder';
import { CurrencyRepository } from '../Infrastructure/Repository/SQL/wallet/CurrencyRepository';
import { CurrencySeeder } from '../Infrastructure/Config/CurrencySeeder';
import { WalletRepository } from '../Infrastructure/Repository/SQL/wallet/WalletRepository';
import { WalletAccountRepository } from '../Infrastructure/Repository/SQL/wallet/WalletAccountRepository';
import { WalletService } from '../Infrastructure/Services/WalletService';
import { IWalletService } from './Application/Interface/Services/IWalletService';
import { PaystackService } from '../Infrastructure/Services/payment/PaystackService';
import { IPaystackService } from './Application/Interface/Services/IPaystackService';
import { PaymentUseCase } from './Application/UseCases/PaymentUseCase';
import { IPaymentUseCase } from './Application/UseCases/PaymentUseCase';
import { TransactionRepository } from '../Infrastructure/Repository/SQL/payment/TransactionRepository';
import { HttpClientFactory } from '../Infrastructure/Http/HttpClientFactory';
import { BitcoinWalletService } from '../Infrastructure/Services/bitcoin/BitcoinWalletService';
import { IBitcoinWalletService } from './Application/Interface/Services/IBitcoinWalletService';
import { BlockchainService } from '../Infrastructure/Services/bitcoin/BlockchainService';
import { IBlockchainService } from './Application/Interface/Services/IBlockchainService';
import { TradingRateRepository } from '../Infrastructure/Repository/SQL/trading/TradingRateRepository';
import { ITradingRateRepository } from './Application/Interface/Repositories/ITradingRateRepository';
import { TradingRateService } from '../Infrastructure/Services/trading/TradingRateService';
import { ITradingRateService } from './Application/Interface/Services/ITradingRateService';
import { BitcoinTransactionRepository } from '../Infrastructure/Repository/SQL/bitcoin/BitcoinTransactionRepository';
import { BitcoinWebhookService } from '../Infrastructure/Services/bitcoin/BitcoinWebhookService';
import { IBitcoinWebhookService } from './Application/Interface/Services/IBitcoinWebhookService';
import { TradingOrderRepository } from '../Infrastructure/Repository/SQL/trading/TradingOrderRepository';
import { ITradingOrderRepository } from './Application/Interface/Repositories/ITradingOrderRepository';
import { TradingOrderService } from '../Infrastructure/Services/trading/TradingOrderService';
import { ITradingOrderService } from './Application/Interface/Services/ITradingOrderService';
import { OrderCompletionJob } from '../Infrastructure/Services/trading/OrderCompletionJob';
import { IOrderCompletionJob } from './Application/Interface/Services/IOrderCompletionJob';
import { BitcoinTransactionService } from '../Infrastructure/Services/bitcoin/BitcoinTransactionService';
import { IBitcoinTransactionService } from './Application/Interface/Services/IBitcoinTransactionService';
import { UTXORepository } from '../Infrastructure/Repository/SQL/UTXORepository';
import { IUTXORepository } from './Application/Interface/Repositories/IUTXORepository';
import { UTXOManagerService } from '../Infrastructure/Services/bitcoin/UTXOManagerService';
import { IUTXOManagerService } from './Application/Interface/Services/IUTXOManagerService';
import { WithdrawalRequestRepository } from '../Infrastructure/Repository/SQL/withdrawal/WithdrawalRequestRepository';
import { IWithdrawalRequestRepository } from './Application/Interface/Repositories/IWithdrawalRequestRepository';
import { UserTransactionPinRepository } from '../Infrastructure/Repository/SQL/withdrawal/UserTransactionPinRepository';
import { IUserTransactionPinRepository } from './Application/Interface/Repositories/IUserTransactionPinRepository';
import { WithdrawalService } from '../Infrastructure/Services/withdrawal/WithdrawalService';
import { IWithdrawalService } from './Application/Interface/Services/IWithdrawalService';
import { GiftCardSubmissionRepository } from '../Infrastructure/Repository/SQL/giftcard/GiftCardSubmissionRepository';
import { IGiftCardSubmissionRepository } from './Application/Interface/Repositories/IGiftCardSubmissionRepository';
import { GiftCardService } from '../Infrastructure/Services/giftcard/GiftCardService';
import { IGiftCardService } from './Application/Interface/Services/IGiftCardService';
import { CardRepository } from '../Infrastructure/Repository/SQL/giftcard/CardRepository';
import { ICardRepository } from './Application/Interface/Repositories/ICardRepository';
import { CardService } from '../Infrastructure/Services/giftcard/CardService';
import { ICardService } from './Application/Interface/Services/ICardService';
import { CardSeeder } from '../Infrastructure/Config/CardSeeder';


/**
 * Container for dependency injection configuration
 * Uses interface bindings for better decoupling and testability
 */
export class DIContainer {
    private static containerInstance: Container;

    private constructor() { }

    public static getInstance(): Container {
        if (!DIContainer.containerInstance) {
            DIContainer.containerInstance = new Container();
            DIContainer.resolveDependencies();
        }
        return DIContainer.containerInstance;
    }

    private static resolveDependencies(): void {
        const container = DIContainer.containerInstance;

        // Load database config
        const config = getDatabaseConfig();

        // Create PoolOptions
        // If connectionString is provided, use only that (pg doesn't work well with both)
        // For Supabase, we need both sslmode in URL and SSL config with rejectUnauthorized: false
        const poolOptions: PoolOptions = config.connectionString
            ? {
                connectionString: config.connectionString,
                max: config.max,
                idleTimeoutMillis: config.idleTimeoutMillis,
                connectionTimeoutMillis: config.connectionTimeoutMillis,
                // Pass SSL config to allow self-signed certificates (needed for Supabase)
                ssl: config.ssl,
                maxUses: 7500,
                allowExitOnIdle: true,
                maxLifetimeSeconds: 3600
            }
            : {
                user: config.user,
                password: config.password,
                host: config.host,
                port: config.port,
                database: config.database,
                max: config.max,
                idleTimeoutMillis: config.idleTimeoutMillis,
                connectionTimeoutMillis: config.connectionTimeoutMillis,
                ssl: config.ssl,
                maxUses: 7500,
                allowExitOnIdle: true,
                maxLifetimeSeconds: 3600
            };

        // Infrastructure layer
        container.bind<ConnectionPoolManager>(TYPES.ConnectionPoolManager)
            .toDynamicValue(() => new ConnectionPoolManager(poolOptions))
            .inSingletonScope();

        // Helpers
        container.bind<AWSFileFormatterHelper>(TYPES.AWSFileFormatterHelper).to(AWSFileFormatterHelper).inSingletonScope();

        // HTTP Client Factory
        container.bind<HttpClientFactory>(TYPES.HttpClientFactory).to(HttpClientFactory).inSingletonScope();

        container.bind<TransactionManager>(TYPES.TransactionManager)
            .toDynamicValue((context) => {
                const poolManager = context.container.get<ConnectionPoolManager>(TYPES.ConnectionPoolManager);
                return new TransactionManager(poolManager);
            }).inRequestScope();

        container.bind<DatabaseInitializer>(TYPES.DatabaseInitializer).to(DatabaseInitializer).inRequestScope();
        container.bind<RolePermissionSeeder>(TYPES.RolePermissionSeeder).to(RolePermissionSeeder).inRequestScope();
        container.bind<UserSeeder>(TYPES.UserSeeder).to(UserSeeder).inRequestScope();
        container.bind<CurrencySeeder>(TYPES.CurrencySeeder).to(CurrencySeeder).inRequestScope();

        // Repositories
        container.bind<UserRepository>(TYPES.UserRepository).to(UserRepository);
        container.bind<UserKYCRepository>(TYPES.UserKYCRepository).to(UserKYCRepository).inRequestScope();
        container.bind<LinkedAccountsRepository>(TYPES.LinkedAccountsRepository).to(LinkedAccountsRepository).inRequestScope();
        container.bind<FileManagerRepository>(TYPES.FileManagerRepository).to(FileManagerRepository).inRequestScope();
        container.bind<VerificationRepository>(TYPES.VerificationRepository).to(VerificationRepository).inRequestScope();
        container.bind<RoleRepository>(TYPES.RoleRepository).to(RoleRepository).inRequestScope();
        container.bind<PermissionRepository>(TYPES.PermissionRepository).to(PermissionRepository).inRequestScope();
        container.bind<CurrencyRepository>(TYPES.CurrencyRepository).to(CurrencyRepository).inRequestScope();
        container.bind<WalletRepository>(TYPES.WalletRepository).to(WalletRepository).inRequestScope();
        container.bind<WalletAccountRepository>(TYPES.WalletAccountRepository).to(WalletAccountRepository).inRequestScope();
        container.bind<TransactionRepository>(TYPES.TransactionRepository).to(TransactionRepository).inRequestScope();
        container.bind<ITradingRateRepository>(TYPES.TradingRateRepository).to(TradingRateRepository).inRequestScope();
        container.bind<ITradingOrderRepository>(TYPES.TradingOrderRepository).to(TradingOrderRepository).inRequestScope();
        container.bind<IUTXORepository>(TYPES.UTXORepository).to(UTXORepository).inRequestScope();
        container.bind<IUTXOManagerService>(TYPES.UTXOManagerService).to(UTXOManagerService).inRequestScope();
        container.bind<IWithdrawalRequestRepository>(TYPES.WithdrawalRequestRepository).to(WithdrawalRequestRepository).inRequestScope();
        container.bind<IUserTransactionPinRepository>(TYPES.UserTransactionPinRepository).to(UserTransactionPinRepository).inRequestScope();
        container.bind<IGiftCardSubmissionRepository>(TYPES.GiftCardSubmissionRepository).to(GiftCardSubmissionRepository).inRequestScope();
        container.bind<IWithdrawalService>(TYPES.WithdrawalService).to(WithdrawalService).inRequestScope();
        container.bind<IGiftCardService>(TYPES.GiftCardService).to(GiftCardService).inRequestScope();
        container.bind<ICardRepository>(TYPES.CardRepository).to(CardRepository).inRequestScope();
        container.bind<ICardService>(TYPES.CardService).to(CardService).inRequestScope();
        container.bind<CardSeeder>(TYPES.CardSeeder).to(CardSeeder).inRequestScope();
        container.bind<AuthServiceHelper>(TYPES.AuthServiceHelper).to(AuthServiceHelper).inRequestScope();

        // Use Cases
        container.bind<IAuthUseCase>(TYPES.AuthUseCase).to(AuthUseCase).inRequestScope();
        container.bind<IAccountUseCase>(TYPES.AccountUseCase).to(AccountUseCase).inRequestScope();
        container.bind<IRoleUseCase>(TYPES.RoleUseCase).to(RoleUseCase).inRequestScope();
        container.bind<IPermissionUseCase>(TYPES.PermissionUseCase).to(PermissionUseCase).inRequestScope();
        container.bind<IKYCUseCase>(TYPES.KYCUseCase).to(KYCUseCase).inRequestScope();
        container.bind<IPaymentUseCase>(TYPES.PaymentUseCase).to(PaymentUseCase).inRequestScope();

        // Middleware
        container.bind<AuthMiddleware>(TYPES.AuthMiddleware).to(AuthMiddleware).inRequestScope();

        // Services
        container.bind<UserService>(TYPES.UserService).to(UserService).inRequestScope();
        container.bind<IFileService>(TYPES.FileService).to(FileService).inRequestScope();
        container.bind<ISMSService>(TYPES.SMSService).to(SMSService).inRequestScope();
        container.bind<IOTPService>(TYPES.OTPService).to(OTPService).inRequestScope();
        container.bind<IWalletService>(TYPES.WalletService).to(WalletService).inRequestScope();
        container.bind<IBitcoinWalletService>(TYPES.BitcoinWalletService).to(BitcoinWalletService).inRequestScope();
        container.bind<IBlockchainService>(TYPES.BlockchainService).to(BlockchainService).inRequestScope();
        container.bind<IPaystackService>(TYPES.PaystackService).to(PaystackService).inRequestScope();
        container.bind<ITradingRateService>(TYPES.TradingRateService).to(TradingRateService).inRequestScope();
        container.bind<ITradingOrderService>(TYPES.TradingOrderService).to(TradingOrderService).inRequestScope();

        // Repositories
        container.bind<BitcoinTransactionRepository>(TYPES.BitcoinTransactionRepository).to(BitcoinTransactionRepository).inRequestScope();
        // Services
        container.bind<IBitcoinWebhookService>(TYPES.BitcoinWebhookService).to(BitcoinWebhookService).inRequestScope();
        container.bind<IBitcoinTransactionService>(TYPES.BitcoinTransactionService).to(BitcoinTransactionService).inRequestScope();
        container.bind<IOrderCompletionJob>(TYPES.OrderCompletionJob).to(OrderCompletionJob).inSingletonScope();
        container.bind<IEmailService>(TYPES.EmailService).to(EmailService).inRequestScope();

        container.bind<ITokenService>(TYPES.TokenService).to(TokenService).inRequestScope();
        container.bind<AuthHelpers>(TYPES.AuthHelpers).to(AuthHelpers).inRequestScope();

        // Specialized Auth Services
        container.bind<IAuthenticationService>(TYPES.AuthenticationService).to(AuthenticationService).inRequestScope();
        container.bind<IRegistrationService>(TYPES.RegistrationService).to(RegistrationService).inRequestScope();
        container.bind<IUserProfileService>(TYPES.UserProfileService).to(UserProfileService).inRequestScope();
        container.bind<IAWSHelper>(TYPES.AWSHelper).to(AWSHelper).inRequestScope();

        // Configuration bindings
        // Google
        container.bind<string>(TYPES.GOOGLE_CLIENT_ID).toConstantValue(process.env.GOOGLE_CLIENT_ID || '');
        container.bind<string>(TYPES.GOOGLE_CLIENT_SECRET).toConstantValue(process.env.GOOGLE_CLIENT_SECRET || '');
        container.bind<string>(TYPES.GOOGLE_REDIRECT_URI).toConstantValue(process.env.GOOGLE_REDIRECT_URI || '');

        // Cloudinary
        container.bind<string>(TYPES.CLOUDINARY_CLOUD_NAME).toConstantValue(process.env.CLOUDINARY_CLOUD_NAME || '');
        container.bind<string>(TYPES.CLOUDINARY_API_KEY).toConstantValue(process.env.CLOUDINARY_API_KEY || '');
        container.bind<string>(TYPES.CLOUDINARY_API_SECRET).toConstantValue(process.env.CLOUDINARY_API_SECRET || '');
        container.bind<IMediaService>(TYPES.MediaService).to(CloudinaryService).inRequestScope();

        // Twilio
        container.bind<string>(TYPES.TWILIO_ACCOUNT_SID).toConstantValue(process.env.TWILIO_ACCOUNT_SID || '');
        container.bind<string>(TYPES.TWILIO_AUTH_TOKEN).toConstantValue(process.env.TWILIO_AUTH_TOKEN || '');
        container.bind<string>(TYPES.TWILIO_VERIFY_SERVICE_SID).toConstantValue(process.env.TWILIO_VERIFY_SERVICE_SID || '');
        container.bind<string>(TYPES.TWILIO_PHONE_NUMBER).toConstantValue(process.env.TWILIO_PHONE_NUMBER || '');
        container.bind<string>(TYPES.TWILIO_WHATSAPP_NUMBER).toConstantValue(process.env.TWILIO_WHATSAPP_NUMBER || '');
        container.bind<ITwilioService>(TYPES.TwilioService).to(TwilioService).inRequestScope();

        // Email Service Provider Selection
        const emailProvider = process.env.EMAIL_PROVIDER?.toLowerCase() || 'smtp';

        if (emailProvider === 'sendgrid') {
            container.bind<string>(TYPES.SENDGRID_API_KEY).toConstantValue(process.env.SENDGRID_API_KEY || '');
            container.bind<string>(TYPES.SENDGRID_FROM_EMAIL).toConstantValue(process.env.SENDGRID_FROM_EMAIL || `noreply@${APP_NAME}.com`);
            container.bind<ITwilioEmailService>(TYPES.TwilioEmailService).to(TwilioEmailService).inSingletonScope();
            console.log('📧 Email Provider: SendGrid');

            // Initialize email service to trigger verification
            try {
                container.get<ITwilioEmailService>(TYPES.TwilioEmailService);
            } catch (error: any) {
                console.warn('⚠️ Failed to initialize SendGrid email service:', error.message);
            }
        } else if (emailProvider === 'smtp') {
            container.bind<ITwilioEmailService>(TYPES.TwilioEmailService).to(SMTPEmailService).inSingletonScope();
            console.log('📧 Email Provider: SMTP');

            // Initialize email service to trigger verification
            try {
                container.get<ITwilioEmailService>(TYPES.TwilioEmailService);
            } catch (error: any) {
                console.warn('⚠️ Failed to initialize SMTP email service:', error.message);
            }
        } else {
            // Default to SMTP if invalid provider
            console.warn(`⚠️ Unknown EMAIL_PROVIDER: ${emailProvider}. Defaulting to SMTP.`);
            container.bind<ITwilioEmailService>(TYPES.TwilioEmailService).to(SMTPEmailService).inSingletonScope();
            console.log('📧 Email Provider: SMTP (default)');

            // Initialize email service to trigger verification
            try {
                container.get<ITwilioEmailService>(TYPES.TwilioEmailService);
            } catch (error: any) {
                console.warn('⚠️ Failed to initialize SMTP email service:', error.message);
            }
        }

        console.log("All dependencies bound!!")
    }
}
