import { controller, httpGet, httpPost, httpPut, httpDelete, request, requestBody, response, requestParam } from "inversify-express-utils";
import { BaseController } from "../BaseController";
import { inject } from "inversify";
import { TYPES } from "../../Core/Types/Constants";
import { IRoleUseCase } from "../../Core/Application/Interface/UseCases/IRoleUseCase";
import { Request, Response } from "express";
import { CreateRoleDTO, UpdateRoleDTO, AssignPermissionsToRoleDTO, AssignRoleToUserDTO } from "../../Core/Application/DTOs/RoleDTO";
import { validationMiddleware } from "../../Middleware/ValidationMiddleware";
import AuthMiddleware from "../../Middleware/AuthMiddleware";
import { IUser } from "../../Core/Application/Interface/Entities/auth-and-user/IUser";

@controller("/api/v1/roles")
export class RoleController extends BaseController {
  constructor(
    @inject(TYPES.RoleUseCase) private readonly roleUseCase: IRoleUseCase
  ) {
    super();
  }

  @httpPost("/", AuthMiddleware.authenticate(), validationMiddleware(CreateRoleDTO))
  async createRole(@requestBody() dto: CreateRoleDTO, @request() req: Request, @response() res: Response) {
    try {
      this.HandleEmptyReqBody(req);
      const result = await this.roleUseCase.createRole(dto);
      return this.success(res, result, "Role created successfully");
    } catch (error: any) {
      return this.error(res, error.message, error.statusCode);
    }
  }

  @httpGet("/", AuthMiddleware.authenticate())
  async getAllRoles(@request() req: Request, @response() res: Response) {
    try {
      const result = await this.roleUseCase.getAllRoles();
      return this.success(res, result, "Roles retrieved successfully");
    } catch (error: any) {
      return this.error(res, error.message, error.statusCode);
    }
  }

  @httpGet("/:roleId", AuthMiddleware.authenticate())
  async getRoleById(@requestParam("roleId") roleId: string, @request() req: Request, @response() res: Response) {
    try {
      const result = await this.roleUseCase.getRoleById(roleId);
      if (!result) {
        return this.error(res, "Role not found", 404);
      }
      return this.success(res, result, "Role retrieved successfully");
    } catch (error: any) {
      return this.error(res, error.message, error.statusCode);
    }
  }

  @httpPut("/:roleId", AuthMiddleware.authenticate(), validationMiddleware(UpdateRoleDTO))
  async updateRole(@requestParam("roleId") roleId: string, @requestBody() dto: UpdateRoleDTO, @request() req: Request, @response() res: Response) {
    try {
      this.HandleEmptyReqBody(req);
      const result = await this.roleUseCase.updateRole(roleId, dto);
      return this.success(res, result, "Role updated successfully");
    } catch (error: any) {
      return this.error(res, error.message, error.statusCode);
    }
  }

  @httpDelete("/:roleId", AuthMiddleware.authenticate())
  async deleteRole(@requestParam("roleId") roleId: string, @request() req: Request, @response() res: Response) {
    try {
      const result = await this.roleUseCase.deleteRole(roleId);
      return this.success(res, result, result.message);
    } catch (error: any) {
      return this.error(res, error.message, error.statusCode);
    }
  }

  @httpPost("/:roleId/permissions", AuthMiddleware.authenticate(), validationMiddleware(AssignPermissionsToRoleDTO))
  async assignPermissionsToRole(@requestParam("roleId") roleId: string, @requestBody() dto: AssignPermissionsToRoleDTO, @request() req: Request, @response() res: Response) {
    try {
      this.HandleEmptyReqBody(req);
      const result = await this.roleUseCase.assignPermissionsToRole(roleId, dto);
      return this.success(res, result, result.message);
    } catch (error: any) {
      return this.error(res, error.message, error.statusCode);
    }
  }

  @httpGet("/:roleId/permissions", AuthMiddleware.authenticate())
  async getRolePermissions(@requestParam("roleId") roleId: string, @request() req: Request, @response() res: Response) {
    try {
      const result = await this.roleUseCase.getRolePermissions(roleId);
      return this.success(res, result, "Role permissions retrieved successfully");
    } catch (error: any) {
      return this.error(res, error.message, error.statusCode);
    }
  }

  @httpPost("/users/:userId/assign", AuthMiddleware.authenticate(), validationMiddleware(AssignRoleToUserDTO))
  async assignRoleToUser(@requestParam("userId") userId: string, @requestBody() dto: AssignRoleToUserDTO, @request() req: Request, @response() res: Response) {
    try {
      this.HandleEmptyReqBody(req);
      const result = await this.roleUseCase.assignRoleToUser(userId, dto);
      return this.success(res, result, result.message);
    } catch (error: any) {
      return this.error(res, error.message, error.statusCode);
    }
  }

  @httpDelete("/users/:userId/:roleId", AuthMiddleware.authenticate())
  async removeRoleFromUser(@requestParam("userId") userId: string, @requestParam("roleId") roleId: string, @request() req: Request, @response() res: Response) {
    try {
      const result = await this.roleUseCase.removeRoleFromUser(userId, roleId);
      return this.success(res, result, result.message);
    } catch (error: any) {
      return this.error(res, error.message, error.statusCode);
    }
  }

  @httpGet("/users/:userId/roles", AuthMiddleware.authenticate())
  async getUserRoles(@requestParam("userId") userId: string, @request() req: Request, @response() res: Response) {
    try {
      const result = await this.roleUseCase.getUserRoles(userId);
      return this.success(res, result, "User roles retrieved successfully");
    } catch (error: any) {
      return this.error(res, error.message, error.statusCode);
    }
  }

  @httpGet("/users/:userId/permissions", AuthMiddleware.authenticate())
  async getUserPermissions(@requestParam("userId") userId: string, @request() req: Request, @response() res: Response) {
    try {
      const result = await this.roleUseCase.getUserPermissions(userId);
      return this.success(res, result, "User permissions retrieved successfully");
    } catch (error: any) {
      return this.error(res, error.message, error.statusCode);
    }
  }
}

