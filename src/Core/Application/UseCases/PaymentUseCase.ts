import { inject, injectable } from 'inversify';
import { TYPES } from '../../Types/Constants';
import { IPaystackService } from '../Interface/Services/IPaystackService';
import { IWalletService } from '../Interface/Services/IWalletService';
import { TransactionRepository } from '../../../Infrastructure/Repository/SQL/payment/TransactionRepository';
import { UserRepository } from '../../../Infrastructure/Repository/SQL/users/UserRepository';
import { TransactionManager } from '../../../Infrastructure/Repository/SQL/Abstractions/TransactionManager';
import { 
    InitializePaymentDTO, 
    VerifyPaymentDTO,
    VerifyInitializationDTO,
    PaymentInitializeResponseDTO,
    PaymentVerifyResponseDTO,
    VerifyInitializationResponseDTO
} from '../DTOs/PaymentDTO';
import { ITransaction, TransactionType, TransactionStatus, RelatedEntityType } from '../Interface/Entities/payments/IPayment';
import { ServiceError, ValidationError } from '../Error/AppError';
import { Console } from '../../../Infrastructure/Utils/Console';
import { IUser } from '../Interface/Entities/auth-and-user/IUser';
import { INotificationService } from '../Interface/Services/INotificationService';
import { NotificationType } from '../Enums/NotificationType';

export interface IPaymentUseCase {
    initializePayment(user: IUser, dto: InitializePaymentDTO): Promise<PaymentInitializeResponseDTO>;
    verifyInitialization(user: IUser, dto: VerifyInitializationDTO): Promise<VerifyInitializationResponseDTO>;
    verifyPayment(user: IUser, dto: VerifyPaymentDTO): Promise<PaymentVerifyResponseDTO>;
}

@injectable()
export class PaymentUseCase implements IPaymentUseCase {
    constructor(
        @inject(TYPES.PaystackService) private readonly paystackService: IPaystackService,
        @inject(TYPES.WalletService) private readonly walletService: IWalletService,
        @inject(TYPES.TransactionRepository) private readonly transactionRepository: TransactionRepository,
        @inject(TYPES.UserRepository) private readonly userRepository: UserRepository,
        @inject(TYPES.TransactionManager) private readonly transactionManager: TransactionManager,
        @inject(TYPES.NotificationService) private readonly notificationService: INotificationService,
    ) {}

    async initializePayment(user: IUser, dto: InitializePaymentDTO): Promise<PaymentInitializeResponseDTO> {
        let transactionStarted = false;
        try {
            await this.transactionManager.beginTransaction();
            transactionStarted = true;

            // Get user email
            if (!user.email) {
                throw new ValidationError('User email is required');
            }

            // Generate unique transaction ID
            const transactionId = `TXN_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

            // Convert naira to kobo for Paystack
            const amountInKobo = dto.amount * 100;

            // Initialize Paystack transaction
            const paystackResponse = await this.paystackService.initializeTransaction(
                amountInKobo, // Converted to kobo
                user.email,
                dto.redirect_url, // Pass as callback_url to Paystack
                {
                    user_id: user._id,
                    transaction_id: transactionId,
                    custom_fields: []
                }
            );

            // Create transaction record (store amount in naira)
            const transactionData: Partial<ITransaction> = {
                transaction_id: transactionId,
                user_id: user._id!,
                related_entity_type: RelatedEntityType.DEPOSIT,
                related_entity_id: user._id!,
                type: TransactionType.PAYMENT,
                amount: dto.amount, // Store in naira (not converted)
                currency: 'NGN',
                status: TransactionStatus.PENDING,
                payment_reference: paystackResponse.data.reference,
                access_code: paystackResponse.data.access_code,
                description: `Wallet deposit of ₦${dto.amount.toFixed(2)}`,
                metadata: {
                    payment_method: dto.payment_method,
                    redirect_url: dto.redirect_url,
                    paystack_reference: paystackResponse.data.reference,
                    paystack_access_code: paystackResponse.data.access_code
                }
            };

            const transaction = await this.transactionRepository.create(transactionData as ITransaction);

            await this.transactionManager.commit();

            Console.info('Payment initialized successfully', {
                userId: user._id,
                transactionId,
                reference: paystackResponse.data.reference
            });

            return {
                authorization_url: paystackResponse.data.authorization_url,
                access_code: paystackResponse.data.access_code,
                reference: paystackResponse.data.reference
            };
        } catch (error: any) {
            if (transactionStarted) {
                await this.transactionManager.rollback();
            }
            Console.error(error, { message: 'Failed to initialize payment', userId: user._id });
            throw error;
        }
    }

    /**
     * Record a payment initialization from the frontend (e.g. mobile Paystack SDK).
     * Creates only the pending transaction record; does not call Paystack.
     * Later, the existing verify endpoint is used to verify the reference and credit the wallet.
     */
    async verifyInitialization(user: IUser, dto: VerifyInitializationDTO): Promise<VerifyInitializationResponseDTO> {
        let transactionStarted = false;
        try {
            await this.transactionManager.beginTransaction();
            transactionStarted = true;

            // Avoid duplicate registration for the same reference
            const existing = await this.transactionRepository.findByReference(dto.reference);
            if (existing) {
                throw new ValidationError('This reference is already registered');
            }

            const transactionId = `TXN_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

            const transactionData: Partial<ITransaction> = {
                transaction_id: transactionId,
                user_id: user._id!,
                related_entity_type: RelatedEntityType.DEPOSIT,
                related_entity_id: user._id!,
                type: TransactionType.PAYMENT,
                amount: dto.amount,
                currency: 'NGN',
                status: TransactionStatus.PENDING,
                payment_reference: dto.reference,
                description: `Wallet deposit of ₦${dto.amount.toFixed(2)} (FE-initiated)`,
                metadata: {
                    payment_method: 'paystack',
                    paystack_reference: dto.reference,
                    initiated_from: 'frontend'
                }
            };

            const transaction = await this.transactionRepository.create(transactionData as ITransaction);

            await this.transactionManager.commit();

            Console.info('Payment initialization recorded (FE-initiated)', {
                userId: user._id,
                transactionId,
                reference: dto.reference,
                amount: dto.amount
            });

            return {
                reference: dto.reference,
                transaction_id: transactionId,
                amount: dto.amount,
                status: TransactionStatus.PENDING,
                message: 'Initialization recorded. Use the verify endpoint after payment to credit your wallet.'
            };
        } catch (error: any) {
            if (transactionStarted) {
                await this.transactionManager.rollback();
            }
            Console.error(error, { message: 'Failed to record payment initialization', userId: user._id });
            throw error;
        }
    }

    async verifyPayment(user: IUser, dto: VerifyPaymentDTO): Promise<PaymentVerifyResponseDTO> {
        let transactionStarted = false;
        try {
            await this.transactionManager.beginTransaction();
            transactionStarted = true;

            // Find transaction by reference
            const transaction = await this.transactionRepository.findByReference(dto.reference);
            if (!transaction) {
                throw new ValidationError('Transaction not found');
            }

            // Verify ownership
            if (transaction.user_id !== user._id) {
                throw new ValidationError('Unauthorized: Transaction does not belong to user');
            }

            // Check if already processed
            if (transaction.status === TransactionStatus.COMPLETED) {
                throw new ValidationError('Transaction already processed');
            }

            // Verify with Paystack
            const paystackResponse = await this.paystackService.verifyPayment(dto.reference);

            // Check if payment was successful
            if (paystackResponse.data.status !== 'success') {
                // Update transaction status to failed
                await this.transactionRepository.update(transaction._id!, {
                    status: TransactionStatus.FAILED,
                    failure_reason: paystackResponse.data.gateway_response,
                    metadata: {
                        ...transaction.metadata,
                        paystack_verification: paystackResponse.data
                    }
                } as Partial<ITransaction>);

                await this.transactionManager.commit();
                throw new ValidationError(`Payment failed: ${paystackResponse.data.gateway_response}`);
            }

            // Payment successful - credit user wallet (amount is already in naira from Paystack response)
            const amountInNaira = paystackResponse.data.amount / 100; // Convert kobo back to naira
            
            await this.walletService.creditUserWallet(
                user._id!,
                amountInNaira
            );

            // Update transaction status
            await this.transactionRepository.update(transaction._id!, {
                status: TransactionStatus.COMPLETED,
                completed_at: new Date().toISOString(),
                authorization_code: paystackResponse.data.authorization?.authorization_code,
                payment_channel: paystackResponse.data.channel,
                metadata: {
                    ...transaction.metadata,
                    paystack_verification: paystackResponse.data,
                    paystack_authorization: paystackResponse.data.authorization
                }
            } as Partial<ITransaction>);

            await this.transactionManager.commit();

            Console.info('Payment verified and wallet credited', {
                userId: user._id,
                reference: dto.reference,
                amount: amountInNaira
            });

            // Notification (non-blocking)
            try {
                await this.notificationService.create({
                    user_id: user._id!,
                    type: NotificationType.TRANSACTION,
                    title: 'Wallet funded',
                    content: `Your wallet has been credited with ₦${amountInNaira.toFixed(2)}.`,
                    url: '/wallet'
                });
            } catch {
                // ignore notification errors
            }

            return {
                transaction_id: transaction.transaction_id,
                reference: dto.reference,
                amount: amountInNaira,
                currency: paystackResponse.data.currency,
                status: TransactionStatus.COMPLETED,
                message: 'Payment verified and wallet credited successfully'
            };
        } catch (error: any) {
            if (transactionStarted) {
                await this.transactionManager.rollback();
            }
            Console.error(error, { message: 'Failed to verify payment', userId: user._id, reference: dto.reference });
            throw error;
        }
    }
}

