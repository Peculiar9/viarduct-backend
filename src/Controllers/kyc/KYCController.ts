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
// Uncomment for Prembly debug in API responses (Postman):
// import { EnvironmentConfig } from "../../Infrastructure/Config/EnvironmentConfig";
// import {
//   extractPremblyIdentityFields,
//   mapPremblyResponseForClient
// } from "../../Infrastructure/Services/kyc/PremblyResponseMapper";

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

      // --- Prembly debug (commented out for production; uncomment imports + block below when testing) ---
      // const iv = userKYC.stage_metadata?.identity_verification as Record<string, unknown> | undefined;
      // const providerRaw = iv?.provider_raw;
      // const debugResponse = EnvironmentConfig.getBoolean('KYC_DEBUG_RESPONSE', true);
      // if (debugResponse) {
      //   response.prembly_debug = {
      //     called: iv?.provider === 'prembly',
      //     provider: iv?.provider as string | undefined,
      //     verified: iv?.provider_verified as boolean | undefined,
      //     response_code: iv?.provider_response_code as string | undefined,
      //     reference: (iv?.provider_reference as string | null) ?? null,
      //     identity: extractPremblyIdentityFields(
      //       providerRaw,
      //       (iv?.identity_type as 'BVN' | 'NIN') || (dto.type as 'BVN' | 'NIN')
      //     ),
      //     full_response: mapPremblyResponseForClient(providerRaw),
      //     dob_match: iv?.dob_match as boolean | undefined,
      //     declared_date_of_birth_iso: (iv?.declared_date_of_birth_iso as string) ?? null,
      //     provider_date_of_birth_iso: (iv?.provider_date_of_birth_iso as string) ?? null
      //   };
      // }

      return this.success(res, response, "Identity verified successfully");
    } catch (error: any) {
      return this.error(res, error.message, error.statusCode || 500);
    }
  }
}


