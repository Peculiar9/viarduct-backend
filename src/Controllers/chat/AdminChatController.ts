import { Request, Response } from 'express';
import { inject } from 'inversify';
import { controller, httpGet, httpPatch, httpPost, request, requestBody, requestParam, response, queryParam } from 'inversify-express-utils';
import { API_PATH, TYPES } from '../../Core/Types/Constants';
import AuthMiddleware from '../../Middleware/AuthMiddleware';
import { BaseController } from '../BaseController';
import { IChatService } from '../../Core/Application/Interface/Services/IChatService';
import { IUser } from '../../Core/Application/Interface/Entities/auth-and-user/IUser';
import { validationMiddleware } from '../../Middleware/ValidationMiddleware';
import { ReassignChatDTO, SendChatMessageDTO } from '../../Core/Application/DTOs/ChatDTO';
import { UtilityService } from '../../Core/Services/UtilityService';
import { ValidationError } from '../../Core/Application/Error/AppError';

@controller(`/${API_PATH}/admin/chats`)
export class AdminChatController extends BaseController {
    constructor(@inject(TYPES.ChatService) private readonly chatService: IChatService) {
        super();
    }

    /**
     * List chats assigned to admin
     * GET /api/v1/admin/chats?status=open&user_id=<uuid>&limit=50&offset=0
     */
    @httpGet('/', AuthMiddleware.authenticateAdmin())
    async listChats(
        @queryParam('status') status: string,
        @queryParam('user_id') userId: string,
        @queryParam('limit') limit: string,
        @queryParam('offset') offset: string,
        @request() req: Request,
        @response() res: Response
    ) {
        try {
            const admin = req.user as IUser;
            const result = await this.chatService.listChatsForAdmin(admin._id!, {
                status: status || undefined,
                userId: userId || undefined,
                limit: limit ? parseInt(limit, 10) : undefined,
                offset: offset ? parseInt(offset, 10) : undefined
            });
            return this.success(res, result, 'Chats retrieved successfully');
        } catch (error: any) {
            return this.error(res, error.message, error.statusCode || 400, error);
        }
    }

    /**
     * Get chat (admin)
     * GET /api/v1/admin/chats/:id
     */
    @httpGet('/:id([0-9a-fA-F-]{36})', AuthMiddleware.authenticateAdmin())
    async getChat(@requestParam('id') id: string, @request() req: Request, @response() res: Response) {
        try {
            if (!UtilityService.validateUUID(id)) {
                throw new ValidationError('Invalid chat id');
            }
            const admin = req.user as IUser;
            const chat = await this.chatService.getChatForAdmin(admin._id!, id);

            const messagesLimit = req.query.messages_limit ? parseInt(String(req.query.messages_limit), 10) : 50;
            const messagesOffset = req.query.messages_offset ? parseInt(String(req.query.messages_offset), 10) : 0;
            const messages = await this.chatService.listMessagesForAdmin(admin._id!, id, {
                limit: Number.isFinite(messagesLimit) ? messagesLimit : 50,
                offset: Number.isFinite(messagesOffset) ? messagesOffset : 0
            });

            return this.success(
                res,
                { chat, messages },
                'Chat retrieved successfully'
            );
        } catch (error: any) {
            return this.error(res, error.message, error.statusCode || 400, error);
        }
    }

    /**
     * List messages (admin)
     * GET /api/v1/admin/chats/:id/messages?limit=50&offset=0
     */
    @httpGet('/:id([0-9a-fA-F-]{36})/messages', AuthMiddleware.authenticateAdmin())
    async listMessages(
        @requestParam('id') id: string,
        @queryParam('limit') limit: string,
        @queryParam('offset') offset: string,
        @request() req: Request,
        @response() res: Response
    ) {
        try {
            if (!UtilityService.validateUUID(id)) {
                throw new ValidationError('Invalid chat id');
            }
            const admin = req.user as IUser;
            const result = await this.chatService.listMessagesForAdmin(admin._id!, id, {
                limit: limit ? parseInt(limit, 10) : undefined,
                offset: offset ? parseInt(offset, 10) : undefined
            });
            return this.success(res, result, 'Messages retrieved successfully');
        } catch (error: any) {
            return this.error(res, error.message, error.statusCode || 400, error);
        }
    }

    /**
     * Send message (admin)
     * POST /api/v1/admin/chats/:id/messages
     */
    @httpPost('/:id([0-9a-fA-F-]{36})/messages', AuthMiddleware.authenticateAdmin(), validationMiddleware(SendChatMessageDTO))
    async sendMessage(
        @requestParam('id') id: string,
        @requestBody() dto: SendChatMessageDTO,
        @request() req: Request,
        @response() res: Response
    ) {
        try {
            if (!UtilityService.validateUUID(id)) {
                throw new ValidationError('Invalid chat id');
            }
            const admin = req.user as IUser;
            const message = await this.chatService.sendMessageAsAdmin(admin._id!, id, dto.content, dto.url ?? null);
            return this.success(res, message, 'Message sent successfully');
        } catch (error: any) {
            return this.error(res, error.message, error.statusCode || 400, error);
        }
    }

    /**
     * Close chat (admin)
     * PATCH /api/v1/admin/chats/:id/close
     */
    @httpPatch('/:id([0-9a-fA-F-]{36})/close', AuthMiddleware.authenticateAdmin())
    async closeChat(@requestParam('id') id: string, @request() req: Request, @response() res: Response) {
        try {
            if (!UtilityService.validateUUID(id)) {
                throw new ValidationError('Invalid chat id');
            }
            const admin = req.user as IUser;
            const chat = await this.chatService.closeChat(admin._id!, id);
            return this.success(res, chat, 'Chat closed successfully');
        } catch (error: any) {
            return this.error(res, error.message, error.statusCode || 400, error);
        }
    }

    /**
     * Reassign chat (admin)
     * PATCH /api/v1/admin/chats/:id/reassign
     */
    @httpPatch('/:id([0-9a-fA-F-]{36})/reassign', AuthMiddleware.authenticateAdmin(), validationMiddleware(ReassignChatDTO))
    async reassignChat(
        @requestParam('id') id: string,
        @requestBody() dto: ReassignChatDTO,
        @request() req: Request,
        @response() res: Response
    ) {
        try {
            if (!UtilityService.validateUUID(id)) {
                throw new ValidationError('Invalid chat id');
            }
            const admin = req.user as IUser;
            const chat = await this.chatService.reassignChat(admin._id!, id, dto.admin_id);
            return this.success(res, chat, 'Chat reassigned successfully');
        } catch (error: any) {
            return this.error(res, error.message, error.statusCode || 400, error);
        }
    }
}

