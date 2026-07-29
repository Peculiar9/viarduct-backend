import { inject, injectable } from 'inversify';
import * as admin from 'firebase-admin';
import { TYPES } from '../../../Core/Types/Constants';
import {
    IPushNotificationService,
    PushPayload
} from '../../../Core/Application/Interface/Services/IPushNotificationService';
import { IUserDeviceTokenService } from '../../../Core/Application/Interface/Services/IUserDeviceTokenService';
import { UserRepository } from '../../Repository/SQL/users/UserRepository';
import { EnvironmentConfig } from '../../Config/EnvironmentConfig';
import { Console } from '../../Utils/Console';

function pushLog(message: string, context?: Record<string, unknown>): void {
    const ctx = context ? ` ${JSON.stringify(context)}` : '';
    console.warn(`[FCM Push] ${message}${ctx}`);
}

@injectable()
export class FcmPushService implements IPushNotificationService {
    private available = false;
    private initAttempted = false;

    constructor(
        @inject(TYPES.UserDeviceTokenService)
        private readonly deviceTokenService: IUserDeviceTokenService,
        @inject(TYPES.UserRepository)
        private readonly userRepository: UserRepository
    ) {}

    private ensureInitialized(): boolean {
        if (this.initAttempted) {
            return this.available;
        }
        this.initAttempted = true;

        const projectId = EnvironmentConfig.get('FIREBASE_PROJECT_ID', '').trim();
        const clientEmail = EnvironmentConfig.get('FIREBASE_CLIENT_EMAIL', '').trim();
        let privateKey = EnvironmentConfig.get('FIREBASE_PRIVATE_KEY', '').trim();

        if (!projectId || !clientEmail || !privateKey) {
            pushLog('Firebase env not configured — push disabled', {
                hasProjectId: Boolean(projectId),
                hasClientEmail: Boolean(clientEmail),
                hasPrivateKey: Boolean(privateKey)
            });
            Console.warn('FcmPushService: Firebase env not configured — push notifications disabled', {
                hasProjectId: Boolean(projectId),
                hasClientEmail: Boolean(clientEmail),
                hasPrivateKey: Boolean(privateKey)
            });
            this.available = false;
            return false;
        }

        // .env often stores newlines as literal \n
        privateKey = privateKey.replace(/\\n/g, '\n');

        try {
            if (!admin.apps.length) {
                admin.initializeApp({
                    credential: admin.credential.cert({
                        projectId,
                        clientEmail,
                        privateKey
                    })
                });
            }
            this.available = true;
            pushLog('Firebase Admin initialized', { projectId });
            Console.info('FcmPushService: Firebase Admin initialized', { projectId });
            return true;
        } catch (error: any) {
            pushLog('Failed to initialize Firebase Admin', { error: error?.message });
            Console.error(error, { message: 'FcmPushService: failed to initialize Firebase Admin' });
            this.available = false;
            return false;
        }
    }

    private async resolveRecipient(userId: string): Promise<{
        phone: string | null;
        email: string | null;
        name: string | null;
    }> {
        try {
            const user = await this.userRepository.findById(userId);
            if (!user) {
                return { phone: null, email: null, name: null };
            }
            const phone = (user.international_phone || user.phone || null) as string | null;
            const email = (user.email || null) as string | null;
            const name = [user.first_name, user.last_name].filter(Boolean).join(' ') || null;
            return { phone, email, name };
        } catch {
            return { phone: null, email: null, name: null };
        }
    }

    private maskToken(token: string): string {
        if (!token) return '';
        if (token.length <= 12) return '***';
        return `${token.slice(0, 8)}...${token.slice(-6)}`;
    }

    async sendToUser(userId: string, payload: PushPayload): Promise<void> {
        try {
            if (!userId) {
                pushLog('Skipped — missing userId');
                return;
            }

            const recipient = await this.resolveRecipient(userId);
            const title = String(payload.title || '').trim();
            const body = String(payload.body || '').trim();

            pushLog('Attempting send', {
                userId,
                phone: recipient.phone,
                email: recipient.email,
                name: recipient.name,
                title,
                bodyPreview: body.slice(0, 80),
                type: payload.data?.type || null,
                url: payload.data?.url || null
            });

            if (!this.ensureInitialized()) {
                pushLog('Skipped — Firebase not available', {
                    userId,
                    phone: recipient.phone
                });
                return;
            }

            const tokens = await this.deviceTokenService.listActiveTokensForUser(userId);
            if (!tokens.length) {
                pushLog('Skipped — no registered device tokens for this user', {
                    userId,
                    phone: recipient.phone,
                    email: recipient.email,
                    hint: 'Client must POST /api/v1/me/device-tokens after login'
                });
                return;
            }

            if (!title || !body) {
                pushLog('Skipped — empty title/body', { userId, phone: recipient.phone });
                return;
            }

            const data: Record<string, string> = {};
            if (payload.data) {
                for (const [key, value] of Object.entries(payload.data)) {
                    data[key] = value == null ? '' : String(value);
                }
            }

            pushLog('Sending to FCM', {
                userId,
                phone: recipient.phone,
                email: recipient.email,
                deviceCount: tokens.length,
                platforms: tokens.map((t) => t.platform),
                tokenPreviews: tokens.map((t) => this.maskToken(t.token))
            });

            // FCM multicast supports up to 500 tokens per call
            const chunkSize = 500;
            let totalSuccess = 0;
            let totalFailure = 0;

            for (let i = 0; i < tokens.length; i += chunkSize) {
                const chunk = tokens.slice(i, i + chunkSize);
                const registrationTokens = chunk.map((t) => t.token);

                const response = await admin.messaging().sendEachForMulticast({
                    tokens: registrationTokens,
                    notification: { title, body },
                    data,
                    android: {
                        priority: 'high'
                    },
                    apns: {
                        payload: {
                            aps: {
                                sound: 'default'
                            }
                        }
                    }
                });

                totalSuccess += response.successCount;
                totalFailure += response.failureCount;

                for (let j = 0; j < response.responses.length; j++) {
                    const result = response.responses[j];
                    const tokenRow = chunk[j];
                    if (result.success) {
                        pushLog('Delivered to device', {
                            userId,
                            phone: recipient.phone,
                            platform: tokenRow.platform,
                            tokenPreview: this.maskToken(tokenRow.token),
                            messageId: result.messageId
                        });
                    } else {
                        pushLog('Failed for device', {
                            userId,
                            phone: recipient.phone,
                            platform: tokenRow.platform,
                            tokenPreview: this.maskToken(tokenRow.token),
                            code: (result.error as any)?.code,
                            error: result.error?.message
                        });
                    }
                }

                if (response.failureCount > 0) {
                    await this.cleanupFailedTokens(chunk, response.responses);
                }
            }

            pushLog('Send finished', {
                userId,
                phone: recipient.phone,
                email: recipient.email,
                successCount: totalSuccess,
                failureCount: totalFailure,
                title
            });
        } catch (error: any) {
            pushLog('sendToUser failed', {
                userId,
                error: error?.message
            });
            Console.error(error, {
                message: 'FcmPushService: sendToUser failed',
                userId
            });
        }
    }

    private async cleanupFailedTokens(
        chunk: Array<{ _id?: string; token: string }>,
        responses: admin.messaging.SendResponse[]
    ): Promise<void> {
        const invalidCodes = new Set([
            'messaging/registration-token-not-registered',
            'messaging/invalid-registration-token',
            'messaging/invalid-argument'
        ]);

        for (let i = 0; i < responses.length; i++) {
            const result = responses[i];
            if (result.success) continue;

            const code = (result.error as any)?.code as string | undefined;
            if (!code || !invalidCodes.has(code)) {
                continue;
            }

            const tokenRow = chunk[i];
            try {
                if (tokenRow._id) {
                    await this.deviceTokenService.deactivateTokenById(tokenRow._id);
                } else {
                    await this.deviceTokenService.deactivateToken(tokenRow.token);
                }
                pushLog('Deactivated invalid token', {
                    tokenId: tokenRow._id,
                    tokenPreview: this.maskToken(tokenRow.token),
                    code
                });
            } catch {
                // ignore cleanup errors
            }
        }
    }
}
