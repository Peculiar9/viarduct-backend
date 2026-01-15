import { UserResponseDTO } from './UserDTO';

/**
 * DTO for refresh token result
 */
export class RefreshTokenResultDTO {
    user: UserResponseDTO;
    accessToken: string;
    refreshToken: string;
}

/**
 * DTO for token pair
 */
export class TokenPairDTO {
    accessToken: string;
    refreshToken: string;
}

/**
 * DTO for login result
 */
export class LoginResultDTO {
    user: UserResponseDTO;
    accessToken: string;
    refreshToken: string;
    message: string;
}
