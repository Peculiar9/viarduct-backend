/**
 * Seed data for initial database setup
 * This file contains all the default data that should be seeded when the application starts
 */

export const SEED_DATA = {
    users: {
        superadmin: {
            first_name: 'Viarduct',
            last_name: 'Viarduct',
            email: 'superadmin@viarduct.com',
            password: 'password1@',
            email_verified: true,
            status: 'active',
            is_active: true,
            role: 'superadmin'
        }
    }
};

