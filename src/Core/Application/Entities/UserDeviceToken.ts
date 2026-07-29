import { Column, CompositeIndex, ForeignKey, Index } from '../../../extensions/decorators';
import { TableNames } from '../Enums/TableNames';
import {
    DeviceTokenPlatform,
    IUserDeviceToken
} from '../Interface/Entities/notifications/IUserDeviceToken';

@CompositeIndex(['user_id', 'is_active'])
@CompositeIndex(['user_id', 'device_id'])
export class UserDeviceToken implements IUserDeviceToken {
    @Column('UUID PRIMARY KEY DEFAULT gen_random_uuid()')
    public _id?: string;

    @Index({ unique: false })
    @ForeignKey({
        table: TableNames.USERS,
        field: '_id',
        constraint: 'fk_user_device_token_user_id'
    })
    @Column('UUID NOT NULL')
    public user_id: string;

    @Index({ unique: true })
    @Column('TEXT NOT NULL')
    public token: string;

    @Column('VARCHAR(20) NOT NULL')
    public platform: DeviceTokenPlatform;

    @Column('VARCHAR(255) DEFAULT NULL')
    public device_id?: string | null;

    @Column('BOOLEAN DEFAULT TRUE')
    public is_active: boolean;

    @Column('TIMESTAMP WITH TIME ZONE DEFAULT NULL')
    public last_seen_at?: string | null;

    @Index({ unique: false })
    @Column('TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP')
    public created_at: string;

    @Index({ unique: false })
    @Column('TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP')
    public updated_at: string;
}
