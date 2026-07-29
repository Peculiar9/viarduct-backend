import { TradeQuoteLineItems } from '../../DTOs/TradeIntentDTO';
import { ITradeIntent } from '../Entities/trading/ITradeIntent';

export interface ITradeQuoteService {
    buildSellQuote(cryptoType: string, cryptoAmount: number): Promise<TradeQuoteLineItems>;
    buildBuyQuote(
        cryptoType: string,
        fiatAmount: number,
        externalDestinationAddress: string
    ): Promise<TradeQuoteLineItems>;
}

export interface ITradeIntentService {
    getQuote(dto: {
        type: 'buy' | 'sell';
        crypto_type: string;
        crypto_amount?: number;
        fiat_amount?: number;
        external_destination_address?: string;
    }): Promise<TradeQuoteLineItems>;

    createSellIntent(
        userId: string,
        dto: {
            crypto_type: string;
            crypto_amount: number;
            bank_account_id?: string;
            prefered_bank_detail?: {
                recipient_bank_code: string;
                recipient_bank_name: string;
                recipient_account_number: string;
            };
            transaction_pin: string;
        }
    ): Promise<ITradeIntent>;

    createBuyIntent(
        userId: string,
        dto: {
            crypto_type: string;
            fiat_amount: number;
            external_destination_address: string;
            bank_account_id?: string;
            fiat_payment_reference?: string;
            transaction_pin: string;
        }
    ): Promise<ITradeIntent>;

    getUserIntents(
        userId: string,
        filters?: {
            status?: string;
            type?: string;
            crypto_type?: string;
            date_from?: string;
            date_to?: string;
            limit?: number;
            offset?: number;
        }
    ): Promise<{ items: ITradeIntent[]; total: number; limit: number; offset: number }>;
    getIntentById(id: string, userId?: string): Promise<ITradeIntent | null>;
    cancelIntent(userId: string, intentId: string): Promise<ITradeIntent>;
    submitProofOfPayment(
        userId: string,
        intentId: string,
        proofs: Array<{ title: string; description?: string; url: string }>
    ): Promise<ITradeIntent>;

    adminListIntents(filters: {
        status?: string;
        type?: string;
        crypto_type?: string;
        user_id?: string;
        date_from?: string;
        date_to?: string;
        limit?: number;
        offset?: number;
    }): Promise<{ items: ITradeIntent[]; total: number; limit: number; offset: number }>;

    adminConfirmIntent(
        adminId: string,
        dto: {
            intent_id: string;
            intent_type: 'buy' | 'sell';
            buy_metadata?: {
                confirmation_note: string;
                total_amount_confirmed: number;
            };
            sell_metadata?: {
                confirmation_note: string;
                total_crypto_amount_confirmed: number;
                tx_reference: string;
            };
        }
    ): Promise<ITradeIntent>;

    adminPayoutIntent(
        adminId: string,
        dto: {
            intent_id: string;
            intent_type: 'buy' | 'sell';
            consent_code: string;
            date_of_payment: string;
            buy_metadata?: {
                outgoing_tx_hash: string;
            };
            sell_metadata?: {
                proof_of_payment: Array<{ title: string; description?: string; url: string }>;
            };
        }
    ): Promise<{
        intent: ITradeIntent;
        payout: {
            payout_status: 'processing' | 'completed';
            receiver_address?: string;
            crypto_amount?: number;
            outgoing_tx_hash?: string;
            fiat_payout_amount?: number;
            date_of_payment: string;
        };
    }>;

    getPayoutStatus(
        intentId: string,
        userId?: string
    ): Promise<{
        intent_id: string;
        type: 'buy' | 'sell';
        status: string;
        payout_status: 'not_started' | 'processing' | 'completed' | 'failed';
        receiver_address?: string | null;
        outgoing_tx_hash?: string | null;
        crypto_amount?: number | null;
        fiat_payout_amount?: number | null;
        date_of_payment?: string | null;
        payout_at?: string | null;
    }>;

    adminVerifyFiat(adminId: string, intentId: string, adminNotes?: string): Promise<ITradeIntent>;
    adminConfirmFiatPayout(
        adminId: string,
        intentId: string,
        adminNotes?: string,
        actualGasNgn?: number
    ): Promise<ITradeIntent>;
    adminReleaseCrypto(adminId: string, intentId: string, adminNotes?: string): Promise<ITradeIntent>;

    handleIncomingCryptoDeposit(params: {
        address: string;
        txHash: string;
        amountCrypto: number;
        asset: 'BTC' | 'ETH';
    }): Promise<ITradeIntent | null>;

    verifyBankAccount(
        accountNumber: string,
        bankCode: string
    ): Promise<{
        account_number: string;
        account_name: string;
        bank_code: string;
        bank_name: string;
    }>;

    listBanks(name?: string): Promise<Array<{ id: number; name: string; code: string; longcode: string }>>;
}
