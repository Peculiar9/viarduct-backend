import { inject, injectable } from 'inversify';
import { TYPES } from '../../Core/Types/Constants';
import { TransactionManager } from '../Repository/SQL/Abstractions/TransactionManager';
import { UserRepository } from '../Repository/SQL/users/UserRepository';
import { RoleRepository } from '../Repository/SQL/roles/RoleRepository';
import { SEED_DATA } from './SeedData';
import { Console } from '../Utils/Console';
import { CryptoService } from '../../Core/Services/CryptoService';
import { UtilityService } from '../../Core/Services/UtilityService';
import { IUser } from '../../Core/Application/Interface/Entities/auth-and-user/IUser';
import { UserStatus } from '../../Core/Application/Enums/UserStatus';
import { AuthMethod } from '../../Core/Application/Interface/Entities/auth-and-user/IUser';

@injectable()
export class UserSeeder {
    constructor(
        @inject(TYPES.TransactionManager) private transactionManager: TransactionManager,
        @inject(TYPES.UserRepository) private userRepository: UserRepository,
        @inject(TYPES.RoleRepository) private roleRepository: RoleRepository,
    ) {}

    async seed(): Promise<void> {
        try {
            await this.transactionManager.beginTransaction();
            
            // Seed superadmin user
            await this.seedSuperadmin();
            
            await this.transactionManager.commit();
            Console.info('User seeding completed successfully');
        } catch (error: any) {
            await this.transactionManager.rollback();
            Console.error(error, { message: 'Failed to seed users' });
            throw error;
        }
    }

    private async seedSuperadmin(): Promise<void> {
        const superadminData = SEED_DATA.users.superadmin;
        
        // Check if superadmin user already exists
        const existingUser = await this.userRepository.findByEmail(superadminData.email);
        if (existingUser) {
            Console.info('Superadmin user already exists, skipping creation');
            
            // Ensure superadmin role is assigned
            const superadminRole = await this.roleRepository.findByName('superadmin');
            if (superadminRole) {
                const userRoles = await this.roleRepository.getUserRoles(existingUser._id!);
                const hasSuperadminRole = userRoles.some(role => role.name === 'superadmin');
                
                if (!hasSuperadminRole) {
                    await this.roleRepository.assignRoleToUser(existingUser._id!, superadminRole._id!);
                    Console.info('Superadmin role assigned to existing user');
                }
            }
            return;
        }

        // Generate salt and hash password
        const salt = CryptoService.generateValidSalt();
        const hashedPassword = CryptoService.hashString(superadminData.password, salt);
        const userSecret = UtilityService.generateUserSecret();

        // Create user object
        const userData: Partial<IUser> = {
            first_name: superadminData.first_name,
            last_name: superadminData.last_name,
            email: superadminData.email.toLowerCase(),
            password: hashedPassword,
            salt: salt,
            user_secret: userSecret,
            status: superadminData.status as UserStatus,
            is_active: superadminData.is_active,
            email_verified: superadminData.email_verified,
            auth_method: AuthMethod.PASSWORD,
            roles: [], // Roles will be assigned via user_roles table
        };

        // Create user
        const user = await this.userRepository.create(userData as IUser);
        if (!user || !user._id) {
            throw new Error('Failed to create superadmin user');
        }

        Console.info(`Superadmin user created: ${user.email}`);

        // Assign superadmin role
        const superadminRole = await this.roleRepository.findByName('superadmin');
        if (!superadminRole) {
            Console.warn('Superadmin role not found. Please ensure roles are seeded before users.');
            return;
        }

        await this.roleRepository.assignRoleToUser(user._id, superadminRole._id!);
        Console.info('Superadmin role assigned to user');
    }
}

