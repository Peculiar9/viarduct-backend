import { Request, Response } from 'express';
import { inject } from 'inversify';
import { controller, httpGet, httpPost, request, response, requestBody, requestParam } from 'inversify-express-utils';
import { API_PATH, TYPES } from '../../Core/Types/Constants';
import { IPaymentUseCase } from '../../Core/Application/UseCases/PaymentUseCase';
import AuthMiddleware from '../../Middleware/AuthMiddleware';
import { validationMiddleware } from '../../Middleware/ValidationMiddleware';
import { BaseController } from '../BaseController';
import { ResponseMessage } from '../../Core/Application/Response/ResponseFormat';
import { InitializePaymentDTO, VerifyPaymentDTO, VerifyInitializationDTO } from '../../Core/Application/DTOs/PaymentDTO';
import { IUser } from '../../Core/Application/Interface/Entities/auth-and-user/IUser';

@controller(`/${API_PATH}/payment`)
export class PaystackPaymentController extends BaseController {
    constructor(
        @inject(TYPES.PaymentUseCase) private readonly paymentUseCase: IPaymentUseCase
    ) {
        super();
    }

    /**
     * Initialize Paystack payment
     * @route POST /api/v1/payment/initialize
     */
    @httpPost('/initialize', AuthMiddleware.authenticate(), validationMiddleware(InitializePaymentDTO))
    async initializePayment(
        @requestBody() dto: InitializePaymentDTO,
        @request() req: Request,
        @response() res: Response
    ) {
        try {
            const user = req.user as IUser;
            const result = await this.paymentUseCase.initializePayment(user, dto);
            
            return this.success(res, result, 'Payment initialized successfully');
        } catch (error: any) {
            console.error('Error initializing payment:', error);
            return this.error(res, error.message, error.statusCode || 400);
        }
    }

    /**
     * Record payment initialization from frontend (e.g. mobile Paystack SDK).
     * Body: { reference, amount }. Creates pending transaction only; no Paystack API call.
     * Use the verify endpoint after payment to credit the wallet.
     * @route POST /api/v1/payment/verify-initialization
     */
    @httpPost('/verify-initialization', AuthMiddleware.authenticate(), validationMiddleware(VerifyInitializationDTO))
    async verifyInitialization(
        @requestBody() dto: VerifyInitializationDTO,
        @request() req: Request,
        @response() res: Response
    ) {
        try {
            const user = req.user as IUser;
            const result = await this.paymentUseCase.verifyInitialization(user, dto);
            return this.success(res, result, 'Initialization recorded successfully');
        } catch (error: any) {
            console.error('Error recording payment initialization:', error);
            return this.error(res, error.message, error.statusCode || 400);
        }
    }

    /**
     * Verify Paystack payment
     * Supports:
     * - GET /api/v1/payment/verify/:reference (path parameter)
     * - GET /api/v1/payment/verify?reference=xxx (query parameter)
     */
    @httpGet('/verify/:reference?', AuthMiddleware.authenticate())
    async verifyPayment(
        @requestParam('reference') reference: string | undefined,
        @request() req: Request,
        @response() res: Response
    ) {
        try {
            // Get reference from query parameter first (most reliable)
            let ref: string | undefined = req.query.reference as string;
            
            // If no query param, try path parameter (but ignore if it's "reference" or "Reference")
            if (!ref && reference && reference.toLowerCase() !== 'reference') {
                ref = reference;
            }
            
            // Also check for malformed query strings like "?=xxx"
            if (!ref && req.url.includes('?=')) {
                const match = req.url.match(/\?=([^&]+)/);
                if (match && match[1]) {
                    ref = match[1];
                }
            }
            
            if (!ref) {
                return this.error(res, 'Reference is required. Use: /api/v1/payment/verify/hf9g9gdy5d or /api/v1/payment/verify?reference=hf9g9gdy5d', 400);
            }

            console.log('PaystackPaymentController::verifyPayment - Reference received:', ref);
            console.log('PaystackPaymentController::verifyPayment - Full URL:', req.url);
            console.log('PaystackPaymentController::verifyPayment - Query params:', req.query);

            const user = req.user as IUser;
            const dto: VerifyPaymentDTO = { reference: ref };
            const result = await this.paymentUseCase.verifyPayment(user, dto);
            
            return this.success(res, result, 'Payment verified successfully');
        } catch (error: any) {
            console.error('Error verifying payment:', error);
            return this.error(res, error.message, error.statusCode || 400);
        }
    }
}

