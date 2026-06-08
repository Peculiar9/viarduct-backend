// src/Core/Application/Entities/TradingRate.ts
import { Column, Index } from '../../../extensions/decorators';
import { ITradingRate } from '../Interface/Entities/trading/ITradingRate';
import { TableNames } from '../Enums/TableNames';


export class TradingRate implements ITradingRate {
    @Column('UUID PRIMARY KEY DEFAULT gen_random_uuid()')
    public _id?: string;

    @Index({ unique: false })
    @Column('VARCHAR(10) NOT NULL')
    public crypto_type: string;  // 'BTC', 'ETH', etc. - currency code

    @Index({ unique: false })
    @Column('VARCHAR(10) NOT NULL')
    public type: string;  // crypto or giftcard

    @Column('DECIMAL(20, 2) NOT NULL')
    public buy_rate: number;  // NGN per crypto (platform buys at this rate)

    @Column('DECIMAL(20, 2) NOT NULL')
    public sell_rate: number;  // NGN per crypto (platform sells at this rate)

    // New: margin-based config (0-100)
    @Column('DECIMAL(5, 2) DEFAULT 0')
    public buy_margin_percentage?: number;

    @Column('DECIMAL(5, 2) DEFAULT 0')
    public sell_margin_percentage?: number;

    // New: spot price cache + manual emergency fallback
    @Column('DECIMAL(20, 2) DEFAULT NULL')
    public last_spot_price?: number | null;

    @Column('DECIMAL(20, 2) DEFAULT NULL')
    public emergency_spot_price?: number | null;

    @Column('DECIMAL(5, 2) DEFAULT 0')
    public spread_percentage: number;  // Margin between buy/sell

    @Index({ unique: false })
    @Column('BOOLEAN DEFAULT true')
    public is_active: boolean;

    @Index({ unique: false })
    @Column('UUID')
    public updated_by: string;  // Admin user ID

    @Column('TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP')
    public created_at?: string;

    @Column('TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP')
    public updated_at?: string;
}