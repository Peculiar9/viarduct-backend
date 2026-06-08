import { IUTXO } from '../Entities/IUTXO';

export interface IUTXOManagerService {
    /**
     * Sync UTXOs from blockchain for an address
     * Fetches all unspent outputs and stores/updates them in database
     */
    syncUTXOsForAddress(address: string, walletAccountId?: string): Promise<number>;

    /**
     * Select and reserve UTXOs for an order
     * Returns the reserved UTXOs
     */
    reserveUTXOsForOrder(address: string, amount: number, orderId: string): Promise<IUTXO[]>;

    /**
     * Mark UTXOs as spent after transaction is broadcast
     */
    markUTXOsAsSpent(utxoIds: string[], spentTxid: string): Promise<void>;

    /**
     * Store change output from a transaction
     * Extracts change output from transaction and stores as new UTXO
     */
    storeChangeUTXO(
        txid: string,
        address: string,
        walletAccountId?: string,
        ownership?: 'user' | 'platform'
    ): Promise<IUTXO | null>;

    /**
     * Get available UTXOs for an address
     */
    getAvailableUTXOs(address: string, minAmount?: number): Promise<IUTXO[]>;

    /**
     * Reconcile UTXOs for an address
     * Compares database with blockchain and fixes mismatches
     */
    reconcileAddress(address: string): Promise<{
        added: number;
        removed: number;
        updated: number;
    }>;

    /**
     * Unlock reserved UTXOs (for order cancellation or failure)
     */
    unlockUTXOs(utxoIds: string[]): Promise<void>;

    /**
     * Create UTXO from transaction hash
     * Fetches transaction from blockchain and creates UTXO for specific output
     */
    createUTXOFromTransaction(txHash: string, vout?: number, address?: string, walletAccountId?: string): Promise<IUTXO>;
}

