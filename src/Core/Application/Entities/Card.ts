import { Column, Index } from '../../../extensions/decorators';
import { TableNames } from '../Enums/TableNames';
import { ICard } from '../Interface/Entities/giftcard/ICard';

export class Card implements ICard {
    @Column('UUID PRIMARY KEY DEFAULT gen_random_uuid()')
    public _id?: string;

    @Index({ unique: false })
    @Column('VARCHAR(255) NOT NULL')
    public name: string;

    @Column('TEXT DEFAULT NULL')
    public description?: string | null;

    @Column('TEXT DEFAULT NULL')
    public url?: string | null;

    @Index({ unique: false })
    @Column('TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP')
    public created_at?: string;

    @Index({ unique: false })
    @Column('TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP')
    public updated_at?: string;
}
