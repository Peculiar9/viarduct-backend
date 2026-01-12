import { inject, injectable } from 'inversify';
import { APP_NAME, TYPES } from '../../Core/Types/Constants';
import { 
    ITwilioEmailService, 
    EmailVerificationResult, 
    SendEmailOptions 
} from '../../Core/Application/Interface/Services/ITwilioEmailService';
import { ValidationError, ServiceError } from '../../Core/Application/Error/AppError';
import CryptoService from '../../Core/Services/CryptoService';

// Import SendGrid
const sgMail = require('@sendgrid/mail');

/**
 * Twilio SendGrid email service implementation
 */
@injectable()
export class TwilioEmailService implements ITwilioEmailService {
    private readonly verificationTokens: Map<string, { token: string; expiresAt: Date }> = new Map();
    private apiKey: string;
    private fromEmail: string;

    constructor() {
        this.apiKey = process.env.SENDGRID_API_KEY || '';
        this.fromEmail = `noreply@${APP_NAME}.com`; // Fixed: Use correct from email
        
        if (!this.apiKey) {
            throw new Error('SENDGRID_API_KEY environment variable is required');
        }
        
        if (!this.apiKey.startsWith('SG.')) {
            console.warn('\n⚠️ ========================================');
            console.warn('⚠️ SendGrid API Key format warning');
            console.warn('⚠️ API key should start with "SG."');
            console.warn('⚠️ ========================================\n');
        }
        
        sgMail.setApiKey(this.apiKey);
        
        console.log('\n✅ ========================================');
        console.log('✅ Email Service: RUNNING');
        console.log('✅ Provider: SendGrid');
        console.log(`✅ From: ${this.fromEmail}`);
        console.log('✅ ========================================\n');
    }

    /**
     * Send email verification using Twilio SendGrid Dynamic Template
     */
    async sendEmailVerification(
        email: string, 
        firstName: string,
        otpCode?: string
    ): Promise<EmailVerificationResult> {
        try {
            console.info(`TwilioEmailService::sendEmailVerification -> Starting email verification for: ${email}`);

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

            // Use provided OTP code or generate one from token if not provided
            const verificationCode = otpCode || verificationToken.substring(0, 6).toUpperCase();
            
            // Create verification URL
            const verificationUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/verify-email?token=${verificationToken}&email=${encodeURIComponent(email)}`;

            console.info(`TwilioEmailService::sendEmailVerification -> Generated verification details:`, {
                email: email,
                verificationCode: verificationCode,
                verificationUrl: verificationUrl,
                expiresAt: expiresAt.toISOString()
            });

            // Dynamic template data for SendGrid template (only first_name as specified)
            const dynamicTemplateData = {
                first_name: firstName,
                verification_url: verificationUrl,
                verification_code: verificationCode,
                expires_in: '24 hours',
                current_year: new Date().getFullYear().toString()
            };

            console.info(`TwilioEmailService::sendEmailVerification -> Preparing SendGrid dynamic template:`, {
                to: email,
                from: this.fromEmail,
                templateDataKeys: Object.keys(dynamicTemplateData),
                first_name: firstName,
                verification_code: verificationCode
            });

            // Send email using SendGrid dynamic template
            const msg = {
                to: email,
                from: {
                    email: this.fromEmail,
                },
                templateId: process.env.SENDGRID_TEMPLATE_ID || '', // Use your SendGrid template ID
                dynamicTemplateData: dynamicTemplateData
            };

            // Validate template ID before sending
            if (!msg.templateId) {
                console.error(`SENDGRID_TEMPLATE_ID is missing from environment variables`);
                throw new Error('SENDGRID_TEMPLATE_ID environment variable is required');
            }

            console.info(`Sending email with SendGrid:`, {
                templateId: msg.templateId,
                to: msg.to,
                from: msg.from.email,
                dynamicTemplateDataKeys: Object.keys(msg.dynamicTemplateData || {})
            });

            const response = await sgMail.send(msg);
            
            const messageId = response[0].headers['x-message-id'] || 'unknown';
            
            console.info(`TwilioEmailService::sendEmailVerification -> Email sent successfully:`, {
                email: email,
                messageId: messageId,
                statusCode: response[0].statusCode,
                verificationCode: verificationCode,
                expiresAt: expiresAt.toISOString(),
                timestamp: new Date().toISOString()
            });

            // 🔍 DEBUG: Log OTP code for testing (remove in production)
            console.log(`🔑 OTP CODE FOR ${email}: ${verificationCode}`);

            return {
                success: true,
                messageId: messageId,
                verificationToken: verificationToken,
                expiresAt: expiresAt,
                message: 'Email verification sent successfully'
            };

        } catch (error: any) {
            console.error(`❌ Failed to send email verification to ${email}:`, {
                error: error.message,
                code: error.code,
                statusCode: error.response?.status,
                responseBody: error.response?.body,
                responseErrors: error.response?.body?.errors,
                templateId: process.env.SENDGRID_TEMPLATE_ID,
                timestamp: new Date().toISOString()
            });
            
            // Extract more specific error message from SendGrid response
            let errorMessage = error.message;
            if (error.response?.body?.errors && Array.isArray(error.response.body.errors)) {
                const sendGridErrors = error.response.body.errors.map((err: any) => err.message || err).join(', ');
                errorMessage = `SendGrid Error: ${sendGridErrors}`;
            }
            
            return {
                success: false,
                messageId: '',
                verificationToken: '',
                expiresAt: new Date(),
                error: `Failed to send email: ${errorMessage}`
            };
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
            console.info(`TwilioEmailService::verifyEmailToken -> Starting verification:`, {
                email: email,
                tokenLength: token?.length,
                tokenPreview: token?.substring(0, 3) + '***',
                timestamp: new Date().toISOString()
            });

            if (!email || !token) {
                console.warn(`TwilioEmailService::verifyEmailToken -> Missing required fields:`, {
                    hasEmail: !!email,
                    hasToken: !!token
                });
                throw new ValidationError('Email and token are required');
            }

            // Get stored token
            const storedData = this.verificationTokens.get(email);
            
            console.info(`TwilioEmailService::verifyEmailToken -> Token lookup result:`, {
                email: email,
                tokenFound: !!storedData,
                storedTokenPreview: storedData?.token?.substring(0, 3) + '***',
                expiresAt: storedData?.expiresAt?.toISOString(),
                currentTime: new Date().toISOString()
            });
            
            if (!storedData) {
                console.warn(`TwilioEmailService::verifyEmailToken -> No token found for email: ${email}`);
                return {
                    success: false,
                    message: 'Invalid or expired verification token'
                };
            }

            // Check if token matches (support both full token and 6-digit code)
            const fullTokenMatch = storedData.token === token;
            const sixDigitMatch = storedData.token.substring(0, 6).toUpperCase() === token.toUpperCase();
            const isValidToken = fullTokenMatch || sixDigitMatch;

            console.info(`TwilioEmailService::verifyEmailToken -> Token validation:`, {
                email: email,
                fullTokenMatch: fullTokenMatch,
                sixDigitMatch: sixDigitMatch,
                isValidToken: isValidToken,
                providedToken: token.toUpperCase(),
                expectedSixDigit: storedData.token.substring(0, 6).toUpperCase()
            });

            if (!isValidToken) {
                console.warn(`TwilioEmailService::verifyEmailToken -> Invalid token provided for: ${email}`);
                return {
                    success: false,
                    message: 'Invalid verification token'
                };
            }

            // Check if token is expired
            const isExpired = new Date() > storedData.expiresAt;
            if (isExpired) {
                console.warn(`TwilioEmailService::verifyEmailToken -> Token expired for: ${email}`, {
                    expiresAt: storedData.expiresAt.toISOString(),
                    currentTime: new Date().toISOString()
                });
                this.verificationTokens.delete(email);
                return {
                    success: false,
                    message: 'Verification token has expired'
                };
            }

            // Token is valid, remove it
            this.verificationTokens.delete(email);

            console.info(`TwilioEmailService::verifyEmailToken -> Verification successful:`, {
                email: email,
                verifiedAt: new Date().toISOString(),
                tokenType: fullTokenMatch ? 'full_token' : 'six_digit_code'
            });

            return {
                success: true,
                message: 'Email verified successfully'
            };

        } catch (error: any) {
            console.error(`TwilioEmailService::verifyEmailToken -> Verification failed:`, {
                email: email,
                error: error.message,
                stack: error.stack,
                timestamp: new Date().toISOString()
            });
            throw new ServiceError(`Failed to verify email: ${error.message}`);
        }
    }

    /**
     * Send password reset email using SendGrid
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
            console.info(`TwilioEmailService::sendPasswordResetEmail -> Starting password reset email for: ${email}`);

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

            // Send email using SendGrid
            const msg = {
                to: email,
                from: {
                    email: this.fromEmail,
                    name: APP_NAME
                },
                subject: 'Password Reset Request',
                html: htmlContent,
                text: textContent
            };

            const response = await sgMail.send(msg);
            
            const messageId = response[0].headers['x-message-id'] || 'unknown';
            
            console.info(`TwilioEmailService::sendPasswordResetEmail -> Email sent successfully:`, {
                email: email,
                messageId: messageId,
                statusCode: response[0].statusCode,
                otpCode: otpCode,
                timestamp: new Date().toISOString()
            });

            return {
                success: true,
                messageId: messageId
            };

        } catch (error: any) {
            console.error(`TwilioEmailService::sendPasswordResetEmail -> Failed to send email:`, {
                email: email,
                error: error.message,
                stack: error.stack,
                timestamp: new Date().toISOString()
            });
            
            return {
                success: false,
                error: `Failed to send password reset email: ${error.message}`
            };
        }
    }

    /**
     * Send general email using SendGrid
     */
    async sendEmail(options: SendEmailOptions): Promise<{
        success: boolean;
        messageId?: string;
        error?: string;
    }> {
        try {
            console.info(`Sending email to ${options.to}`);

            const msg: any = {
                to: options.to,
                from: {
                    email: this.fromEmail,
                    name: APP_NAME
                },
                subject: options.subject
            };

            // Use template if provided
            if (options.templateId) {
                msg.templateId = options.templateId;
                msg.dynamicTemplateData = options.dynamicTemplateData || {};
            } else {
                // Use HTML/text content
                msg.html = options.htmlContent;
                msg.text = options.textContent;
            }

            const response = await sgMail.send(msg);
            
            console.info(`Email sent successfully to ${options.to}, MessageID: ${response[0].headers['x-message-id']}`);

            return {
                success: true,
                messageId: response[0].headers['x-message-id'] || 'unknown'
            };

        } catch (error: any) {
            console.error(`Failed to send email to ${options.to}:`, error);
            
            return {
                success: false,
                error: `Failed to send email: ${error.message}`
            };
        }
    }

}
