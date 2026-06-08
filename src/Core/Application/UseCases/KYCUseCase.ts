import { inject, injectable } from "inversify";
import { TYPES } from "../../../Core/Types/Constants";
import { IKYCUseCase } from "../Interface/UseCases/IKYCUseCase";
import { IUserKYC, KYCStage, KYCStatus } from "../Interface/Entities/auth-and-user/IVerification";
import { UserKYCRepository } from "../../../Infrastructure/Repository/SQL/auth/UserKYCRepository";
import { UserRepository } from "../../../Infrastructure/Repository/SQL/users/UserRepository";
import { RegistrationError, ValidationError, ConflictError } from "../Error/AppError";
import { IdentityVerificationDTO, PersonalInfoDTO } from "../DTOs/UserDTO";
import { INotificationService } from "../Interface/Services/INotificationService";
import { NotificationType } from "../Enums/NotificationType";
import { IPremblyKycService } from "../Interface/Services/IPremblyKycService";
import { Console } from "../../../Infrastructure/Utils/Console";
import { extractPremblyIdentityFields } from "../../../Infrastructure/Services/kyc/PremblyResponseMapper";
// Re-enable with DOB block in verifyIdentity:
// import { extractDateOfBirthFromPremblyRaw } from "../../../Infrastructure/Services/kyc/PremblyResponseMapper";
// import { datesOfBirthMatch, normalizeDateOfBirthToIso } from "../../../Infrastructure/Services/kyc/DateOfBirthMatcher";

@injectable()
export class KYCUseCase implements IKYCUseCase {
    constructor(
        @inject(TYPES.UserKYCRepository) private readonly userKYCRepository: UserKYCRepository,
        @inject(TYPES.UserRepository) private readonly userRepository: UserRepository,
        @inject(TYPES.NotificationService) private readonly notificationService: INotificationService,
        @inject(TYPES.PremblyKycService) private readonly premblyKycService: IPremblyKycService
    ) {}
    
    
    async checkOrInitializeKYC(userId: string): Promise<IUserKYC> {
        const userKYC = await this.userKYCRepository.findByUserId(userId);
        if (!userKYC) {
            const user = await this.userRepository.findById(userId);
                if (!user) {
                throw new RegistrationError("User not found");
            }
            

            const newUserKYC: Partial<IUserKYC> = {
                user_id: userId,
                status: KYCStatus.PENDING,
                // current_stage: KYCStage.FACE_UPLOAD,
                stage_metadata: {},
            }
            return this.userKYCRepository.create(newUserKYC);
        }

        if(userKYC.status === KYCStatus.COMPLETED) {
            throw new RegistrationError("User already completed KYC, proceed to app");
        }
        return userKYC;
    }
    getFaceImageUploadUrls(userId: string): Promise<{ frontFace: { uploadUrl: string; key: string; }; sideFace: { uploadUrl: string; key: string; }; }> {
        throw new Error("Method not implemented.");
    }
    submitFaceImages(userId: string, frontFaceKey: string, sideFaceKey: string): Promise<IUserKYC> {
        throw new Error("Method not implemented.");
    }
    getLicenseUploadUrl(userId: string): Promise<{ uploadUrl: string; key: string; }> {
        throw new Error("Method not implemented.");
    }
    submitLicenseAndPerformVerifications(userId: string, licenseKey: string): Promise<IUserKYC> {
        throw new Error("Method not implemented.");
    }
    addPaymentMethod(userId: string, paymentToken: string): Promise<IUserKYC> {
        throw new Error("Method not implemented.");
    }

    async addPersonalInfo(userId: string, dto: PersonalInfoDTO): Promise<IUserKYC> {
        // Update the user record
        const user = await this.userRepository.findById(userId);
        if (!user) {
            throw new RegistrationError("User not found");
        }
        
        user.dob = dto.date_of_birth;
        user.first_name = dto.first_name;
        user.last_name = dto.last_name;
        user.country = dto.country;
        user.country_code = dto.country_code || (dto.country === 'Nigeria' ? '+234' : '+234');
        user.state = dto.state;
        user.state_code = dto.state_code;
        user.kyc_stage = KYCStage.PERSONAL_INFO;
        await this.userRepository.update(userId, user);
        
        // Create or update the user kyc record
        let userKyc = await this.userKYCRepository.findByUserId(userId);
        if (!userKyc) {
            const newUserKyc: Partial<IUserKYC> = {
                user_id: userId,
                current_stage: KYCStage.PERSONAL_INFO,
                status: KYCStatus.IN_PROGRESS,
                stage_metadata: {
                    personal_info: {
                        country: dto.country,
                        state: dto.state,
                        state_code: dto.state_code,
                        date_of_birth: dto.date_of_birth
                    }
                },
            };
            userKyc = await this.userKYCRepository.create(newUserKyc);
        } else {
            const updatedKyc = await this.userKYCRepository.updateStage(userId, KYCStage.PERSONAL_INFO, KYCStatus.IN_PROGRESS, {
                personal_info: {
                    country: dto.country,
                    state: dto.state,
                    state_code: dto.state_code,
                    date_of_birth: dto.date_of_birth
                },
            });
            if (!updatedKyc) {
                throw new RegistrationError("Failed to update KYC record");
            }
            userKyc = updatedKyc;
        }
        
        // Fire-and-forget style: if notification fails, don't block KYC progression
        try {
            await this.notificationService.create({
                user_id: userId,
                type: NotificationType.VERIFICATION,
                title: 'KYC started',
                content: 'Your personal information has been submitted. Continue to complete your identity verification.',
                url: '/kyc'
            });
        } catch {
            // ignore notification errors
        }

        return userKyc;
    }


    async verifyIdentity(userId: string, dto: IdentityVerificationDTO): Promise<IUserKYC> {
        const user = await this.userRepository.findById(userId);
        if (!user) {
            throw new RegistrationError("User not found");
        }

        // Validate identity value length
        if (dto.type === "BVN") {
            if (dto.value.length !== 11 || !/^\d+$/.test(dto.value)) {
                throw new ValidationError("BVN must be exactly 11 digits");
            }
        } else if (dto.type === "NIN") {
            if (dto.value.length !== 11 || !/^\d+$/.test(dto.value)) {
                throw new ValidationError("NIN must be exactly 11 digits");
            }
        } else {
            throw new ValidationError("Identity type must be either BVN or NIN");
        }

        const existingKYC = await this.userKYCRepository.findByIdentityValue(dto.type, dto.value, userId);
        if (existingKYC) {
            throw new ConflictError(`This ${dto.type} is already registered to another user`);
        }

        console.warn(`[KYC] verifyIdentity → calling Prembly`, { userId, type: dto.type });
        Console.info('KYC verifyIdentity: calling Prembly', { userId, type: dto.type });
        const verification =
            dto.type === 'BVN'
                ? await this.premblyKycService.verifyBVN(dto.value)
                : await this.premblyKycService.verifyNIN(dto.value);

        console.warn(`[KYC] verifyIdentity ← Prembly result`, {
            userId,
            type: dto.type,
            provider: verification.provider,
            verified: verification.verified,
            responseCode: verification.responseCode,
            reference: verification.reference
        });
        Console.info('KYC verifyIdentity: Prembly result', {
            userId,
            type: dto.type,
            provider: verification.provider,
            verified: verification.verified,
            responseCode: verification.responseCode,
            reference: verification.reference
        });

        if (!verification.verified) {
            // Keep KYC record but mark as failed for admin visibility
            await this.userKYCRepository.setFailure(
                userId,
                verification.detail || `${dto.type} verification failed`
            );
            throw new ValidationError(verification.detail || `${dto.type} verification failed`);
        }

        // Get or create user KYC record (needed for profile DOB + metadata merge)
        let userKyc = await this.userKYCRepository.findByUserId(userId);
        if (!userKyc) {
            // Initialize KYC if it doesn't exist
            const newUserKyc: Partial<IUserKYC> = {
                user_id: userId,
                current_stage: KYCStage.IDENTITY_VERIFICATION,
                status: KYCStatus.IN_PROGRESS,
                stage_metadata: {},
            };
            userKyc = await this.userKYCRepository.create(newUserKyc);
        }

        const identityKind = dto.type === 'NIN' ? 'NIN' : 'BVN';
        const providerIdentity = extractPremblyIdentityFields(verification.raw, identityKind);

        // --- DOB vs Prembly (disabled for test / staging — re-enable before production) ---
        // const personalInfo = (userKyc.stage_metadata?.personal_info || {}) as Record<string, unknown>;
        // const declaredDob =
        //     (personalInfo.date_of_birth as string) || user.dob || '';
        // if (!declaredDob?.trim()) {
        //     throw new ValidationError(
        //         'Submit your profile (including date of birth) via POST /api/v1/kyc/profile before verifying BVN or NIN'
        //     );
        // }
        // const providerDob =
        //     (typeof providerIdentity?.date_of_birth === 'string'
        //         ? providerIdentity.date_of_birth
        //         : undefined) ||
        //     extractDateOfBirthFromPremblyRaw(verification.raw, identityKind);
        // if (!providerDob?.trim()) {
        //     const reason =
        //         dto.type === 'NIN'
        //             ? 'Identity provider did not return a date of birth for this NIN. ' +
        //               'Check prembly_debug.full_response.data.birthdate — your profile date_of_birth must match (e.g. 23-05-1999 or 1999-05-23).'
        //             : 'Identity provider did not return a date of birth';
        //     await this.userKYCRepository.setFailure(userId, reason);
        //     throw new ValidationError(reason);
        // }
        // const dobMatch = datesOfBirthMatch(declaredDob, providerDob);
        // const declaredIso = normalizeDateOfBirthToIso(declaredDob);
        // const providerIso = normalizeDateOfBirthToIso(providerDob);
        // if (!dobMatch) {
        //     const reason =
        //         'Date of birth does not match the records linked to this BVN/NIN. ' +
        //         'Please check your profile date of birth and try again.';
        //     await this.userKYCRepository.updateStage(userId, KYCStage.IDENTITY_VERIFICATION, KYCStatus.FAILED, {
        //         identity_verification: {
        //             identity_type: dto.type,
        //             identity_value: dto.value,
        //             verified_at: new Date().toISOString(),
        //             provider: verification.provider,
        //             provider_verified: false,
        //             provider_reference: verification.reference,
        //             provider_response_code: verification.responseCode,
        //             provider_identity: providerIdentity,
        //             dob_match: false,
        //             declared_date_of_birth: declaredDob,
        //             provider_date_of_birth: providerDob,
        //             declared_date_of_birth_iso: declaredIso,
        //             provider_date_of_birth_iso: providerIso
        //         }
        //     });
        //     await this.userKYCRepository.setFailure(userId, reason);
        //     throw new ValidationError(reason);
        // }
        // --- end DOB vs Prembly ---

        // Update KYC stage with identity verification data
        const updatedKyc = await this.userKYCRepository.updateStage(
            userId,
            KYCStage.IDENTITY_VERIFICATION,
            KYCStatus.IN_PROGRESS,
            {
                identity_verification: {
                    identity_type: dto.type,
                    identity_value: dto.value,
                    verified_at: new Date().toISOString(),
                    provider: verification.provider,
                    provider_verified: verification.verified,
                    provider_reference: verification.reference,
                    provider_response_code: verification.responseCode,
                    provider_identity: providerIdentity,
                    dob_match_skipped: true,
                    provider_raw: verification.raw
                }
            }
        );

        if (!updatedKyc) {
            throw new RegistrationError("Failed to update KYC record");
        }

        // Sync to User entity
        user.kyc_stage = KYCStage.IDENTITY_VERIFICATION;
        // Mark KYC complete when Prembly verifies BVN/NIN (DOB match disabled in test — see block above)
        user.has_completed_kyc = true;
        await this.userRepository.update(userId, user);

        try {
            await this.notificationService.create({
                user_id: userId,
                type: NotificationType.VERIFICATION,
                title: 'KYC submitted',
                content: 'Your identity information has been submitted successfully.',
                url: '/kyc'
            });
        } catch {
            // ignore notification errors
        }

        return updatedKyc;
    }

    /**
     * Helper method to sync User entity from UserKYC
     */
    private async syncUserKYCStatus(userId: string, userKYC: IUserKYC): Promise<void> {
        await this.userRepository.update(userId, {
            kyc_stage: userKYC.current_stage,
            has_completed_kyc: userKYC.status === KYCStatus.COMPLETED
        } as any);
    }
    
}