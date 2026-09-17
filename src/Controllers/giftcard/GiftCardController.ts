import { Request, Response } from 'express';
import { controller, httpGet, httpPost, request, response, requestParam } from 'inversify-express-utils';
import { inject } from 'inversify';
import { API_PATH, TYPES } from '../../Core/Types/Constants';
import { IGiftCardService } from '../../Core/Application/Interface/Services/IGiftCardService';
import { IGiftCardPurchaseService } from '../../Core/Application/Interface/Services/IGiftCardPurchaseService';
import { ICardService } from '../../Core/Application/Interface/Services/ICardService';
import AuthMiddleware from '../../Middleware/AuthMiddleware';
import { BaseController } from '../BaseController';
import { IUser } from '../../Core/Application/Interface/Entities/auth-and-user/IUser';
import { validationMiddleware } from '../../Middleware/ValidationMiddleware';
import { PurchaseGiftCardDTO, SubmitGiftCardDTO } from '../../Core/Application/DTOs/GiftCardDTO';

@controller(`/${API_PATH}/gift-cards`)
export class GiftCardController extends BaseController {
    constructor(
        @inject(TYPES.GiftCardService) private readonly giftCardService: IGiftCardService,
        @inject(TYPES.GiftCardPurchaseService)
        private readonly giftCardPurchaseService: IGiftCardPurchaseService,
        @inject(TYPES.CardService) private readonly cardService: ICardService
    ) {
        super();
    }

    @httpGet('/cards')
    async listCards(@request() req: Request, @response() res: Response) {
        try {
            const cards = await this.cardService.findAll();
            return this.success(res, cards, 'Success');
        } catch (error: any) {
            return this.error(res, error.message, error.statusCode || 400, error);
        }
    }

    @httpGet('/cards/:id')
    async getCardById(
        @requestParam('id') id: string,
        @request() req: Request,
        @response() res: Response
    ) {
        try {
            const card = await this.cardService.findById(id);
            if (!card) {
                return this.error(res, 'Card not found', 404);
            }
            return this.success(res, card, 'Success');
        } catch (error: any) {
            return this.error(res, error.message, error.statusCode || 400, error);
        }
    }

    /**
     * Reloadly digital gift card catalog
     * @route GET /api/v1/gift-cards/catalog?countryCode=NG
     */
    @httpGet('/catalog', AuthMiddleware.authenticate())
    async getCatalog(@request() req: Request, @response() res: Response) {
        try {
            const countryCode =
                typeof req.query.countryCode === 'string' ? req.query.countryCode : undefined;
            const products = await this.giftCardPurchaseService.getCatalog(countryCode);
            return this.success(res, products, 'Success');
        } catch (error: any) {
            return this.error(res, error.message, error.statusCode || 400, error);
        }
    }

    /**
     * Purchase a digital gift card (NGN or crypto wallet debit → Reloadly → deliver code)
     * @route POST /api/v1/gift-cards/purchase
     */
    @httpPost('/purchase', AuthMiddleware.authenticate(), validationMiddleware(PurchaseGiftCardDTO))
    async purchase(@request() req: Request, @response() res: Response) {
        try {
            const user = req.user as IUser;
            const purchase = await this.giftCardPurchaseService.purchase(user._id!, {
                productId: Number(req.body.productId),
                amount: Number(req.body.amount),
                recipientEmail: req.body.recipientEmail,
                countryCode: req.body.countryCode,
                paymentCurrency: req.body.paymentCurrency,
                paymentAmount:
                    req.body.paymentAmount != null ? Number(req.body.paymentAmount) : undefined,
                senderName: req.body.senderName,
                productName: req.body.productName,
                pin: req.body.pin
            });
            return this.success(res, purchase, 'Gift card purchased successfully');
        } catch (error: any) {
            return this.error(res, error.message, error.statusCode || 400, error);
        }
    }

    @httpGet('/purchases', AuthMiddleware.authenticate())
    async getMyPurchases(@request() req: Request, @response() res: Response) {
        try {
            const user = req.user as IUser;
            const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit), 10) || 50));
            const offset = Math.max(0, parseInt(String(req.query.offset), 10) || 0);
            const result = await this.giftCardPurchaseService.getMyPurchases(user._id!, limit, offset);
            return this.success(res, { ...result, limit, offset }, 'Success');
        } catch (error: any) {
            return this.error(res, error.message, error.statusCode || 400, error);
        }
    }

    @httpGet('/purchases/:id', AuthMiddleware.authenticate())
    async getPurchaseById(
        @requestParam('id') id: string,
        @request() req: Request,
        @response() res: Response
    ) {
        try {
            const user = req.user as IUser;
            const purchase = await this.giftCardPurchaseService.getPurchaseById(user._id!, id);
            if (!purchase) {
                return this.error(res, 'Purchase not found', 404);
            }
            return this.success(res, purchase, 'Success');
        } catch (error: any) {
            return this.error(res, error.message, error.statusCode || 400, error);
        }
    }

    @httpPost('/submit', AuthMiddleware.authenticate(), validationMiddleware(SubmitGiftCardDTO))
    async submit(@request() req: Request, @response() res: Response) {
        try {
            const user = req.user as IUser;
            const {
                card_name,
                card_type,
                digital_code,
                amount,
                currencyId,
                image_urls,
                pin,
                denomination,
                expiry_date,
                notes,
                reference,
                serial_number,
                country,
                bank_account_id,
                prefered_bank_detail
            } = req.body;
            const submission = await this.giftCardService.submit(user._id!, {
                card_name,
                card_type,
                digital_code,
                amount,
                currencyId,
                image_urls,
                pin,
                denomination,
                expiry_date,
                notes,
                reference,
                serial_number,
                country,
                bank_account_id,
                prefered_bank_detail
            });
            return this.success(
                res,
                submission,
                'Gift card submitted successfully. It will be reviewed by our team.'
            );
        } catch (error: any) {
            return this.error(res, error.message, error.statusCode || 400, error);
        }
    }

    @httpGet('/my-submissions', AuthMiddleware.authenticate())
    async getMySubmissions(@request() req: Request, @response() res: Response) {
        try {
            const user = req.user as IUser;
            const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit), 10) || 50));
            const offset = Math.max(0, parseInt(String(req.query.offset), 10) || 0);
            const filters = {
                card_name: req.query.card_name as string | undefined,
                card_type: req.query.card_type as string | undefined,
                amount: req.query.amount != null ? Number(req.query.amount) : undefined,
                status: req.query.status as string | undefined,
                date_from: req.query.date_from as string | undefined,
                date_to: req.query.date_to as string | undefined
            };
            const { items, total } = await this.giftCardService.getMySubmissions(user._id!, filters, limit, offset);
            return this.success(res, { items, total, limit, offset }, 'Success');
        } catch (error: any) {
            return this.error(res, error.message, error.statusCode || 400, error);
        }
    }

    @httpGet('/:id', AuthMiddleware.authenticate())
    async getSubmissionById(
        @requestParam('id') id: string,
        @request() req: Request,
        @response() res: Response
    ) {
        try {
            const user = req.user as IUser;
            const submission = await this.giftCardService.getSubmissionById(user._id!, id);
            if (!submission) {
                return this.error(res, 'Submission not found', 404);
            }
            return this.success(res, submission, 'Success');
        } catch (error: any) {
            return this.error(res, error.message, error.statusCode || 400, error);
        }
    }
}
