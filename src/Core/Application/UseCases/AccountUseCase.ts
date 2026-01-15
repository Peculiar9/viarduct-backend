import { inject, injectable } from 'inversify';
import { TYPES } from '../../Types/Constants';
import { IAccountUseCase } from '../Interface/UseCases/IAccountUseCase';
import { VerifyEmailDTO, IEmailVerificationResponse } from '../DTOs/AuthDTO';
import { UserResponseDTO, UpdateUserDTO, CreateUserDTO, UserProfileResponseDTO, UpdateEmailDTO, UpdatePhoneDTO, RequestEmailUpdateDTO, RequestPhoneUpdateDTO } from '../DTOs/UserDTO';
import { ResponseMessage } from '../Response/ResponseFormat';
import { LoginResponseDTO } from '../DTOs/AuthDTO';
import { AuthMethod, IUser } from '../Interface/Entities/auth-and-user/IUser';
import { AppError, ValidationError, UnprocessableEntityError, ServiceError, ConflictError, InternalServerError } from '../Error/AppError';
import { Console } from '../../../Infrastructure/Utils/Console';
import { IRegistrationService } from '../Interface/Services/IRegistrationService';
import { IUserProfileService } from '../Interface/Services/IUserProfileService';
import { UserRepository } from '../../../Infrastructure/Repository/SQL/users/UserRepository';
import { VerificationRepository } from '../../../Infrastructure/Repository/SQL/auth/VerificationRepository';
import { AuthHelpers } from '../../../Infrastructure/Services/helpers/AuthHelpers';
import { TransactionManager } from '../../../Infrastructure/Repository/SQL/Abstractions/TransactionManager';
import { CryptoService } from '../../Services/CryptoService';
import { VerificationType } from '../Interface/Entities/auth-and-user/IVerification';
import { VerificationStatus } from '../Interface/Entities/auth-and-user/IUser';
import { DatabaseIsolationLevel } from '../Enums/DatabaseIsolationLevel';
import { ITwilioEmailService } from '../Interface/Services/ITwilioEmailService';
import { ISMSService } from '../Interface/Services/ISMSService';
import { UtilityService } from '../../Services/UtilityService';
import { UserRole } from '../Enums/UserRole';
import { UserStatus } from '../Enums/UserStatus';
import { RoleRepository } from '../../../Infrastructure/Repository/SQL/roles/RoleRepository';

@injectable()
export class AccountUseCase implements IAccountUseCase {
    constructor(
        @inject(TYPES.RegistrationService) private readonly _registrationService: IRegistrationService,
        @inject(TYPES.UserProfileService) private readonly _userProfileService: IUserProfileService,
        @inject(TYPES.UserRepository) private readonly _userRepository: UserRepository,
        @inject(TYPES.VerificationRepository) private readonly _verificationRepository: VerificationRepository,
        @inject(TYPES.RoleRepository) private readonly _roleRepository: RoleRepository,
        @inject(TYPES.AuthHelpers) private readonly _authHelpers: AuthHelpers,
        @inject(TYPES.TransactionManager) private readonly _transactionManager: TransactionManager,
        @inject(TYPES.TwilioEmailService) private readonly _twilioEmailService: ITwilioEmailService,
        @inject(TYPES.SMSService) private readonly _smsService: ISMSService,
    ) { }

    async updateProfileImage(image: Express.Multer.File, user: IUser): Promise<UserResponseDTO> {
        return await this._userProfileService.updateProfileImage(image, user);
    }

    async resendEmailVerification(email: string, reference: string): Promise<IEmailVerificationResponse> {
        return await this._registrationService.resendVerification(email, reference);
    }

    async removeUser(email: string): Promise<UserResponseDTO | undefined> {
        return await this._userProfileService.removeUser(email);
    }

    async verifyEmailCode(data: VerifyEmailDTO): Promise<LoginResponseDTO> {
        try {
            Console.info("AccountUseCase::verifyEmailCode -> Verifying email code", { data });

            if (!data || !data.code || !data.reference) {
                throw new ValidationError(ResponseMessage.MISSING_REQUIRED_FIELDS);
            }

            const result = await this._registrationService.verifyEmailCode(data);
            return result;
        } catch (error: any) {
            Console.error(error, { message: 'Failed to verify email code' });
            if (error instanceof ValidationError || error instanceof UnprocessableEntityError) {
                throw error;
            }
            throw new ServiceError(ResponseMessage.EMAIL_VERIFICATION_FAILED);
        }
    }

    async createAdmin(dto: CreateUserDTO): Promise<UserResponseDTO> {
        if (!dto) {
            throw new ValidationError(ResponseMessage.INVALID_REQUEST_MESSAGE);
        }
        
        let transactionStarted = false;
        try {
            await this._transactionManager.beginTransaction({
                isolationLevel: DatabaseIsolationLevel.REPEATABLE_READ 
            } as any);
            transactionStarted = true;
    
            // Check if user already exists
            const existingUser = await this._userRepository.findByEmail(dto.email);
            if (existingUser) {
                throw new ConflictError("User with this email already exists");
            }
    
            // Create user object with admin role and verified status
            const salt = CryptoService.generateValidSalt();
            const hashedPassword = CryptoService.hashString(dto.password, salt);
            const userSecret = UtilityService.generateUserSecret();
    
            const userData: Partial<IUser> = {
                first_name: dto.first_name,
                last_name: dto.last_name,
                email: dto.email.toLowerCase(),
                password: hashedPassword,
                salt: salt,
                user_secret: userSecret,
                status: UserStatus.ACTIVE,
                is_active: true,
                email_verified: true,
                auth_method: AuthMethod.PASSWORD,
                roles: [UserRole.ADMIN], // Default to admin role
            };
    
            const user = await this._userRepository.create(userData as IUser);
            if (!user || !user._id) {
                throw new InternalServerError("Failed to create user in database");
            }
    
            // Assign admin role via role repository
            const adminRole = await this._roleRepository.findByName(UserRole.ADMIN);
            if (!adminRole) {
                throw new InternalServerError("Admin role not found. Please ensure roles are seeded.");
            }
    
            await this._roleRepository.assignRoleToUser(user._id, adminRole._id!);
    
            await this._transactionManager.commit();
            
            // Fetch user with roles and permissions
            return await this._authHelpers.constructUserObject(user);
        } catch (error: any) {
            if (transactionStarted) {
                await this._transactionManager.rollback();
            }
            if (error instanceof AppError) {
                throw error;
            }
            throw new InternalServerError(`Failed to create admin user: ${error.message}`);
        }
    }

    async updateProfile(userId: string, dto: UpdateUserDTO, existingUser: IUser): Promise<UserResponseDTO> {
        if (!userId || !dto) {
            throw new ValidationError(ResponseMessage.INVALID_UPDATE_REQUEST);
        }

        const user = existingUser || await this._userProfileService.getUserFromToken(userId);
        if (!user) {
            throw new ValidationError(ResponseMessage.USER_NOT_FOUND_MESSAGE);
        }

        const updatedUser = await this._userProfileService.updateUser(userId, dto, existingUser);
        return updatedUser as UserResponseDTO;
    }

    async getUserProfile(userId: string): Promise<UserResponseDTO> {
        if (!userId) {
            throw new ValidationError(ResponseMessage.USER_ID_REQUIRED_MESSAGE);
        }

        const user = await this._userProfileService.getUserFromToken(userId);
        if (!user) {
            throw new ValidationError(ResponseMessage.USER_NOT_FOUND_MESSAGE);
        }

        return user;
    }

    async requestEmailUpdate(userId: string, dto: RequestEmailUpdateDTO, user: IUser): Promise<IEmailVerificationResponse> {
        let transactionStarted = false;
        try {
            await this._transactionManager.beginTransaction({
                isolationLevel: DatabaseIsolationLevel.REPEATABLE_READ
            } as any);
            transactionStarted = true;

            // Check if new email already exists
            await this._authHelpers.ensureUserDoesNotExistByEmail(dto.new_email);

            // Handle existing email verification for this new email
            await this._authHelpers.handleExistingEmailVerification(dto.new_email);

            // Generate OTP code
            const otpCode = UtilityService.generate4Digit();

            // Create verification record for email update
            const verification = await this._authHelpers.createEmailVerificationRecord(
                userId,
                dto.new_email.toLowerCase(),
                otpCode,
                user.salt as string
            );

            // Send OTP email to the new email address
            const firstName = user.first_name || dto.new_email.split('@')[0];
            await this._twilioEmailService.sendEmailVerification(
                dto.new_email.toLowerCase(),
                firstName,
                otpCode
            );

            await this._transactionManager.commit();
            
            return this._authHelpers.formatEmailVerificationResponse(verification);
        } catch (error: any) {
            if (transactionStarted) {
                await this._transactionManager.rollback();
            }
            if (error instanceof ValidationError || error instanceof UnprocessableEntityError) {
                throw error;
            }
            throw new ServiceError(`Failed to request email update: ${error.message}`);
        }
    }

    async updateEmail(userId: string, dto: UpdateEmailDTO, user: IUser): Promise<{ message: string }> {
        let transactionStarted = false;
        try {
            await this._transactionManager.beginTransaction({
                isolationLevel: DatabaseIsolationLevel.REPEATABLE_READ
            } as any);
            transactionStarted = true;

            // Verify OTP code using reference
            const verification = await this._verificationRepository.findByReference(dto.reference);
            
            if (!verification || verification.type !== VerificationType.EMAIL) {
                throw new ValidationError('Invalid verification reference');
            }

            if (verification.status === VerificationStatus.COMPLETED) {
                throw new UnprocessableEntityError('Verification already completed');
            }

            if (this._authHelpers.isVerificationExpired(verification.expiry!)) {
                throw new ValidationError('Verification has expired');
            }

            if (this._authHelpers.isVerificationExpired(verification.otp!.expiry!)) {
                throw new ValidationError('OTP code has expired');
            }

            if (verification.otp!.attempts >= 3) {
                throw new ValidationError('Too many failed attempts');
            }

            // Verify OTP code
            const salt = user.salt;
            if (!salt) {
                throw new ValidationError('User salt is missing');
            }
            
            const hashedCode = CryptoService.hashString(dto.code, salt);
            if (hashedCode !== verification.otp!.code) {
                await this._verificationRepository.incrementAttempts(dto.reference);
                throw new ValidationError('Invalid verification code');
            }

            // Check if new email already exists
            await this._authHelpers.ensureUserDoesNotExistByEmail(dto.new_email);

            // Verify the verification is for the new email
            if (verification.identifier !== dto.new_email.toLowerCase()) {
                throw new ValidationError('Verification reference does not match the new email');
            }

            // Update user email
            await this._userRepository.update(userId, {
                email: dto.new_email.toLowerCase(),
                email_verified: true
            } as Partial<IUser>);

            // Mark verification as completed
            await this._verificationRepository.update(verification._id!, {
                status: VerificationStatus.COMPLETED,
                otp: {
                    ...verification.otp!,
                    verified: true
                }
            });

            await this._transactionManager.commit();
            
            return { message: 'Email updated successfully' };
        } catch (error: any) {
            if (transactionStarted) {
                await this._transactionManager.rollback();
            }
            if (error instanceof ValidationError || error instanceof UnprocessableEntityError) {
                throw error;
            }
            throw new ServiceError(`Failed to update email: ${error.message}`);
        }
    }

    async requestPhoneUpdate(userId: string, dto: RequestPhoneUpdateDTO, user: IUser): Promise<IEmailVerificationResponse> {
        let transactionStarted = false;
        try {
            await this._transactionManager.beginTransaction({
                isolationLevel: DatabaseIsolationLevel.REPEATABLE_READ
            } as any);
            transactionStarted = true;

            // Check if new phone already exists
            await this._authHelpers.ensureUserDoesNotExistByPhone(dto.new_phone);

            // Handle existing phone verification for this new phone
            await this._authHelpers.handleExistingPhoneVerification(dto.new_phone);

            // Generate OTP code
            const otpCode = UtilityService.generate4Digit();

            // Create verification record for phone update
            const verification = await this._authHelpers.createPhoneVerificationRecord(
                userId,
                dto.new_phone,
                otpCode,
                user.salt as string
            );

            // Send OTP SMS to the new phone number
            const smsMessage = `Your verification code is: ${otpCode}. This code expires in 15 minutes.`;
            await this._smsService.sendSMS(dto.new_phone, smsMessage);

            await this._transactionManager.commit();
            
            return this._authHelpers.formatEmailVerificationResponse(verification);
        } catch (error: any) {
            if (transactionStarted) {
                await this._transactionManager.rollback();
            }
            if (error instanceof ValidationError || error instanceof UnprocessableEntityError) {
                throw error;
            }
            throw new ServiceError(`Failed to request phone update: ${error.message}`);
        }
    }

    async updatePhone(userId: string, dto: UpdatePhoneDTO, user: IUser): Promise<{ message: string }> {
        let transactionStarted = false;
        try {
            await this._transactionManager.beginTransaction({
                isolationLevel: DatabaseIsolationLevel.REPEATABLE_READ
            } as any);
            transactionStarted = true;

            // Verify OTP code using reference
            const verification = await this._verificationRepository.findByReference(dto.reference);
            
            if (!verification || verification.type !== VerificationType.PHONE) {
                throw new ValidationError('Invalid verification reference');
            }

            if (verification.status === VerificationStatus.COMPLETED) {
                throw new UnprocessableEntityError('Verification already completed');
            }

            if (this._authHelpers.isVerificationExpired(verification.expiry!)) {
                throw new ValidationError('Verification has expired');
            }

            if (this._authHelpers.isVerificationExpired(verification.otp!.expiry!)) {
                throw new ValidationError('OTP code has expired');
            }

            if (verification.otp!.attempts >= 3) {
                throw new ValidationError('Too many failed attempts');
            }

            // Verify OTP code
            const salt = user.salt;
            if (!salt) {
                throw new ValidationError('User salt is missing');
            }
            
            const hashedCode = CryptoService.hashString(dto.code, salt);
            if (hashedCode !== verification.otp!.code) {
                await this._verificationRepository.incrementAttempts(dto.reference);
                throw new ValidationError('Invalid verification code');
            }

            // Check if new phone already exists
            await this._authHelpers.ensureUserDoesNotExistByPhone(dto.new_phone);

            // Verify the verification is for the new phone
            if (verification.identifier !== dto.new_phone) {
                throw new ValidationError('Verification reference does not match the new phone number');
            }

            // Update user phone
            const updateData: Partial<IUser> = {
                phone: dto.new_phone
            };
            
            if (dto.international_phone) {
                updateData.international_phone = dto.international_phone;
            }
            
            if (dto.country_code) {
                updateData.country_code = dto.country_code;
            }

            await this._userRepository.update(userId, updateData);

            // Mark verification as completed
            await this._verificationRepository.update(verification._id!, {
                status: VerificationStatus.COMPLETED,
                otp: {
                    ...verification.otp!,
                    verified: true
                }
            });

            await this._transactionManager.commit();
            
            return { message: 'Phone number updated successfully' };
        } catch (error: any) {
            if (transactionStarted) {
                await this._transactionManager.rollback();
            }
            if (error instanceof ValidationError || error instanceof UnprocessableEntityError) {
                throw error;
            }
            throw new ServiceError(`Failed to update phone: ${error.message}`);
        }
    }

}