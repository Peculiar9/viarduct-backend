import { Column, ForeignKey, Index } from '../../../extensions/decorators';
import { TableNames } from '../Enums/TableNames';
import { IWithdrawalRequest } from '../Interface/Entities/withdrawal/IWithdrawalRequest';

export class WithdrawalRequest implements IWithdrawalRequest {
    @Column('UUID PRIMARY KEY DEFAULT gen_random_uuid()')
    public _id?: string;

    @Index({ unique: false })
    @ForeignKey({
        table: TableNames.USERS,
        field: '_id',
        constraint: 'fk_withdrawal_request_user_id'
    })
    @Column('UUID NOT NULL')
    public user_id: string;

    @Column('VARCHAR(20) NOT NULL')
    public recipient_account_number: string;

    @Column('VARCHAR(20) NOT NULL')
    public recipient_bank_code: string;

    @Column('VARCHAR(255) NOT NULL')
    public recipient_bank_name: string;

    @Column('VARCHAR(255) NOT NULL')
    public recipient_account_name: string;

    @Column('VARCHAR(50) DEFAULT NULL')
    public paystack_recipient_code?: string | null;

    @Column('DECIMAL(20,2) NOT NULL')
    public amount: number;

    @Index({ unique: false })
    @Column('VARCHAR(20) NOT NULL DEFAULT \'draft\'')
    public status: IWithdrawalRequest['status'];

    @Column('VARCHAR(100) DEFAULT NULL')
    public paystack_transfer_code?: string | null;

    @Column('TEXT DEFAULT NULL')
    public failure_reason?: string | null;

    @Index({ unique: false })
    @Column('TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP')
    public created_at: string;

    @Index({ unique: false })
    @Column('TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP')
    public updated_at: string;

    @Column('TIMESTAMP WITH TIME ZONE DEFAULT NULL')
    public completed_at?: string | null;
}
