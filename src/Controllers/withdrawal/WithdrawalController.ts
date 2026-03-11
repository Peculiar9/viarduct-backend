import { Request, Response } from 'express';
import { controller, httpGet, httpPost, request, response, requestBody, requestParam } from 'inversify-express-utils';
import { inject } from 'inversify';
import { API_PATH, TYPES } from '../../Core/Types/Constants';
import { IWithdrawalService } from '../../Core/Application/Interface/Services/IWithdrawalService';
import AuthMiddleware from '../../Middleware/AuthMiddleware';
import { BaseController } from '../BaseController';
import { IUser } from '../../Core/Application/Interface/Entities/auth-and-user/IUser';
import { validationMiddleware } from '../../Middleware/ValidationMiddleware';
import { ValidateAccountDTO, SetAmountDTO, ConfirmWithdrawalDTO } from '../../Core/Application/DTOs/WithdrawalDTO';
import { ResponseMessage } from '../../Core/Application/Response/ResponseFormat';

@controller(`/${API_PATH}/withdrawal`)
export class WithdrawalController extends BaseController {
    constructor(
        @inject(TYPES.WithdrawalService) private readonly withdrawalService: IWithdrawalService
    ) {
        super();
    }

    @httpGet('/banks', AuthMiddleware.authenticate())
    async getBanks(@response() res: Response) {
        try {
            const banks = await this.withdrawalService.getBanks();
            return this.success(res, banks, ResponseMessage.SUCCESSFUL_REQUEST_MESSAGE);
        } catch (error: any) {
            return this.error(res, error.message, error.statusCode || 400, error);
        }
    }

    @httpPost('/validate-account', AuthMiddleware.authenticate(), validationMiddleware(ValidateAccountDTO))
    async validateAccount(@request() req: Request, @response() res: Response) {
        try {
            const user = req.user as IUser;
            const { account_number, bank_code } = req.body;
            const result = await this.withdrawalService.validateAccountAndCreateRequest(user._id!, account_number, bank_code);
            return this.success(res, result, 'Account validated successfully');
        } catch (error: any) {
            return this.error(res, error.message, error.statusCode || 400, error);
        }
    }

    @httpPost('/:id/set-amount', AuthMiddleware.authenticate(), validationMiddleware(SetAmountDTO))
    async setAmount(
        @requestParam('id') withdrawalRequestId: string,
        @request() req: Request,
        @response() res: Response
    ) {
        try {
            const user = req.user as IUser;
            const { amount } = req.body;
            const result = await this.withdrawalService.setAmount(user._id!, withdrawalRequestId, amount);
            return this.success(res, result, 'Amount set. Proceed to confirm with your PIN.');
        } catch (error: any) {
            return this.error(res, error.message, error.statusCode || 400, error);
        }
    }

    @httpPost('/:id/confirm', AuthMiddleware.authenticate(), validationMiddleware(ConfirmWithdrawalDTO))
    async confirmWithdrawal(
        @requestParam('id') withdrawalRequestId: string,
        @request() req: Request,
        @response() res: Response
    ) {
        try {
            const user = req.user as IUser;
            const { pin } = req.body;
            const withdrawal = await this.withdrawalService.confirmWithdrawal(user._id!, withdrawalRequestId, pin);
            return this.success(res, withdrawal, 'Withdrawal completed successfully');
        } catch (error: any) {
            return this.error(res, error.message, error.statusCode || 400, error);
        }
    }
}
