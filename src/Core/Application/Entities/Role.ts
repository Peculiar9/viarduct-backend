import { Column, Index } from '../../../extensions/decorators';
import { IRole } from '../Interface/Entities/auth-and-user/IRole';

export class Role implements IRole {
    @Column('UUID PRIMARY KEY DEFAULT gen_random_uuid()')
    public _id?: string;

    @Index({ unique: true })
    @Column('VARCHAR(100) NOT NULL UNIQUE')
    public name: string;

    @Column('VARCHAR(500) NOT NULL')
    public description: string;

    @Column('BOOLEAN DEFAULT false')
    public is_system: boolean;

    @Column('TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP')
    public created_at?: string;

    @Column('TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP')
    public updated_at?: string;
}

