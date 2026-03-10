import { Response } from 'express';
import { controller, httpGet, response } from 'inversify-express-utils';
import { API_PATH } from '../Core/Types/Constants';
import { BaseController } from './BaseController';

/**
 * Handles requests to the API base path (e.g. GET /api/v1)
 */
@controller(`/${API_PATH}`)
export class ApiBaseController extends BaseController {
    constructor() {
        super();
    }

    @httpGet('')
    async apiBase(@response() res: Response) {
        return this.success(res, { message: 'Viarduct API is reachable' }, 'Success');
    }
}
