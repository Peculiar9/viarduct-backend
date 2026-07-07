import { Request, Response } from 'express';
import { inject } from 'inversify';
import {
    controller,
    httpDelete,
    httpGet,
    httpPatch,
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
import {
    CreateCorporateBankAccountDTO,
    UpdateCorporateBankAccountDTO
} from '../../Core/Application/DTOs/BankAccountDTO';
import { IUser } from '../../Core/Application/Interface/Entities/auth-and-user/IUser';

@controller(`/${API_PATH}/admin/bank-accounts`)
export class AdminBankAccountController extends BaseController {
    constructor(@inject(TYPES.UserBankAccountService) private readonly bankAccountService: IUserBankAccountService) {
        super();
    }

    @httpGet('/corporate', AuthMiddleware.authenticateAdmin())
    async listCorporate(@response() res: Response) {
        try {
            const accounts = await this.bankAccountService.adminListCorporateAccounts();
            return this.success(res, accounts, 'Corporate bank accounts retrieved');
        } catch (error: any) {
            return this.error(res, error.message, error.statusCode || 400, error);
        }
    }

    @httpPost('/corporate', AuthMiddleware.authenticateAdmin(), validationMiddleware(CreateCorporateBankAccountDTO))
    async createCorporate(
        @requestBody() dto: CreateCorporateBankAccountDTO,
        @request() req: Request,
        @response() res: Response
    ) {
        try {
            const admin = req.user as IUser;
            const account = await this.bankAccountService.adminCreateCorporateAccount(admin._id!, dto);
            return this.success(res, account, 'Corporate bank account created');
        } catch (error: any) {
            return this.error(res, error.message, error.statusCode || 400, error);
        }
    }

    @httpPatch('/corporate/:id', AuthMiddleware.authenticateAdmin(), validationMiddleware(UpdateCorporateBankAccountDTO))
    async updateCorporate(
        @requestParam('id') id: string,
        @requestBody() dto: UpdateCorporateBankAccountDTO,
        @request() req: Request,
        @response() res: Response
    ) {
        try {
            const admin = req.user as IUser;
            const account = await this.bankAccountService.adminUpdateCorporateAccount(admin._id!, id, dto);
            return this.success(res, account, 'Corporate bank account updated');
        } catch (error: any) {
            return this.error(res, error.message, error.statusCode || 400, error);
        }
    }

    @httpDelete('/corporate/:id', AuthMiddleware.authenticateAdmin())
    async deleteCorporate(@requestParam('id') id: string, @response() res: Response) {
        try {
            await this.bankAccountService.adminDeleteCorporateAccount(id);
            return this.success(res, null, 'Corporate bank account deleted');
        } catch (error: any) {
            return this.error(res, error.message, error.statusCode || 400, error);
        }
    }
}
