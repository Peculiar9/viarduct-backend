import { controller, httpGet, httpPost, httpPut, httpDelete, request, requestBody, response, requestParam, queryParam } from "inversify-express-utils";
import { BaseController } from "../BaseController";
import { inject } from "inversify";
import { TYPES } from "../../Core/Types/Constants";
import { IPermissionUseCase } from "../../Core/Application/Interface/UseCases/IPermissionUseCase";
import { Request, Response } from "express";
import { CreatePermissionDTO } from "../../Core/Application/DTOs/PermissionDTO";
import { validationMiddleware } from "../../Middleware/ValidationMiddleware";
import AuthMiddleware from "../../Middleware/AuthMiddleware";

@controller("/api/v1/permissions")
export class PermissionController extends BaseController {
  constructor(
    @inject(TYPES.PermissionUseCase) private readonly permissionUseCase: IPermissionUseCase
  ) {
    super();
  }

  @httpPost("/", AuthMiddleware.authenticate(), validationMiddleware(CreatePermissionDTO))
  async createPermission(@requestBody() dto: CreatePermissionDTO, @request() req: Request, @response() res: Response) {
    try {
      this.HandleEmptyReqBody(req);
      const result = await this.permissionUseCase.createPermission(dto);
      return this.success(res, result, "Permission created successfully");
    } catch (error: any) {
      return this.error(res, error.message, error.statusCode);
    }
  }

  @httpGet("/", AuthMiddleware.authenticate())
  async getAllPermissions(@queryParam("group") groupName: string | undefined, @request() req: Request, @response() res: Response) {
    try {
      let result;
      if (groupName) {
        result = await this.permissionUseCase.getPermissionsByGroup(groupName);
      } else {
        result = await this.permissionUseCase.getAllPermissions();
      }
      return this.success(res, result, "Permissions retrieved successfully");
    } catch (error: any) {
      return this.error(res, error.message, error.statusCode);
    }
  }

  @httpGet("/:permissionId", AuthMiddleware.authenticate())
  async getPermissionById(@requestParam("permissionId") permissionId: string, @request() req: Request, @response() res: Response) {
    try {
      const result = await this.permissionUseCase.getPermissionById(permissionId);
      if (!result) {
        return this.error(res, "Permission not found", 404);
      }
      return this.success(res, result, "Permission retrieved successfully");
    } catch (error: any) {
      return this.error(res, error.message, error.statusCode);
    }
  }

  @httpPut("/:permissionId", AuthMiddleware.authenticate(), validationMiddleware(CreatePermissionDTO))
  async updatePermission(@requestParam("permissionId") permissionId: string, @requestBody() dto: Partial<CreatePermissionDTO>, @request() req: Request, @response() res: Response) {
    try {
      this.HandleEmptyReqBody(req);
      const result = await this.permissionUseCase.updatePermission(permissionId, dto);
      return this.success(res, result, "Permission updated successfully");
    } catch (error: any) {
      return this.error(res, error.message, error.statusCode);
    }
  }

  @httpDelete("/:permissionId", AuthMiddleware.authenticate())
  async deletePermission(@requestParam("permissionId") permissionId: string, @request() req: Request, @response() res: Response) {
    try {
      const result = await this.permissionUseCase.deletePermission(permissionId);
      return this.success(res, result, result.message);
    } catch (error: any) {
      return this.error(res, error.message, error.statusCode);
    }
  }
}

