import { Request, Response } from 'express';
import { controller, httpGet, request, response, requestParam } from 'inversify-express-utils';
import { inject } from 'inversify';
import { API_PATH, TYPES } from '../../Core/Types/Constants';
import { ICardService } from '../../Core/Application/Interface/Services/ICardService';
import { BaseController } from '../BaseController';

/**
 * Public card catalog endpoints (no auth required).
 * GET list and GET one for users to choose gift card when submitting.
 */
@controller(`/${API_PATH}/cards`)
export class CardController extends BaseController {
    constructor(
        @inject(TYPES.CardService) private readonly cardService: ICardService
    ) {
        super();
    }

    @httpGet('/')
    async listCards(@request() req: Request, @response() res: Response) {
        try {
            const cards = await this.cardService.findAll();
            return this.success(res, cards, 'Success');
        } catch (error: any) {
            return this.error(res, error.message, error.statusCode || 400, error);
        }
    }

    @httpGet('/:id')
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
}
