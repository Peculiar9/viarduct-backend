import { Column, ForeignKey, Index } from '../../../extensions/decorators';
import { TableNames } from '../Enums/TableNames';
import { ISplitConfig } from '../Interface/Entities/trading/ISplitConfig';

export class SplitConfig implements ISplitConfig {
    @Column('UUID PRIMARY KEY DEFAULT gen_random_uuid()')
    public _id?: string;

    @Index({ unique: true })
    @Column('VARCHAR(64) NOT NULL')
    public title: string;

    @Column('DECIMAL(8, 4) NOT NULL')
    public value: number;

    @ForeignKey({
        table: TableNames.USERS,
        field: '_id',
        constraint: 'fk_split_config_updated_by'
    })
    @Column('UUID DEFAULT NULL')
    public updated_by?: string | null;

    @Index({ unique: false })
    @Column('TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP')
    public created_at?: string;

    @Index({ unique: false })
    @Column('TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP')
    public updated_at?: string;
}
