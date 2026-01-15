import { IAuthUseCase } from "../Interface/UseCases/IAuthUseCase";
import { UserRegistrationDTO } from "../DTOs/AuthDTOV2";
import { ChangePasswordDTO, ForgotPasswordDTO, IEmailVerificationResponse, InitSignupDTO, LoginResponseDTO, RefreshTokenDTO, ResetPasswordDTO, SetPasswordDTO, VerifyEmailDTO } from "../DTOs/AuthDTO";
import { LoginDTO } from "../DTOs/AuthDTO";
import { TYPES } from "../../Types/Constants";
import { inject } from "inversify";
import { IRegistrationService } from "../Interface/Services/IRegistrationService";
import { UserResponseDTO } from "../DTOs/UserDTO";
import { IUser } from "../Interface/Entities/auth-and-user/IUser";
import { IUserProfileService } from "../Interface/Services/IUserProfileService";
import { IAuthenticationService } from "../Interface/Services/IAuthenticationService";
import { AuthHelpers } from "../../../Infrastructure/Services/helpers/AuthHelpers";
import { ITwilioEmailService } from "../Interface/Services/ITwilioEmailService";
import { ITokenService } from "../Interface/Services/ITokenService";
import { UserRepository } from "../../../Infrastructure/Repository/SQL/users/UserRepository";
import { VerificationRepository } from "../../../Infrastructure/Repository/SQL/auth/VerificationRepository";
import { TransactionManager } from "../../../Infrastructure/Repository/SQL/Abstractions/TransactionManager";
import { ValidationError, ServiceError, UnprocessableEntityError } from "../Error/AppError";
import { UserStatus } from "../Enums/UserStatus";
import { VerificationStatus } from "../Interface/Entities/auth-and-user/IUser";
import { VerificationType } from "../Interface/Entities/auth-and-user/IVerification";
import { Console } from "console";
import { UtilityService } from "../../../Core/Services/UtilityService";
import { CryptoService } from "../../../Core/Services/CryptoService";
import { EnvironmentConfig } from "../../../Infrastructure/Config/EnvironmentConfig";
import { User } from "../Entities/User";
import { AuthMethod } from "../Interface/Entities/auth-and-user/IUser";
import { DatabaseIsolationLevel } from "../Enums/DatabaseIsolationLevel";
import { UserRole } from "../Enums/UserRole";

export class AuthUseCase implements IAuthUseCase {
    constructor(
        @inject(TYPES.RegistrationService) private readonly _registrationService: IRegistrationService,
        @inject(TYPES.UserProfileService) private readonly _userProfileService: IUserProfileService,
        @inject(TYPES.AuthenticationService) private readonly _authenticationService: IAuthenticationService,
        @inject(TYPES.AuthHelpers) private readonly _authHelpers: AuthHelpers,
        @inject(TYPES.TwilioEmailService) private readonly _twilioEmailService: ITwilioEmailService,
        @inject(TYPES.TokenService) private readonly _tokenService: ITokenService,
        @inject(TYPES.UserRepository) private readonly _userRepository: UserRepository,
        @inject(TYPES.VerificationRepository) private readonly _verificationRepository: VerificationRepository,
        @inject(TYPES.TransactionManager) private readonly _transactionManager: TransactionManager,
    ) { }

    async forgotPassword(dto: ForgotPasswordDTO): Promise<{ message: string; email: string; }> {
        await this._authenticationService.requestPasswordReset(dto.email);
        return { message: 'Password reset email sent', email: dto.email };
    }
    
    async resetPassword(dto: ResetPasswordDTO): Promise<{ message: string; }> {
        // Validate password confirmation
        if (dto.password !== dto.confirmPassword) {
            throw new ValidationError('Password and confirmation password do not match');
        }
        
        await this._authenticationService.resetPassword(dto.token, dto.password);
        return { message: 'Password reset successfully' };
    }

    async changePassword(dto: ChangePasswordDTO, user: IUser): Promise<{ message: string; }> {
        // verify current password
        const isPasswordValid  = await CryptoService.verifyHash(
            dto.currentPassword,
            user.password as string,
            user.salt as string
        );
        if (!isPasswordValid) {
            throw new ValidationError('Current password is incorrect');
        }
        // hash new password
        const newPassword = await CryptoService.hashString(dto.newPassword, user.salt as string);
        // update user password
        await this._userRepository.update(user._id!, {
            password: newPassword
        });
        return { message: 'Password changed successfully' };
    }
    getCurrentUser(user: IUser): Promise<UserResponseDTO> {
        return Promise.resolve(this._authHelpers.constructUserObject(user));
    }

    async register(dto: UserRegistrationDTO): Promise<UserResponseDTO> {
        const result = await this._registrationService.initRegistration(dto);
        return result;
    }

    async verifyEmail(dto: VerifyEmailDTO): Promise<{ accessToken: string, refreshToken: string, user: UserResponseDTO }> {
        const response = await this._registrationService.verifyEmailCode(dto);
        return {
            accessToken: response.accessToken,
            refreshToken: response.refreshToken,
            user: response.user as UserResponseDTO
        };
    }

    async resendEmailVerification(dto: VerifyEmailDTO): Promise<IEmailVerificationResponse> {
        // Get email from verification record using reference
        const verification = await this._verificationRepository.findByReference(dto.reference);
        if (!verification || !verification.identifier) {
            throw new UnprocessableEntityError('Invalid verification reference');
        }
        const response = await this._registrationService.resendVerification(verification.identifier, dto.reference);
        return response;
    }

    async refresh(dto: RefreshTokenDTO): Promise<{ accessToken: string; refreshToken: string; user: UserResponseDTO; }> {
        const response = await this._authenticationService.refreshAccessToken(dto.refresh_token);
        // response.user is already a UserResponseDTO, no need to construct it again
        return { accessToken: response.accessToken, refreshToken: response.refreshToken, user: response.user };
    }

    async login(dto: LoginDTO): Promise<{ accessToken: string; refreshToken: string; user: Partial<UserResponseDTO>; }> {

        const response = await this._authenticationService.authenticate(dto.identifier, dto.password);

        if (!response) {
            throw new Error('Authentication failed');
        }
        return { accessToken: response.accessToken, refreshToken: response.refreshToken, user: response.user };
    }

    async updateProfileImage(image: Express.Multer.File, user: IUser): Promise<UserResponseDTO> {
        return await this._userProfileService.updateProfileImage(image, user);
    }

    async logout(userId: string): Promise<{ message: string }> {
        if (!userId) {
            throw new ValidationError('User ID is required');
        }
        await this._authenticationService.revokeRefreshToken(userId);
        return { message: 'Logged out successfully' };
    }

    /**
     * New onboarding flow - Step 1: Initialize signup with email only
     * Creates a partial user record and sends OTP to email
     */
    async initSignup(dto: InitSignupDTO): Promise<IEmailVerificationResponse> {
        let transactionStarted = false;
        try {
            await this._transactionManager.beginTransaction({
                isolationLevel: DatabaseIsolationLevel.REPEATABLE_READ
            } as any);
            transactionStarted = true;

            // Check if user already exists
            await this._authHelpers.ensureUserDoesNotExistByEmail(dto.email);

            // Handle existing email verification
            await this._authHelpers.handleExistingEmailVerification(dto.email);

            // Create partial user with temporary password
            const tempPassword = CryptoService.generateRandomString(32);
            const salt = CryptoService.generateValidSalt();
            const hashedTempPassword = CryptoService.hashString(tempPassword, salt);

            const emailParts = dto.email.split('@');
            const firstName = emailParts[0];
            const lastName = '';

            const userData: Partial<IUser> = {
                first_name: firstName,
                last_name: lastName || firstName,
                email: dto.email.toLowerCase(),
                password: hashedTempPassword,
                salt: salt,
                status: UserStatus.PENDING_EMAIL_VERIFICATION,
                is_active: false,
                email_verified: false,
                auth_method: AuthMethod.PASSWORD,
                roles: [UserRole.USER],
                user_secret: UtilityService.generateUserSecret(),
            };

            const user = await this._userRepository.create(userData as IUser);
            if (!user || !user._id) {
                throw new ServiceError('Failed to create user');
            }

            // Generate OTP code (always random, even in development)
            const otpCode = UtilityService.generate4Digit();

            // Create verification record
            const verification = await this._authHelpers.createEmailVerificationRecord(
                user._id,
                dto.email.toLowerCase(),
                otpCode,
                salt
            );

            // Send OTP email - pass the OTP code that was stored in verification record
            await this._twilioEmailService.sendEmailVerification(
                dto.email.toLowerCase(),
                firstName,
                otpCode
            );

            await this._transactionManager.commit();
            
            return this._authHelpers.formatEmailVerificationResponse(verification);
        } catch (error: any) {
            if (transactionStarted) await this._transactionManager.rollback();
            if (error instanceof ValidationError || error instanceof UnprocessableEntityError) {
                throw error;
            }
            throw new ServiceError(`Failed to initialize signup: ${error.message}`);
        }
    }

    /**
     * New onboarding flow - Step 2: Verify OTP code and return temp token
     */
    async verifyEmailCode(dto: VerifyEmailDTO): Promise<{
        status: boolean;
        temp_token: string;
    }> {
        let transactionStarted = false;
        try {
            await this._transactionManager.beginTransaction({
                isolationLevel: DatabaseIsolationLevel.REPEATABLE_READ
            } as any);
            transactionStarted = true;

            // Get verification record by reference (reference uniquely identifies the verification)
            const verification = await this._verificationRepository.findByReference(dto.reference);
            
            if (!verification || verification.type !== VerificationType.EMAIL) {
                throw new UnprocessableEntityError('Invalid verification reference');
            }

            if (verification.status === VerificationStatus.COMPLETED) {
                throw new UnprocessableEntityError('Email verification already completed');
            }

            if (this._authHelpers.isVerificationExpired(verification.expiry!)) {
                throw new UnprocessableEntityError('Verification has expired');
            }

            if (this._authHelpers.isVerificationExpired(verification.otp!.expiry!)) {
                throw new ValidationError('OTP code has expired');
            }

            if (verification.attempts! >= 3) {
                throw new ValidationError('Too many failed attempts');
            }

            // Get user
            const user = await this._userRepository.findById(verification.user_id!);
            if (!user) {
                throw new ValidationError('User not found');
            }

            // Verify OTP code
            const salt = user.salt;
            if (!salt) {
                throw new ValidationError('User salt is missing. Please try signing up again.');
            }
            
            // Verify OTP code
            const hashedCode = CryptoService.hashString(dto.code, salt);
            if (hashedCode !== verification.otp!.code) {
                await this._verificationRepository.incrementAttempts(verification._id as string);
                throw new ValidationError('Invalid OTP code');
            }

            // Update verification status
            await this._verificationRepository.update(verification._id as string, {
                status: VerificationStatus.COMPLETED,
                otp: {
                    ...verification.otp!,
                    verified: true,
                    last_attempt: UtilityService.dateToUnix(new Date())
                }
            });

            // Mark email as verified
            await this._userRepository.update(user._id!, {
                email_verified: true
            });

            // Generate temp token for password setup
            const tempToken = this._tokenService.generateTempToken(user._id!, user.email!);

            await this._transactionManager.commit();

            return {
                status: true,
                temp_token: tempToken
            };
        } catch (error: any) {
            if (transactionStarted) await this._transactionManager.rollback();
            if (error instanceof ValidationError || error instanceof UnprocessableEntityError) {
                throw error;
            }
            throw new ServiceError(`Failed to verify email code: ${error.message}`);
        }
    }

    /**
     * New onboarding flow - Step 3: Set password using temp token
     */
    async setPassword(dto: SetPasswordDTO, tempToken: string): Promise<{
        // accessToken: string;
        // refreshToken: string;
        // user: UserResponseDTO;
        message: string;
    }> {
        let transactionStarted = false;
        try {
            await this._transactionManager.beginTransaction({
                isolationLevel: DatabaseIsolationLevel.REPEATABLE_READ
            } as any);
            transactionStarted = true;

            // Verify temp token
            const tokenData = this._tokenService.verifyTempToken(tempToken);
            const { userId, email } = tokenData;

            // Get user
            const user = await this._userRepository.findById(userId);
            if (!user) {
                throw new ValidationError('User not found');
            }

            if (user.email !== email) {
                throw new ValidationError('Email mismatch');
            }

            // Hash new password using existing salt
            const salt = user.salt;
            if (!salt) {
                // Generate new salt if user doesn't have one (shouldn't happen)
                const newSalt = CryptoService.generateValidSalt();
                const hashedPassword = CryptoService.hashString(dto.password, newSalt);
                
                const updatedUser = await this._userRepository.update(user._id!, {
                    password: hashedPassword,
                    salt: newSalt,
                    status: UserStatus.ACTIVE,
                    is_active: true,
                    roles: user.roles && user.roles.length > 0 ? user.roles: [UserRole.USER]
                } as IUser);
                
                const { accessToken, refreshToken } = await this._tokenService.generateTokens(updatedUser);
                await this._transactionManager.commit();
                
                return {
                    message: 'Password set successfully'
                    // accessToken,
                    // refreshToken,
                    // user: this._authHelpers.constructUserObject(updatedUser)
                };
            }
            
            const hashedPassword = CryptoService.hashString(dto.password, salt);

            // Update user with new password and activate
            const updatedUser = await this._userRepository.update(user._id!, {
                password: hashedPassword,
                status: UserStatus.ACTIVE,
                is_active: true
            } as IUser);

            if (!updatedUser) {
                throw new ServiceError('Failed to update user');
            }

            // Generate tokens
            const { accessToken, refreshToken } = await this._tokenService.generateTokens(updatedUser);

            await this._transactionManager.commit();

            return {
                // accessToken,
                // refreshToken,
                // user: this._authHelpers.constructUserObject(updatedUser)
                message: 'Password set successfully'
            };
        } catch (error: any) {
            if (transactionStarted) await this._transactionManager.rollback();
            if (error instanceof ValidationError || error instanceof UnprocessableEntityError) {
                throw error;
            }
            throw new ServiceError(`Failed to set password: ${error.message}`);
        }
    }
}