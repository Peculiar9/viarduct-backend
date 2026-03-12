import { Request, Response } from 'express';
import { controller, httpPost, httpPut, httpDelete, request, response, requestParam } from 'inversify-express-utils';
import { inject } from 'inversify';
import { API_PATH, TYPES } from '../../Core/Types/Constants';
import { ICardService } from '../../Core/Application/Interface/Services/ICardService';
import AuthMiddleware from '../../Middleware/AuthMiddleware';
import { BaseController } from '../BaseController';
import { validationMiddleware } from '../../Middleware/ValidationMiddleware';
import { CreateCardDTO, UpdateCardDTO } from '../../Core/Application/DTOs/CardDTO';

@controller(`/${API_PATH}/admin/cards`)
export class AdminCardController extends BaseController {
    constructor(
        @inject(TYPES.CardService) private readonly cardService: ICardService
    ) {
        super();
    }

    @httpPost('/', AuthMiddleware.authenticateAdmin(), validationMiddleware(CreateCardDTO))
    async create(@request() req: Request, @response() res: Response) {
        try {
            const { name, description, url } = req.body;
            const card = await this.cardService.create({ name, description, url });
            return this.success(res, card, 'Card created successfully');
        } catch (error: any) {
            return this.error(res, error.message, error.statusCode || 400, error);
        }
    }

    @httpPut('/:id', AuthMiddleware.authenticateAdmin(), validationMiddleware(UpdateCardDTO))
    async update(
        @requestParam('id') id: string,
        @request() req: Request,
        @response() res: Response
    ) {
        try {
            const { name, description, url } = req.body;
            const card = await this.cardService.update(id, { name, description, url });
            if (!card) {
                return this.error(res, 'Card not found', 404);
            }
            return this.success(res, card, 'Card updated successfully');
        } catch (error: any) {
            return this.error(res, error.message, error.statusCode || 400, error);
        }
    }

    @httpDelete('/:id', AuthMiddleware.authenticateAdmin())
    async delete(
        @requestParam('id') id: string,
        @request() req: Request,
        @response() res: Response
    ) {
        try {
            const deleted = await this.cardService.delete(id);
            if (!deleted) {
                return this.error(res, 'Card not found', 404);
            }
            return this.success(res, { deleted: true }, 'Card deleted successfully');
        } catch (error: any) {
            return this.error(res, error.message, error.statusCode || 400, error);
        }
    }
}
