import { ITradeIntentProofOfPayment } from './ITradeIntentProofOfPayment';

export type TradeIntentType = 'buy' | 'sell';

export type TradeIntentStatus =
    | 'pending'
    | 'crypto_detected'
    | 'fiat_verified'
    | 'processing'
    | 'settled'
    | 'failed'
    | 'cancelled';

export type TradeIntentSettlementMode = 'controlled_p2p';

export type CustodyProviderName = 'inhouse' | 'liminal' | 'manual';

export interface ITradeIntent {
    _id?: string;
    user_id: string;
    type: TradeIntentType;
    status: TradeIntentStatus;
    crypto_type: string;
    settlement_mode: TradeIntentSettlementMode;

    spot_price_ngn: number;
    buy_rate: number;
    sell_rate: number;
    rate_used: number;

    quoted_crypto_amount: number;
    quoted_fiat_amount: number;
    quoted_gas_crypto: number;
    quoted_gas_ngn: number;
    net_crypto_amount: number;
    net_fiat_payout?: number | null;

    quote_expires_at: string;

    recipient_bank_code?: string | null;
    recipient_bank_name?: string | null;
    recipient_account_number?: string | null;
    recipient_account_name?: string | null;

    deposit_address?: string | null;
    deposit_derivation_path?: string | null;
    custody_provider: CustodyProviderName;
    incoming_tx_hash?: string | null;
    incoming_crypto_amount?: number | null;
    crypto_detected_at?: string | null;

    external_destination_address?: string | null;
    fiat_amount_expected?: number | null;
    fiat_payment_reference?: string | null;
    corporate_bank_account_id?: string | null;
    fiat_destination_bank_code?: string | null;
    fiat_destination_bank_name?: string | null;
    fiat_destination_account_number?: string | null;
    fiat_destination_account_name?: string | null;
    fiat_verified_at?: string | null;
    fiat_verified_by?: string | null;

    outgoing_tx_hash?: string | null;
    actual_gas_crypto?: number | null;
    actual_gas_ngn?: number | null;
    settled_at?: string | null;
    settled_by?: string | null;
    admin_notes?: string | null;
    confirmation_note?: string | null;
    total_amount_confirmed?: number | null;
    total_crypto_amount_confirmed?: number | null;
    confirmation_tx_reference?: string | null;
    admin_confirmed_at?: string | null;
    admin_confirmed_by?: string | null;
    swept_at?: string | null;
    failure_reason?: string | null;
    proof_of_payment?: ITradeIntentProofOfPayment[] | null;
    admin_payout_proof?: ITradeIntentProofOfPayment[] | null;
    payout_consent_id?: string | null;
    payout_date?: string | null;
    payout_at?: string | null;
    payout_by?: string | null;
    metadata?: Record<string, unknown> | null;

    created_at: string;
    updated_at: string;
}
