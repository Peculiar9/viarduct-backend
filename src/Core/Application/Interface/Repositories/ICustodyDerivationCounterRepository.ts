import { CustodyAsset } from '../Services/ICustodyProvider';

export interface ICustodyDerivationCounterRepository {
    /**
     * Atomically allocate the next sequential HD derivation index for an asset.
     * Returns the allocated index (0-based) to use in `m/0/{index}`.
     */
    allocateNextIndex(cryptoType: CustodyAsset): Promise<number>;

    /** Peek at the next index that would be allocated (does not increment). */
    peekNextIndex(cryptoType: CustodyAsset): Promise<number>;
}
