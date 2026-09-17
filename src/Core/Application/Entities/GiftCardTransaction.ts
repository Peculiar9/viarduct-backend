import { Column, ForeignKey, Index } from '../../../extensions/decorators';
import { TableNames } from '../Enums/TableNames';
import {
    GiftCardPaymentCurrency,
    GiftCardPurchaseStatus,
    IGiftCardTransaction
} from '../Interface/Entities/giftcard/IGiftCardTransaction';

export class GiftCardTransaction implements IGiftCardTransaction {
    @Column('UUID PRIMARY KEY DEFAULT gen_random_uuid()')
    public _id?: string;

    @Index({ unique: false })
    @ForeignKey({
        table: TableNames.USERS,
        field: '_id',
        constraint: 'fk_gift_card_transaction_user_id'
    })
    @Column('UUID NOT NULL')
    public user_id: string;

    @Index({ unique: false })
    @Column('INTEGER NOT NULL')
    public product_id: number;

    @Column('VARCHAR(255) DEFAULT NULL')
    public product_name?: string | null;

    @Column('VARCHAR(10) DEFAULT NULL')
    public country_code?: string | null;

    @Column('DECIMAL(20, 8) NOT NULL')
    public unit_price: number;

    @Column('INTEGER NOT NULL DEFAULT 1')
    public quantity: number;

    @Column('VARCHAR(10) NOT NULL DEFAULT \'NGN\'')
    public payment_currency: GiftCardPaymentCurrency;

    @Column('DECIMAL(20, 8) NOT NULL')
    public payment_amount: number;

    @Column('VARCHAR(255) NOT NULL')
    public recipient_email: string;

    @Index({ unique: true })
    @Column('VARCHAR(100) NOT NULL')
    public custom_identifier: string;

    @Column('VARCHAR(30) NOT NULL DEFAULT \'reloadly\'')
    public provider: string;

    @Index({ unique: false })
    @Column('VARCHAR(100) DEFAULT NULL')
    public provider_transaction_id?: string | null;

    @Index({ unique: false })
    @Column('VARCHAR(20) NOT NULL DEFAULT \'PROCESSING\'')
    public status: GiftCardPurchaseStatus;

    @Column('TEXT DEFAULT NULL')
    public claim_code_encrypted?: string | null;

    @Column('TEXT DEFAULT NULL')
    public pin_encrypted?: string | null;

    @Column('TEXT DEFAULT NULL')
    public claim_url_encrypted?: string | null;

    @Column('TEXT DEFAULT NULL')
    public activation_instructions?: string | null;

    @Column('TEXT DEFAULT NULL')
    public failure_reason?: string | null;

    @Column('TIMESTAMP WITH TIME ZONE DEFAULT NULL')
    public completed_at?: string | null;

    @Index({ unique: false })
    @Column('TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP')
    public created_at: string;

    @Index({ unique: false })
    @Column('TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP')
    public updated_at: string;
}
