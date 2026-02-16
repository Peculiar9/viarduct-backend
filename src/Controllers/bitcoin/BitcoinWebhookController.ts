import { controller, httpPost, request, response } from 'inversify-express-utils';
import { Request, Response } from 'express';
import { inject } from 'inversify';
import { TYPES, API_PATH } from '../../Core/Types/Constants';
import { BaseController } from '../BaseController';
import { IBitcoinWebhookService } from '../../Core/Application/Interface/Services/IBitcoinWebhookService';
import { Console } from '../../Infrastructure/Utils/Console';
import { CallbackMiddleware } from '../../Middleware/CallbackMiddleware';

@controller(`/${API_PATH}/webhooks/bitcoin`)
export class BitcoinWebhookController extends BaseController {
    constructor(
        @inject(TYPES.BitcoinWebhookService) private readonly webhookService: IBitcoinWebhookService
    ) {
        super();
    }

    @httpPost('/', 
        CallbackMiddleware.acknowledge(1000)
    )
    async handleWebhook(@request() req: Request, @response() res: Response) {
        try {
            const event = req.body;
            
            Console.info('Received Bitcoin webhook event', { 
                event_type: event.event,
                hash: event.hash,
                address: event.address
            });

            await this.webhookService.processWebhookEvent(event);
            
            if (!res.headersSent) {
                return this.success(res, { received: true }, 'Webhook received successfully');
            }
        } catch (error: any) {
            Console.error(error, { 
                message: `BitcoinWebhookController::handleWebhook - ${error.message}`,
                webhook: req.body?.hash || 'unknown'
            });
            
            if (!res.headersSent) {
                return this.error(res, error.message, error.statusCode || 500);
            }
        }
    }
}