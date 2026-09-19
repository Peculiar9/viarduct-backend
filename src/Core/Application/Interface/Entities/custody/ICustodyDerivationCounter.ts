export type CustodyDerivationCryptoType = 'BTC' | 'ETH';

export interface ICustodyDerivationCounter {
    _id?: string;
    crypto_type: CustodyDerivationCryptoType;
    /** Next HD child index to allocate (0-based). After allocate, this increments by 1. */
    next_index: number;
    created_at: string;
    updated_at: string;
}
