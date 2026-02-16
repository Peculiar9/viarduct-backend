import { IUTXO } from '../Entities/IUTXO';
import { IRepository } from '../Persistence/Repository/IRepository';

export interface IUTXORepository extends IRepository<IUTXO> {
    findByAddress(address: string): Promise<IUTXO[]>;
    findByAddressAndStatus(address: string, status: IUTXO['status']): Promise<IUTXO[]>;
    findAvailableByAddress(address: string, minAmount?: number): Promise<IUTXO[]>;
    reserveUTXOs(utxoIds: string[], orderId: string): Promise<IUTXO[]>;
    markAsSpent(utxoIds: string[], spentTxid: string): Promise<void>;
    findByTxidAndVout(txid: string, vout: number): Promise<IUTXO | null>;
    findByOrderId(orderId: string): Promise<IUTXO[]>;
    findByStatus(status: IUTXO['status']): Promise<IUTXO[]>;
}

