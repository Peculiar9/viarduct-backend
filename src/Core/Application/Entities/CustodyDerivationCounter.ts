import { Column, Index } from '../../../extensions/decorators';
import { ICustodyDerivationCounter } from '../Interface/Entities/custody/ICustodyDerivationCounter';

export class CustodyDerivationCounter implements ICustodyDerivationCounter {
    @Column('UUID PRIMARY KEY DEFAULT gen_random_uuid()')
    public _id?: string;

    @Index({ unique: true })
    @Column('VARCHAR(10) NOT NULL')
    public crypto_type: ICustodyDerivationCounter['crypto_type'];

    @Column('INTEGER NOT NULL DEFAULT 0')
    public next_index: number;

    @Index({ unique: false })
    @Column('TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP')
    public created_at: string;

    @Index({ unique: false })
    @Column('TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP')
    public updated_at: string;
}
