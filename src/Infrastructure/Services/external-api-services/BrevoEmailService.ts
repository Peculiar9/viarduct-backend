import axios from 'axios';
import { injectable } from 'inversify';
import {
    ITwilioEmailService,
    EmailVerificationResult,
    SendEmailOptions
} from '../../../Core/Application/Interface/Services/ITwilioEmailService';
import { ValidationError, ServiceError } from '../../../Core/Application/Error/AppError';
import CryptoService from '../../../Core/Services/CryptoService';
import { EnvironmentConfig } from '../../Config/EnvironmentConfig';
import { APP_NAME } from '../../../Core/Types/Constants';
import { UtilityService } from '../../../Core/Services/UtilityService';

const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';

/**
 * Brevo (Sendinblue) transactional email via REST API.
 * https://developers.brevo.com/reference/sendtransacemail
 */
@injectable()
export class BrevoEmailService implements ITwilioEmailService {
    private readonly verificationTokens: Map<string, { token: string; expiresAt: Date }> = new Map();
    private readonly apiKey: string;
    private readonly fromEmail: string;
    private readonly senderName: string;

    private static resolveApiKey(): string {
        const candidates = ['BREVO_API_KEY', 'SENDINBLUE_API_KEY'];
        for (const name of candidates) {
            const value = (process.env[name] || '').trim();
            if (value) {
                return value;
            }
        }
        return '';
    }

    private static assertValidApiKey(apiKey: string): void {
        if (apiKey.startsWith('xsmtpsib-')) {
            throw new Error(
                'BREVO_API_KEY looks like an SMTP password (xsmtpsib-...). ' +
                    'The Brevo REST API needs an API key (xkeysib-...) from Brevo → SMTP & API → API keys. ' +
                    'Or set EMAIL_PROVIDER=smtp and use SMTP_HOST/SMTP_PASSWORD instead.'
            );
        }
        if (!apiKey.startsWith('xkeysib-') && !apiKey.startsWith('xsmtp-')) {
            console.warn(
                '[Brevo] BREVO_API_KEY does not start with xkeysib- — if sends fail with "Key not found", regenerate the API key in Brevo dashboard.'
            );
        }
    }

    private static formatBrevoError(error: any): string {
        const msg = error?.response?.data?.message || error?.message || 'Unknown error';
        if (String(msg).toLowerCase().includes('key not found')) {
            return (
                'Invalid Brevo API key ("Key not found"). Use an API key starting with xkeysib- from ' +
                'Brevo → SMTP & API → API keys — not the SMTP password (xsmtpsib-...). ' +
                'Alternatively set EMAIL_PROVIDER=smtp with your Brevo SMTP credentials.'
            );
        }
        return String(msg);
    }

    constructor() {
        this.apiKey = BrevoEmailService.resolveApiKey();
        this.fromEmail =
            (process.env.BREVO_SENDER_EMAIL || '').trim() ||
            (process.env.EMAIL_FROM || '').trim();
        if (!this.fromEmail) {
            throw new Error(
                'Brevo sender email is required. Add BREVO_SENDER_EMAIL=your-verified@domain.com ' +
                    '(or EMAIL_FROM) to .env when EMAIL_PROVIDER=brevo'
            );
        }
        this.senderName = (process.env.BREVO_SENDER_NAME || APP_NAME).trim();

        if (!this.apiKey) {
            throw new Error(
                'BREVO_API_KEY is missing or empty. In .env set:\n' +
                    '  EMAIL_PROVIDER=brevo\n' +
                    '  BREVO_API_KEY=xkeysib-your-key-from-brevo-dashboard\n' +
                    '  BREVO_SENDER_EMAIL=no-reply@yourdomain.com\n' +
                    'Or set EMAIL_PROVIDER=smtp to use SMTP instead.'
            );
        }
        BrevoEmailService.assertValidApiKey(this.apiKey);

        console.info('📧 Brevo Email Service initializing...', {
            fromEmail: this.fromEmail,
            senderName: this.senderName
        });

        if (process.env.NODE_ENV !== 'test') {
            this.verifyApiKey()
                .then(() => {
                    console.log('\n✅ ========================================');
                    console.log('✅ Email Service: RUNNING');
                    console.log('✅ Provider: Brevo');
                    console.log(`✅ From: ${this.fromEmail}`);
                    console.log('✅ ========================================\n');
                })
                .catch((error: any) => {
                    console.warn('\n⚠️ ========================================');
                    console.warn('⚠️ Email Service: Brevo API check failed');
                    console.warn(`⚠️ Error: ${error?.message || error}`);
                    console.warn('⚠️ Verify BREVO_API_KEY and sender email in Brevo dashboard');
                    console.warn('⚠️ ========================================\n');
                });
        }
    }

    /** Lightweight check that the API key is accepted */
    private async verifyApiKey(): Promise<void> {
        await axios.get('https://api.brevo.com/v3/account', {
            headers: { 'api-key': this.apiKey },
            timeout: 15_000
        });
    }

    private async sendTransactionalEmail(input: {
        to: string;
        subject: string;
        htmlContent: string;
        textContent?: string;
    }): Promise<string> {
        const res = await axios.post(
            BREVO_API_URL,
            {
                sender: { name: this.senderName, email: this.fromEmail },
                to: [{ email: input.to }],
                subject: input.subject,
                htmlContent: input.htmlContent,
                textContent: input.textContent
            },
            {
                headers: {
                    'api-key': this.apiKey,
                    'content-type': 'application/json',
                    accept: 'application/json'
                },
                timeout: 30_000
            }
        );

        return res.data?.messageId || res.headers['x-message-id'] || 'unknown';
    }

    async sendEmailVerification(
        email: string,
        firstName: string,
        otpCode?: string
    ): Promise<EmailVerificationResult> {
        try {
            if (!email || !firstName) {
                throw new ValidationError('Email and first name are required');
            }

            const verificationToken = CryptoService.generateRandomString(32);
            const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

            this.verificationTokens.set(email, { token: verificationToken, expiresAt });

            const verificationCode = otpCode || UtilityService.generate4Digit();
            const verificationUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/verify-email?token=${verificationToken}&email=${encodeURIComponent(email)}`;

            const htmlContent = `
                <!DOCTYPE html>
                <html>
                <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                    <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                        <div style="background-color: #0066cc; color: white; padding: 20px; text-align: center;">
                            <h2>Email Verification</h2>
                        </div>
                        <div style="background-color: #f9f9f9; padding: 20px; margin-top: 20px;">
                            <p>Hello ${firstName},</p>
                            <p>Thank you for signing up! Please verify your email address using the code below:</p>
                            <p style="background-color: #0066cc; color: white; padding: 15px; text-align: center; font-size: 24px; font-weight: bold;">${verificationCode}</p>
                            <p>Or <a href="${verificationUrl}">click here to verify</a>.</p>
                            <p>This code expires in 24 hours.</p>
                        </div>
                    </div>
                </body>
                </html>
            `;

            const textContent = `Hello ${firstName},\n\nYour verification code is: ${verificationCode}\n\nOr visit: ${verificationUrl}\n\nExpires in 24 hours.`;

            const messageId = await this.sendTransactionalEmail({
                to: email,
                subject: 'Verify Your Email Address',
                htmlContent,
                textContent
            });

            return {
                success: true,
                messageId,
                verificationToken,
                expiresAt,
                message: 'Verification email sent successfully'
            };
        } catch (error: any) {
            throw new ServiceError(`Failed to send verification email: ${BrevoEmailService.formatBrevoError(error)}`);
        }
    }

    async verifyEmailToken(
        email: string,
        token: string
    ): Promise<{ success: boolean; message: string }> {
        if (!email || !token) {
            return { success: false, message: 'Email and token are required' };
        }

        const stored = this.verificationTokens.get(email);
        if (!stored) {
            return { success: false, message: 'Verification token not found' };
        }
        if (stored.token !== token) {
            return { success: false, message: 'Invalid verification token' };
        }
        if (new Date() > stored.expiresAt) {
            this.verificationTokens.delete(email);
            return { success: false, message: 'Verification token has expired' };
        }

        this.verificationTokens.delete(email);
        return { success: true, message: 'Email verified successfully' };
    }

    async sendPasswordResetEmail(
        email: string,
        firstName: string,
        otpCode: string
    ): Promise<{ success: boolean; messageId?: string; error?: string }> {
        try {
            if (!email || !firstName || !otpCode) {
                throw new ValidationError('Email, first name, and OTP code are required');
            }

            const htmlContent = `
                <!DOCTYPE html>
                <html>
                <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                    <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                        <div style="background-color: #0066cc; color: white; padding: 20px; text-align: center;">
                            <h2>Password Reset Request</h2>
                        </div>
                        <div style="background-color: #f9f9f9; padding: 20px; margin-top: 20px;">
                            <p>Hello ${firstName},</p>
                            <p>Use this code to reset your password:</p>
                            <p style="background-color: #0066cc; color: white; padding: 15px; text-align: center; font-size: 24px; font-weight: bold;">${otpCode}</p>
                            <p>This code expires in 15 minutes.</p>
                        </div>
                    </div>
                </body>
                </html>
            `;

            const messageId = await this.sendTransactionalEmail({
                to: email,
                subject: 'Password Reset Request',
                htmlContent,
                textContent: `Hello ${firstName},\n\nYour password reset code is: ${otpCode}\n\nExpires in 15 minutes.`
            });

            return { success: true, messageId };
        } catch (error: any) {
            throw new ServiceError(`Failed to send password reset email: ${BrevoEmailService.formatBrevoError(error)}`);
        }
    }

    async sendEmail(options: SendEmailOptions): Promise<{
        success: boolean;
        messageId?: string;
        error?: string;
    }> {
        try {
            if (!options.htmlContent && !options.textContent) {
                return { success: false, error: 'htmlContent or textContent is required' };
            }

            const messageId = await this.sendTransactionalEmail({
                to: options.to,
                subject: options.subject,
                htmlContent: options.htmlContent || `<p>${options.textContent}</p>`,
                textContent: options.textContent
            });

            return { success: true, messageId };
        } catch (error: any) {
            return { success: false, error: `Failed to send email: ${BrevoEmailService.formatBrevoError(error)}` };
        }
    }
}
