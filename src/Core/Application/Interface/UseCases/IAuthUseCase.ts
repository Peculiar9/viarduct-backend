// Authentication use cases interface

import { IUser } from "../Entities/auth-and-user/IUser";
import { UserRegistrationDTO } from "../../DTOs/AuthDTOV2";
import {
    ChangePasswordDTO,
    ForgotPasswordDTO,
    IEmailVerificationResponse,
    InitSignupDTO,
    LoginDTO,
    RefreshTokenDTO,
    ResetPasswordDTO,
    SetPasswordDTO,
    VerifyEmailDTO
} from "../../DTOs/AuthDTO";
import { UserResponseDTO } from "../../DTOs/UserDTO";

export interface IAuthUseCase {
    register(dto: UserRegistrationDTO): Promise<UserResponseDTO>;
    verifyEmail(dto: VerifyEmailDTO): Promise<{ accessToken: string, refreshToken: string, user: UserResponseDTO }>;
    resendEmailVerification(dto: VerifyEmailDTO): Promise<IEmailVerificationResponse>;

    // New onboarding flow
    initSignup(dto: InitSignupDTO): Promise<IEmailVerificationResponse>;
    verifyEmailCode(dto: VerifyEmailDTO): Promise<{ status: boolean; temp_token: string }>;
    setPassword(dto: SetPasswordDTO, tempToken: string): Promise<{ message: string }>;

    updateProfileImage(image: Express.Multer.File, user: IUser): Promise<UserResponseDTO>;
    refresh(dto: RefreshTokenDTO): Promise<{ accessToken: string, refreshToken: string, user: UserResponseDTO }>;
    login(dto: LoginDTO): Promise<{ accessToken: string, refreshToken: string, user: Partial<UserResponseDTO> }>;
    logout(userId: string): Promise<{ message: string }>;
    // logout(): Promise<UserResponseDTO>;

    // Password management
    forgotPassword(dto: ForgotPasswordDTO): Promise<{ message: string, email: string }>;
    resetPassword(dto: ResetPasswordDTO): Promise<{ message: string }>;
    changePassword(dto: ChangePasswordDTO, user: IUser): Promise<{ message: string }>;

    // User profile
    getCurrentUser(user: IUser): Promise<UserResponseDTO>;
}
