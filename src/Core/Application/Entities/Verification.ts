import { IVerification, VerificationType } from "../Interface/Entities/auth-and-user/IVerification";
import { VerificationStatus } from "../Interface/Entities/auth-and-user/IUser";
import { Column, Index, ForeignKey } from "../../../extensions/decorators";

export class Verification implements IVerification {
    @Column('UUID PRIMARY KEY DEFAULT gen_random_uuid()')
    _id?: string;

    @Index({ unique: false })
    @ForeignKey({ table: "users", field: "_id" })
    @Column('UUID')
    user_id: string | undefined;

    @Index({ unique: false })
    @Column('VARCHAR(50)')
    type?: VerificationType | string;

    @Index({ unique: false })
    @Column('VARCHAR(255)')
    identifier?: string;

    @Index({ unique: false })
    @Column('VARCHAR(255) NOT NULL')
    reference: string;

    @Column('JSONB')
    otp?: {
        code: string;
        attempts: number;
        expiry: number;
        last_attempt?: number | null;
        verified: boolean;
    };

    @Index({ unique: false })
    @Column('VARCHAR(50) DEFAULT \'pending\'')
    status?: VerificationStatus | string;

    @Column('BIGINT')
    expiry?: number;

    @Index({ unique: false })
    @Column('TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP')
    created_at?: string;

    @Index({ unique: false })
    @Column('TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP')
    updated_at?: string;

    constructor(data?: Partial<Verification>) {
        if (data) Object.assign(this, data);
    }
}