import { IUTXO } from '../Interface/Entities/IUTXO';
import { Column } from '../../../extensions/decorators';

export class UTXO implements IUTXO {
    @Column('UUID PRIMARY KEY DEFAULT gen_random_uuid()')
    _id?: string;

    @Column('VARCHAR(64) NOT NULL')
    txid!: string;

    @Column('INTEGER NOT NULL')
    vout!: number;

    @Column('DECIMAL(20, 8) NOT NULL')
    amount!: number;

    @Column('VARCHAR(255) NOT NULL')
    address!: string;

    @Column('TEXT DEFAULT NULL')
    script?: string;

    @Column('VARCHAR(20) NOT NULL DEFAULT \'available\'')
    status!: 'available' | 'reserved' | 'spent';

    @Column('UUID DEFAULT NULL')
    reserved_for_order_id?: string | null;

    @Column('UUID DEFAULT NULL')
    wallet_account_id?: string | null;

    @Column('TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP')
    created_at?: string;

    @Column('TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP')
    updated_at?: string;

    @Column('TIMESTAMP WITH TIME ZONE DEFAULT NULL')
    spent_at?: string | null;

    @Column('VARCHAR(64) DEFAULT NULL')
    spent_txid?: string | null;
}

