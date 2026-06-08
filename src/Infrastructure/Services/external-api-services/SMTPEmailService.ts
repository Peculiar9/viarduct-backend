import { injectable } from 'inversify';
import { 
    ITwilioEmailService, 
    EmailVerificationResult, 
    SendEmailOptions 
} from '../../../Core/Application/Interface/Services/ITwilioEmailService';
import { ValidationError, ServiceError } from '../../../Core/Application/Error/AppError';
import CryptoService from '../../../Core/Services/CryptoService';
import { APP_NAME } from '../../../Core/Types/Constants';
import { UtilityService } from '../../../Core/Services/UtilityService';
import * as nodemailer from 'nodemailer';
import { resolveEmailSmtpConfig } from '../../Config/EmailSmtpConfig';

function formatSmtpConnectError(error: any, host: string, port: number): string {
    const base = error?.message || String(error);
    const timedOut =
        error?.code === 'ETIMEDOUT' ||
        error?.code === 'ESOCKET' ||
        /timed out/i.test(base);
    if (!timedOut) {
        return base;
    }
    return (
        `${base} — cannot reach ${host}:${port}. Many networks block port 587; ` +
        'for Brevo set BREVO_SMTP_PORT=2525 or 465 and restart the server.'
    );
}

/**
 * SMTP email via nodemailer.
 * Provider is selected with EMAIL_PROVIDER: smtp (SMTP_*) or brevo (BREVO_SMTP_*).
 */
@injectable()
export class SMTPEmailService implements ITwilioEmailService {
    private readonly verificationTokens: Map<string, { token: string; expiresAt: Date }> = new Map();
    private transporter: nodemailer.Transporter;
    private fromEmail: string;
    private readonly providerLabel: string;
    private readonly smtpHost: string;
    private readonly smtpPort: number;

    constructor() {
        const cfg = resolveEmailSmtpConfig();
        this.providerLabel = cfg.providerLabel;
        this.smtpHost = cfg.host;
        this.smtpPort = cfg.port;
        this.fromEmail = cfg.fromEmail || `noreply@${APP_NAME}.com`;

        if (!cfg.host || !cfg.username || !cfg.password) {
            const hint =
                (process.env.EMAIL_PROVIDER || 'smtp').toLowerCase() === 'brevo'
                    ? 'Set BREVO_SMTP_HOST, BREVO_SMTP_USERNAME, and BREVO_SMTP_PASSWORD (or xsmtpsib value in BREVO_API_KEY).'
                    : 'Set SMTP_HOST, SMTP_USERNAME, and SMTP_PASSWORD.';
            throw new Error(`Email SMTP configuration is incomplete. ${hint}`);
        }

        this.transporter = nodemailer.createTransport({
            host: cfg.host,
            port: cfg.port,
            secure: cfg.port === 465,
            auth: {
                user: cfg.username,
                pass: cfg.password
            }
        });

        console.info('📧 Email service initializing...', {
            provider: this.providerLabel,
            host: cfg.host,
            port: cfg.port,
            fromEmail: this.fromEmail,
            username: cfg.username
        });

        if (process.env.NODE_ENV !== 'test') {
            this.transporter
                .verify()
                .then(() => {
                    console.log('\n✅ ========================================');
                    console.log('✅ Email Service: RUNNING');
                    console.log(`✅ Provider: ${this.providerLabel}`);
                    console.log(`✅ Host: ${cfg.host}:${cfg.port}`);
                    console.log(`✅ From: ${this.fromEmail}`);
                    console.log('✅ ========================================\n');
                })
                .catch((error) => {
                    console.warn('\n⚠️ ========================================');
                    console.warn('⚠️ Email Service: CONNECTION FAILED');
                    console.warn(`⚠️ Provider: ${this.providerLabel}`);
                    console.warn(`⚠️ Error: ${error.message}`);
                    console.warn('⚠️ ========================================\n');
                });
        }
    }

    /**
     * Send email verification using SMTP
     */
    async sendEmailVerification(
        email: string, 
        firstName: string,
        otpCode?: string
    ): Promise<EmailVerificationResult> {
        try {
            console.info(`SMTPEmailService::sendEmailVerification -> Starting email verification for: ${email}`);

            if (!email || !firstName) {
                throw new ValidationError('Email and first name are required');
            }

            // Generate verification token
            const verificationToken = CryptoService.generateRandomString(32);
            const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

            // Store token temporarily (in production, use Redis or database)
            this.verificationTokens.set(email, {
                token: verificationToken,
                expiresAt
            });

            // Use provided OTP code or generate numeric one if not provided
            const verificationCode = otpCode || UtilityService.generate4Digit();
            
            // Create verification URL
            const verificationUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/verify-email?token=${verificationToken}&email=${encodeURIComponent(email)}`;

            // Create email HTML content
            const htmlContent = `
                <!DOCTYPE html>
                <html>
                <head>
                    <style>
                        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                        .header { background-color: #0066cc; color: white; padding: 20px; text-align: center; }
                        .content { background-color: #f9f9f9; padding: 20px; margin-top: 20px; }
                        .code { background-color: #0066cc; color: white; padding: 15px; text-align: center; font-size: 24px; font-weight: bold; margin: 20px 0; }
                        .button { display: inline-block; padding: 12px 24px; background-color: #0066cc; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="header">
                            <h2>Email Verification</h2>
                        </div>
                        <div class="content">
                            <p>Hello ${firstName},</p>
                            <p>Thank you for signing up! Please verify your email address using the code below:</p>
                            <div class="code">${verificationCode}</div>
                            <p>Or click the link below:</p>
                            <a href="${verificationUrl}" class="button">Verify Email</a>
                            <p>This verification code will expire in 24 hours.</p>
                            <p>If you did not create an account, please ignore this email.</p>
                        </div>
                    </div>
                </body>
                </html>
            `;

            const textContent = `
                Hello ${firstName},
                
                Thank you for signing up! Please verify your email address using the code: ${verificationCode}
                
                Or visit: ${verificationUrl}
                
                This verification code will expire in 24 hours.
                
                If you did not create an account, please ignore this email.
            `;

            // Send email
            const info = await this.transporter.sendMail({
                from: `"${APP_NAME}" <${this.fromEmail}>`,
                to: email,
                subject: 'Verify Your Email Address',
                html: htmlContent,
                text: textContent,
            });

            console.info(`SMTPEmailService::sendEmailVerification -> Email sent successfully:`, {
                email: email,
                messageId: info.messageId,
                verificationCode: verificationCode,
                expiresAt: expiresAt.toISOString()
            });

            return {
                success: true,
                messageId: info.messageId || 'unknown',
                verificationToken: verificationToken,
                expiresAt: expiresAt,
                message: 'Verification email sent successfully'
            };

        } catch (error: any) {
            console.error(`SMTPEmailService::sendEmailVerification -> Failed to send email:`, error);
            throw new ServiceError(
                `Failed to send verification email: ${formatSmtpConnectError(error, this.smtpHost, this.smtpPort)}`
            );
        }
    }

    /**
     * Verify email verification token
     */
    async verifyEmailToken(email: string, token: string): Promise<{
        success: boolean;
        message: string;
    }> {
        try {
            console.info(`SMTPEmailService::verifyEmailToken -> Starting verification:`, { email });

            if (!email || !token) {
                return {
                    success: false,
                    message: 'Email and token are required'
                };
            }

            const stored = this.verificationTokens.get(email);
            
            if (!stored) {
                return {
                    success: false,
                    message: 'Verification token not found'
                };
            }

            if (stored.token !== token) {
                return {
                    success: false,
                    message: 'Invalid verification token'
                };
            }

            if (new Date() > stored.expiresAt) {
                this.verificationTokens.delete(email);
                return {
                    success: false,
                    message: 'Verification token has expired'
                };
            }

            // Remove token after successful verification
            this.verificationTokens.delete(email);

            return {
                success: true,
                message: 'Email verified successfully'
            };

        } catch (error: any) {
            console.error(`SMTPEmailService::verifyEmailToken -> Verification failed:`, error);
            return {
                success: false,
                message: `Verification failed: ${error.message}`
            };
        }
    }

    /**
     * Send password reset email using SMTP
     */
    async sendPasswordResetEmail(
        email: string,
        firstName: string,
        otpCode: string
    ): Promise<{
        success: boolean;
        messageId?: string;
        error?: string;
    }> {
        try {
            console.info(`SMTPEmailService::sendPasswordResetEmail -> Starting password reset email for: ${email}`);

            if (!email || !firstName || !otpCode) {
                throw new ValidationError('Email, first name, and OTP code are required');
            }

            // Create email HTML content
            const htmlContent = `
                <!DOCTYPE html>
                <html>
                <head>
                    <style>
                        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                        .header { background-color: #0066cc; color: white; padding: 20px; text-align: center; }
                        .content { background-color: #f9f9f9; padding: 20px; margin-top: 20px; }
                        .code { background-color: #0066cc; color: white; padding: 15px; text-align: center; font-size: 24px; font-weight: bold; margin: 20px 0; border-radius: 5px; }
                        .footer { text-align: center; margin-top: 20px; color: #666; font-size: 0.9em; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="header">
                            <h2>Password Reset Request</h2>
                        </div>
                        <div class="content">
                            <p>Hello ${firstName},</p>
                            <p>You requested to reset your password. Use the code below to reset your password:</p>
                            <div class="code">${otpCode}</div>
                            <p>This code will expire in 15 minutes.</p>
                            <p>If you did not request this password reset, please ignore this email and your password will remain unchanged.</p>
                            <p>For security reasons, never share this code with anyone.</p>
                        </div>
                        <div class="footer">
                            <p>This is an automated message from ${APP_NAME}. Please do not reply to this email.</p>
                        </div>
                    </div>
                </body>
                </html>
            `;

            const textContent = `
                Hello ${firstName},
                
                You requested to reset your password. Use the code below to reset your password:
                
                ${otpCode}
                
                This code will expire in 15 minutes.
                
                If you did not request this password reset, please ignore this email and your password will remain unchanged.
                
                For security reasons, never share this code with anyone.
                
                This is an automated message from ${APP_NAME}. Please do not reply to this email.
            `;

            // Send email
            const info = await this.transporter.sendMail({
                from: `"${APP_NAME}" <${this.fromEmail}>`,
                to: email,
                subject: 'Password Reset Request',
                html: htmlContent,
                text: textContent,
            });

            console.info(`SMTPEmailService::sendPasswordResetEmail -> Email sent successfully:`, {
                email: email,
                messageId: info.messageId,
                otpCode: otpCode
            });

            return {
                success: true,
                messageId: info.messageId || 'unknown'
            };

        } catch (error: any) {
            console.error(`SMTPEmailService::sendPasswordResetEmail -> Failed to send email:`, error);
            throw new ServiceError(
                `Failed to send password reset email: ${formatSmtpConnectError(error, this.smtpHost, this.smtpPort)}`
            );
        }
    }

    /**
     * Send general email using SMTP
     */
    async sendEmail(options: SendEmailOptions): Promise<{
        success: boolean;
        messageId?: string;
        error?: string;
    }> {
        try {
            console.info(`SMTPEmailService::sendEmail -> Sending email to ${options.to}`);

            const mailOptions: nodemailer.SendMailOptions = {
                from: `"${APP_NAME}" <${this.fromEmail}>`,
                to: options.to,
                subject: options.subject,
            };

            // Use HTML or text content
            if (options.htmlContent) {
                mailOptions.html = options.htmlContent;
            }
            if (options.textContent) {
                mailOptions.text = options.textContent;
            }

            const info = await this.transporter.sendMail(mailOptions);
            
            console.info(`SMTPEmailService::sendEmail -> Email sent successfully to ${options.to}, MessageID: ${info.messageId}`);

            return {
                success: true,
                messageId: info.messageId || 'unknown'
            };

        } catch (error: any) {
            console.error(`SMTPEmailService::sendEmail -> Failed to send email to ${options.to}:`, error);
            
            return {
                success: false,
                error: `Failed to send email: ${formatSmtpConnectError(error, this.smtpHost, this.smtpPort)}`
            };
        }
    }
}