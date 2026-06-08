import { IUTXO } from '../Entities/IUTXO';
import { IRepository } from '../Persistence/Repository/IRepository';

export interface IUTXORepository extends IRepository<IUTXO> {
    findByAddress(address: string): Promise<IUTXO[]>;
    findByAddressAndStatus(address: string, status: IUTXO['status']): Promise<IUTXO[]>;
    findAvailableByAddress(address: string, minAmount?: number): Promise<IUTXO[]>;
    findAvailablePlatformOwnedByAddress(address: string): Promise<IUTXO[]>;
    reserveUTXOs(utxoIds: string[], orderId: string): Promise<IUTXO[]>;
    markAsSpent(utxoIds: string[], spentTxid: string): Promise<void>;
    findByTxidAndVout(txid: string, vout: number): Promise<IUTXO | null>;
    findByOrderId(orderId: string): Promise<IUTXO[]>;
    findByStatus(status: IUTXO['status']): Promise<IUTXO[]>;

    /**
     * Promote UTXOs from user->platform ownership for a given address within an active DB transaction.
     * This is used when a user sells BTC internally to the platform.
     */
    promoteUserUtxosToPlatformInTxn(address: string, amountToPromote: number): Promise<{ utxos: IUTXO[]; totalPromoted: number }>;
}

