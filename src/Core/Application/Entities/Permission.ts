import { Column, Index } from '../../../extensions/decorators';
import { IPermission } from '../Interface/Entities/auth-and-user/IPermission';

export class Permission implements IPermission {
    @Column('UUID PRIMARY KEY DEFAULT gen_random_uuid()')
    public _id?: string;

    @Column('VARCHAR(255) NOT NULL')
    public name: string;

    @Index({ unique: true })
    @Column('VARCHAR(255) NOT NULL UNIQUE')
    public value: string;

    @Index({ unique: false })
    @Column('VARCHAR(255) NOT NULL')
    public group_name: string;

    @Column('VARCHAR(500) NOT NULL')
    public description: string;

    @Column('TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP')
    public created_at?: string;

    @Column('TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP')
    public updated_at?: string;
}

