import { controller, httpPost, request, requestBody, response } from "inversify-express-utils";
import { BaseController } from "../BaseController";
import { inject } from "inversify";
import { TYPES } from "../../Core/Types/Constants";
import { IKYCUseCase } from "../../Core/Application/Interface/UseCases/IKYCUseCase";
import { Request, Response } from "express";
import { PersonalInfoDTO, IdentityVerificationDTO, KYCResponseDTO } from "../../Core/Application/DTOs/UserDTO";
import { validationMiddleware } from "../../Middleware/ValidationMiddleware";
import AuthMiddleware from "../../Middleware/AuthMiddleware";
import { KYCStage } from "../../Core/Application/Interface/Entities/auth-and-user/IVerification";

@controller("/api/v1/kyc")
export class KYCController extends BaseController {
  constructor(
    @inject(TYPES.KYCUseCase) private readonly kycUseCase: IKYCUseCase
  ) {
    super();
  }

  @httpPost("/profile", AuthMiddleware.authenticate(), validationMiddleware(PersonalInfoDTO))
  async submitPersonalInfo(@requestBody() dto: PersonalInfoDTO, @request() req: Request, @response() res: Response) {
    try {
      this.HandleEmptyReqBody(req);
      const userId = (req as any).user?._id || (req as any).user?.id;
      
      if (!userId) {
        return this.error(res, "User not authenticated", 401);
      }

      const userKYC = await this.kycUseCase.addPersonalInfo(userId, dto);
      
      const response: KYCResponseDTO = {
        status: 'success',
        message: 'User info saved successfully',
        currentStage: userKYC.current_stage,
        nextStage: KYCStage.IDENTITY_VERIFICATION
      };

      return this.success(res, response, "Personal information saved successfully");
    } catch (error: any) {
      return this.error(res, error.message, error.statusCode || 500);
    }
  }

  @httpPost("/verify-identity", AuthMiddleware.authenticate(), validationMiddleware(IdentityVerificationDTO))
  async verifyIdentity(@requestBody() dto: IdentityVerificationDTO, @request() req: Request, @response() res: Response) {
    try {
      this.HandleEmptyReqBody(req);
      const userId = (req as any).user?._id || (req as any).user?.id;
      
      if (!userId) {
        return this.error(res, "User not authenticated", 401);
      }

      const userKYC = await this.kycUseCase.verifyIdentity(userId, dto);
      
      const response: KYCResponseDTO = {
        status: 'success',
        message: 'Identity verification successful',
        currentStage: userKYC.current_stage,
        nextStage: KYCStage.LIVENESS_VERIFICATION
      };

      return this.success(res, response, "Identity verified successfully");
    } catch (error: any) {
      return this.error(res, error.message, error.statusCode || 500);
    }
  }
}


