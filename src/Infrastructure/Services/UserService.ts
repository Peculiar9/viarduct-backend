import { inject, injectable } from 'inversify';
import { TYPES } from '../../Core/Types/Constants';
import { BaseApiService } from '../API/BaseApiService';
import { HttpClientFactory } from '../Http/HttpClientFactory';
import { UserResponseDTO } from '../../Core/Application/DTOs/UserDTO';
import { IUser } from '../../Core/Application/Interface/Entities/auth-and-user/IUser';
import { UserRepository } from '../Repository/SQL/users/UserRepository';
import { UserRole } from '../../Core/Application/Enums/UserRole';
import { RoleRepository } from '../Repository/SQL/roles/RoleRepository';

@injectable()
export class UserService extends BaseApiService {
    constructor(
        @inject(TYPES.HttpClientFactory) httpClientFactory: HttpClientFactory,
        @inject(TYPES.UserRepository) private userRepository: UserRepository,
        @inject(TYPES.RoleRepository) private roleRepository: RoleRepository
    ) {
        super(httpClientFactory, process.env.API_BASE_URL!);
    }

    async getAllUsers(): Promise<UserResponseDTO[]> {
        const users = await this.userRepository.findAll();
        return Promise.all(users.map((user: IUser) => this.constructUserObject(user)));
    }

    // Method for making authenticated API calls to external services
    async makeExternalApiCall(token: string) {
        const authenticatedClient = this.createAuthenticatedClient(token);
        return await authenticatedClient.get('/some-external-endpoint');
    }

    private async constructUserObject(user: IUser): Promise<UserResponseDTO> {
        // Fetch user roles and permissions from database
        let roleNames: string[] = [];
        let permissionValues: string[] = [];
        
        if (user._id) {
            try {
                const userRoles = await this.roleRepository.getUserRoles(user._id);
                roleNames = userRoles.map(role => role.name);
                
                const userPermissions = await this.roleRepository.getUserPermissions(user._id);
                permissionValues = userPermissions.map(permission => permission.value);
            } catch (error: any) {
                // If roles/permissions can't be fetched, use roles from user object as fallback
                roleNames = (user.roles as string[]) || [];
                console.error('Error fetching user roles/permissions:', error.message);
            }
        } else {
            // Fallback to user.roles if no _id
            roleNames = (user.roles as string[]) || [];
        }
        
        return {
            id: user._id as string,
            first_name: user.first_name as string,
            last_name: user.last_name as string,
            // email and phone are commented out in UserResponseDTO for security
            // email: user.email as string,
            // phone: user.phone as string,
            profile_image: user.profile_image as string,
            roles: roleNames,
            permissions: permissionValues,
            status: user.status as string,
            is_active: user.is_active,
            created_at: user.created_at as string,
            updated_at: user.updated_at as string,
            has_set_transaction_pin: user.has_set_transaction_pin ?? false,
        };
    }
}


