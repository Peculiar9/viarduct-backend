import { Column, CompositeIndex, ForeignKey, Index } from '../../../extensions/decorators';
import { TableNames } from '../Enums/TableNames';
import { IUserBankAccount, UserBankAccountType } from '../Interface/Entities/bank/IUserBankAccount';

@CompositeIndex(['user_id', 'type'])
@CompositeIndex(['type', 'is_active'])
export class UserBankAccount implements IUserBankAccount {
    @Column('UUID PRIMARY KEY DEFAULT gen_random_uuid()')
    public _id?: string;

    @Index({ unique: false })
    @ForeignKey({
        table: TableNames.USERS,
        field: '_id',
        constraint: 'fk_user_bank_account_user_id'
    })
    @Column('UUID DEFAULT NULL')
    public user_id?: string | null;

    @Index({ unique: false })
    @Column('VARCHAR(20) NOT NULL')
    public type: UserBankAccountType;

    @Column('VARCHAR(20) NOT NULL')
    public account_number: string;

    @Column('VARCHAR(20) NOT NULL')
    public bank_code: string;

    @Column('VARCHAR(100) NOT NULL')
    public bank_name: string;

    @Column('VARCHAR(255) NOT NULL')
    public account_name: string;

    @Column('VARCHAR(100) DEFAULT NULL')
    public label?: string | null;

    @Column('BOOLEAN DEFAULT TRUE')
    public is_active: boolean;

    @Column('BOOLEAN DEFAULT FALSE')
    public is_default: boolean;

    @ForeignKey({
        table: TableNames.USERS,
        field: '_id',
        constraint: 'fk_user_bank_account_created_by'
    })
    @Column('UUID NOT NULL')
    public created_by: string;

    @Index({ unique: false })
    @Column('TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP')
    public created_at: string;

    @Index({ unique: false })
    @Column('TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP')
    public updated_at: string;
}
