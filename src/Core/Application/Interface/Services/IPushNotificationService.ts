export interface PushPayload {
    title: string;
    body: string;
    data?: Record<string, string>;
}

export interface IPushNotificationService {
    /**
     * Send a push notification to all active device tokens for a user.
     * Never throws — failures are logged and invalid tokens deactivated.
     */
    sendToUser(userId: string, payload: PushPayload): Promise<void>;
}
