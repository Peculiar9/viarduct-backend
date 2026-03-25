import { Request, Response } from 'express';
import { inject } from 'inversify';
import { controller, httpGet, httpPost, request, requestBody, requestParam, response, queryParam } from 'inversify-express-utils';
import { API_PATH, TYPES } from '../../Core/Types/Constants';
import AuthMiddleware from '../../Middleware/AuthMiddleware';
import { BaseController } from '../BaseController';
import { IChatService } from '../../Core/Application/Interface/Services/IChatService';
import { IUser } from '../../Core/Application/Interface/Entities/auth-and-user/IUser';
import { validationMiddleware } from '../../Middleware/ValidationMiddleware';
import { CreateChatDTO, SendChatMessageDTO } from '../../Core/Application/DTOs/ChatDTO';
import { UtilityService } from '../../Core/Services/UtilityService';
import { ValidationError } from '../../Core/Application/Error/AppError';

@controller(`/${API_PATH}/chats`)
export class ChatController extends BaseController {
    constructor(@inject(TYPES.ChatService) private readonly chatService: IChatService) {
        super();
    }

    /**
     * List admins a user can chat
     * GET /api/v1/chats/admins
     */
    @httpGet('/admins', AuthMiddleware.authenticate())
    async listAdmins(@request() req: Request, @response() res: Response) {
        try {
            const admins = await this.chatService.listAdmins();
            return this.success(res, admins, 'Admins retrieved successfully');
        } catch (error: any) {
            return this.error(res, error.message, error.statusCode || 400, error);
        }
    }

    /**
     * Create chat (user)
     * POST /api/v1/chats
     */
    @httpPost('/', AuthMiddleware.authenticate(), validationMiddleware(CreateChatDTO))
    async createChat(@requestBody() dto: CreateChatDTO, @request() req: Request, @response() res: Response) {
        try {
            const user = req.user as IUser;
            const created = await this.chatService.createChat(user._id!, dto.admin_id, {
                content: dto.content,
                url: dto.url ?? null
            });
            return this.success(res, created, 'Chat created successfully');
        } catch (error: any) {
            return this.error(res, error.message, error.statusCode || 400, error);
        }
    }

    /**
     * List chats for user
     * GET /api/v1/chats?status=open&limit=50&offset=0
     */
    @httpGet('/', AuthMiddleware.authenticate())
    async listChats(
        @queryParam('status') status: string,
        @queryParam('limit') limit: string,
        @queryParam('offset') offset: string,
        @request() req: Request,
        @response() res: Response
    ) {
        try {
            const user = req.user as IUser;
            const result = await this.chatService.listChatsForUser(user._id!, {
                status: status || undefined,
                limit: limit ? parseInt(limit, 10) : undefined,
                offset: offset ? parseInt(offset, 10) : undefined
            });
            return this.success(res, result, 'Chats retrieved successfully');
        } catch (error: any) {
            return this.error(res, error.message, error.statusCode || 400, error);
        }
    }

    /**
     * Get chat by id (user)
     * GET /api/v1/chats/:id
     */
    @httpGet('/:id([0-9a-fA-F-]{36})', AuthMiddleware.authenticate())
    async getChat(@requestParam('id') id: string, @request() req: Request, @response() res: Response) {
        try {
            if (!UtilityService.validateUUID(id)) {
                throw new ValidationError('Invalid chat id');
            }
            const user = req.user as IUser;
            const chat = await this.chatService.getChatForUser(user._id!, id);

            const messagesLimit = req.query.messages_limit ? parseInt(String(req.query.messages_limit), 10) : 50;
            const messagesOffset = req.query.messages_offset ? parseInt(String(req.query.messages_offset), 10) : 0;
            const messages = await this.chatService.listMessagesForUser(user._id!, id, {
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
     * List messages (user)
     * GET /api/v1/chats/:id/messages?limit=50&offset=0
     */
    @httpGet('/:id([0-9a-fA-F-]{36})/messages', AuthMiddleware.authenticate())
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
            const user = req.user as IUser;
            const result = await this.chatService.listMessagesForUser(user._id!, id, {
                limit: limit ? parseInt(limit, 10) : undefined,
                offset: offset ? parseInt(offset, 10) : undefined
            });
            return this.success(res, result, 'Messages retrieved successfully');
        } catch (error: any) {
            return this.error(res, error.message, error.statusCode || 400, error);
        }
    }

    /**
     * Send message (user)
     * POST /api/v1/chats/:id/messages
     */
    @httpPost('/:id([0-9a-fA-F-]{36})/messages', AuthMiddleware.authenticate(), validationMiddleware(SendChatMessageDTO))
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
            const user = req.user as IUser;
            const message = await this.chatService.sendMessageAsUser(user._id!, id, dto.content, dto.url ?? null);
            return this.success(res, message, 'Message sent successfully');
        } catch (error: any) {
            return this.error(res, error.message, error.statusCode || 400, error);
        }
    }
}

