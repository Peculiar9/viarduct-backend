import { Request, Response } from 'express';
import { inject } from 'inversify';
import {
    controller,
    httpDelete,
    httpGet,
    httpPost,
    request,
    requestBody,
    requestParam,
    response
} from 'inversify-express-utils';
import { API_PATH, TYPES } from '../../Core/Types/Constants';
import { IUserBankAccountService } from '../../Core/Application/Interface/Services/IUserBankAccountService';
import AuthMiddleware from '../../Middleware/AuthMiddleware';
import { BaseController } from '../BaseController';
import { validationMiddleware } from '../../Middleware/ValidationMiddleware';
import { SaveUserBankAccountDTO } from '../../Core/Application/DTOs/BankAccountDTO';
import { IUser } from '../../Core/Application/Interface/Entities/auth-and-user/IUser';

@controller(`/${API_PATH}/bank-accounts`)
export class BankAccountController extends BaseController {
    constructor(@inject(TYPES.UserBankAccountService) private readonly bankAccountService: IUserBankAccountService) {
        super();
    }

    /**
     * Viarduct corporate account(s) for buy-intent NGN transfers.
     * @route GET /api/v1/bank-accounts/corporate
     */
    @httpGet('/corporate', AuthMiddleware.authenticate())
    async getCorporateAccounts(@response() res: Response) {
        try {
            const accounts = await this.bankAccountService.getCorporateAccounts();
            return this.success(res, accounts, 'Corporate bank accounts retrieved');
        } catch (error: any) {
            return this.error(res, error.message, error.statusCode || 400, error);
        }
    }

    /**
     * Default Viarduct corporate account for buy flow.
     * @route GET /api/v1/bank-accounts/corporate/default
     */
    @httpGet('/corporate/default', AuthMiddleware.authenticate())
    async getDefaultCorporateAccount(@response() res: Response) {
        try {
            const account = await this.bankAccountService.getDefaultCorporateAccount();
            return this.success(res, account, 'Corporate bank account retrieved');
        } catch (error: any) {
            return this.error(res, error.message, error.statusCode || 400, error);
        }
    }

    /**
     * User's saved payout accounts for sell intents.
     * @route GET /api/v1/bank-accounts/mine
     */
    @httpGet('/mine', AuthMiddleware.authenticate())
    async listMyAccounts(@request() req: Request, @response() res: Response) {
        try {
            const user = req.user as IUser;
            const accounts = await this.bankAccountService.listUserAccounts(user._id!);
            return this.success(res, accounts, 'Saved bank accounts retrieved');
        } catch (error: any) {
            return this.error(res, error.message, error.statusCode || 400, error);
        }
    }

    /**
     * Save a verified bank account for reuse on sell intents.
     * @route POST /api/v1/bank-accounts
     */
    @httpPost('/', AuthMiddleware.authenticate(), validationMiddleware(SaveUserBankAccountDTO))
    async saveAccount(@requestBody() dto: SaveUserBankAccountDTO, @request() req: Request, @response() res: Response) {
        try {
            const user = req.user as IUser;
            const account = await this.bankAccountService.saveUserAccount(user._id!, dto);
            return this.success(res, account, 'Bank account saved');
        } catch (error: any) {
            return this.error(res, error.message, error.statusCode || 400, error);
        }
    }

    /**
     * Fetch a saved user or corporate bank account by id. Public — no auth required.
     * @route GET /api/v1/bank-accounts/:id
     */
    @httpGet('/:id')
    async getAccountById(@requestParam('id') id: string, @response() res: Response) {
        try {
            const account = await this.bankAccountService.getBankAccountById(id);
            return this.success(res, account, 'Bank account retrieved');
        } catch (error: any) {
            return this.error(res, error.message, error.statusCode || 400, error);
        }
    }

    /**
     * Soft-delete a saved user bank account.
     * @route DELETE /api/v1/bank-accounts/:id
     */
    @httpDelete('/:id', AuthMiddleware.authenticate())
    async deleteAccount(@requestParam('id') id: string, @request() req: Request, @response() res: Response) {
        try {
            const user = req.user as IUser;
            await this.bankAccountService.deleteUserAccount(user._id!, id);
            return this.success(res, null, 'Bank account removed');
        } catch (error: any) {
            return this.error(res, error.message, error.statusCode || 400, error);
        }
    }
}
