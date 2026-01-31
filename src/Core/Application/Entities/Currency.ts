import { Column, Index } from '../../../extensions/decorators';
import { ICurrency } from '../Interface/Entities/wallet/ICurrency';

export class Currency implements ICurrency {
    @Column('UUID PRIMARY KEY DEFAULT gen_random_uuid()')
    public _id?: string;

    @Index({ unique: true })
    @Column('VARCHAR(3) NOT NULL UNIQUE')
    public code: string;

    @Column('VARCHAR(100) NOT NULL')
    public name: string;

    @Column('VARCHAR(10) NOT NULL')
    public symbol: string;

    @Column('VARCHAR(20) NOT NULL')
    public type: 'fiat' | 'crypto';

    @Column('INTEGER NOT NULL DEFAULT 2')
    public decimals: number;

    @Column('BOOLEAN DEFAULT true')
    public is_active: boolean;

    @Column('TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP')
    public created_at?: string;

    @Column('TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP')
    public updated_at?: string;
}

