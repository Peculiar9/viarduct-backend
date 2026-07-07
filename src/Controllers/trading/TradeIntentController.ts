import { Request, Response } from 'express';
import { inject } from 'inversify';
import {
    controller,
    httpGet,
    httpPatch,
    httpPost,
    queryParam,
    request,
    requestBody,
    requestParam,
    response
} from 'inversify-express-utils';
import { API_PATH, TYPES } from '../../Core/Types/Constants';
import { ITradeIntentService } from '../../Core/Application/Interface/Services/ITradeIntentService';
import AuthMiddleware from '../../Middleware/AuthMiddleware';
import { BaseController } from '../BaseController';
import { validationMiddleware } from '../../Middleware/ValidationMiddleware';
import {
    CreateBuyIntentDTO,
    CreateSellIntentDTO,
    GetTradeQuoteDTO,
    SubmitProofOfPaymentDTO,
    VerifyBankAccountDTO
} from '../../Core/Application/DTOs/TradeIntentDTO';
import { IUser } from '../../Core/Application/Interface/Entities/auth-and-user/IUser';

@controller(`/${API_PATH}/trade-intents`)
export class TradeIntentController extends BaseController {
    constructor(@inject(TYPES.TradeIntentService) private readonly tradeIntentService: ITradeIntentService) {
        super();
    }

    @httpPost('/quote', AuthMiddleware.authenticate(), validationMiddleware(GetTradeQuoteDTO))
    async getQuote(@requestBody() dto: GetTradeQuoteDTO, @response() res: Response) {
        try {
            const quote = await this.tradeIntentService.getQuote(dto);
            return this.success(res, quote, 'Quote generated');
        } catch (error: any) {
            return this.error(res, error.message, error.statusCode || 400, error);
        }
    }

    @httpPost('/sell', AuthMiddleware.authenticate(), validationMiddleware(CreateSellIntentDTO))
    async createSell(
        @requestBody() dto: CreateSellIntentDTO,
        @request() req: Request,
        @response() res: Response
    ) {
        try {
            const user = req.user as IUser;
            const intent = await this.tradeIntentService.createSellIntent(user._id!, dto);
            return this.success(res, intent, 'Sell intent created. Send crypto to the deposit address.');
        } catch (error: any) {
            return this.error(res, error.message, error.statusCode || 400, error);
        }
    }

    @httpPost('/buy', AuthMiddleware.authenticate(), validationMiddleware(CreateBuyIntentDTO))
    async createBuy(
        @requestBody() dto: CreateBuyIntentDTO,
        @request() req: Request,
        @response() res: Response
    ) {
        try {
            const user = req.user as IUser;
            const intent = await this.tradeIntentService.createBuyIntent(user._id!, dto);
            return this.success(
                res,
                intent,
                'Buy intent created. Transfer NGN to the corporate account, then wait for admin verification.'
            );
        } catch (error: any) {
            return this.error(res, error.message, error.statusCode || 400);
        }
    }

    /**
     * List Nigerian banks (Paystack). Public — no auth required.
     * @route GET /api/v1/trade-intents/banks?name=zenith
     */
    @httpGet('/banks')
    async listBanks(@queryParam('name') name: string, @response() res: Response) {
        try {
            const banks = await this.tradeIntentService.listBanks(name);
            return this.success(res, banks, 'Banks retrieved');
        } catch (error: any) {
            return this.error(res, error.message, error.statusCode || 400, error);
        }
    }

    /**
     * Resolve account number + bank code to account holder name (Paystack).
     * Use before POST /sell so the user can confirm payout details.
     * @route POST /api/v1/trade-intents/verify-bank-account
     */
    @httpPost('/verify-bank-account', AuthMiddleware.authenticate(), validationMiddleware(VerifyBankAccountDTO))
    async verifyBankAccount(@requestBody() dto: VerifyBankAccountDTO, @response() res: Response) {
        try {
            const result = await this.tradeIntentService.verifyBankAccount(
                dto.account_number,
                dto.bank_code
            );
            return this.success(res, result, 'Bank account verified');
        } catch (error: any) {
            return this.error(res, error.message, error.statusCode || 400, error);
        }
    }

    @httpPost('/proof-of-payment', AuthMiddleware.authenticate(), validationMiddleware(SubmitProofOfPaymentDTO))
    async submitProofOfPayment(@requestBody() dto: SubmitProofOfPaymentDTO, @request() req: Request, @response() res: Response) {
        try {
            const user = req.user as IUser;
            const intent = await this.tradeIntentService.submitProofOfPayment(
                user._id!,
                dto.intent_id,
                dto.proof_of_payments
            );
            return this.success(res, intent, 'Proof of payment submitted');
        } catch (error: any) {
            return this.error(res, error.message, error.statusCode || 400, error);
        }
    }

    @httpGet('/', AuthMiddleware.authenticate())
    async listIntents(
        @queryParam('status') status: string,
        @queryParam('type') type: string,
        @queryParam('crypto_type') cryptoType: string,
        @queryParam('date_from') dateFrom: string,
        @queryParam('date_to') dateTo: string,
        @queryParam('limit') limit: string,
        @queryParam('offset') offset: string,
        @request() req: Request,
        @response() res: Response
    ) {
        try {
            const user = req.user as IUser;
            const result = await this.tradeIntentService.getUserIntents(user._id!, {
                status,
                type,
                crypto_type: cryptoType,
                date_from: dateFrom,
                date_to: dateTo,
                limit: limit ? parseInt(limit, 10) : 50,
                offset: offset ? parseInt(offset, 10) : 0
            });
            return this.success(res, result, 'Trade intents retrieved');
        } catch (error: any) {
            return this.error(res, error.message, error.statusCode || 400, error);
        }
    }

    @httpGet('/:id/payout-status', AuthMiddleware.authenticate())
    async getPayoutStatus(
        @requestParam('id') id: string,
        @request() req: Request,
        @response() res: Response
    ) {
        try {
            const user = req.user as IUser;
            const status = await this.tradeIntentService.getPayoutStatus(id, user._id!);
            return this.success(res, status, 'Payout status retrieved');
        } catch (error: any) {
            return this.error(res, error.message, error.statusCode || 400, error);
        }
    }

    @httpGet('/:id', AuthMiddleware.authenticate())
    async getIntent(
        @requestParam('id') id: string,
        @request() req: Request,
        @response() res: Response
    ) {
        try {
            const user = req.user as IUser;
            const intent = await this.tradeIntentService.getIntentById(id, user._id!);
            if (!intent) {
                return this.error(res, 'Trade intent not found', 404);
            }
            return this.success(res, intent, 'Trade intent retrieved');
        } catch (error: any) {
            return this.error(res, error.message, error.statusCode || 400, error);
        }
    }

    @httpPatch('/:id/cancel', AuthMiddleware.authenticate())
    async cancelIntent(
        @requestParam('id') id: string,
        @request() req: Request,
        @response() res: Response
    ) {
        try {
            const user = req.user as IUser;
            const intent = await this.tradeIntentService.cancelIntent(user._id!, id);
            return this.success(res, intent, 'Trade intent cancelled');
        } catch (error: any) {
            return this.error(res, error.message, error.statusCode || 400);
        }
    }
}
