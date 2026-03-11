import { Column, ForeignKey, Index } from '../../../extensions/decorators';
import { TableNames } from '../Enums/TableNames';

export class UserTransactionPin {
    @Column('UUID PRIMARY KEY DEFAULT gen_random_uuid()')
    public _id?: string;

    @Index({ unique: true })
    @ForeignKey({
        table: TableNames.USERS,
        field: '_id',
        constraint: 'fk_user_transaction_pin_user_id'
    })
    @Column('UUID NOT NULL')
    public user_id: string;

    @Column('VARCHAR(255) NOT NULL')
    public pin_hash: string;

    @Index({ unique: false })
    @Column('TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP')
    public created_at: string;

    @Index({ unique: false })
    @Column('TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP')
    public updated_at: string;
}
