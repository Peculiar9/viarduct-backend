import { inject, injectable } from 'inversify';
import { IUTXOManagerService } from '../../../Core/Application/Interface/Services/IUTXOManagerService';
import { IUTXO } from '../../../Core/Application/Interface/Entities/IUTXO';
import { IUTXORepository } from '../../../Core/Application/Interface/Repositories/IUTXORepository';
import { IBlockchainService } from '../../../Core/Application/Interface/Services/IBlockchainService';
import { IHttpClient } from '../../../Core/Application/Interface/Infrastructure/IHttpClient';
import { HttpClientFactory } from '../../Http/HttpClientFactory';
import { EnvironmentConfig } from '../../Config/EnvironmentConfig';
import { TYPES } from '../../../Core/Types/Constants';
import { ServiceError, AppError } from '../../../Core/Application/Error/AppError';
import { Console } from '../../Utils/Console';

@injectable()
export class UTXOManagerService implements IUTXOManagerService {
    private readonly httpClient: IHttpClient;
    private readonly baseUrl: string;
    private readonly apiKey: string;
    private readonly blockstreamClient: IHttpClient;
    private readonly network: string;

    constructor(
        @inject(TYPES.UTXORepository) private readonly utxoRepo: IUTXORepository,
        @inject(TYPES.BlockchainService) private readonly blockchainService: IBlockchainService,
        @inject(TYPES.HttpClientFactory) httpClientFactory: HttpClientFactory
    ) {
        this.network = EnvironmentConfig.get('BITCOIN_NETWORK', 'testnet');
        this.baseUrl = this.network === 'mainnet' 
            ? 'https://api.blockcypher.com/v1/btc/main'
            : 'https://api.blockcypher.com/v1/btc/test3';
        this.apiKey = EnvironmentConfig.get('BLOCKCYPHER_API_KEY', '');
        
        this.httpClient = httpClientFactory.createClient({
            baseURL: this.baseUrl,
            timeout: 30000,
            headers: this.apiKey ? { 'Authorization': `Bearer ${this.apiKey}` } : {}
        });

        // Create Blockstream client as fallback
        const blockstreamBaseUrl = this.network === 'mainnet'
            ? 'https://blockstream.info/api'
            : 'https://blockstream.info/testnet/api';
        
        this.blockstreamClient = httpClientFactory.createClient({
            baseURL: blockstreamBaseUrl,
            timeout: 30000,
            headers: {}
        });
    }

    /**
     * Sync UTXOs from blockchain for an address
     * Fetches all unspent outputs and stores/updates them in database
     */
    async syncUTXOsForAddress(address: string, walletAccountId?: string): Promise<number> {
        try {
            Console.info('Syncing UTXOs from blockchain', { address });

            // Try multiple methods to get UTXOs from BlockCypher
            let txrefs: any[] = [];
            
            try {
                // Method 1: Try unspentOnly endpoint
                const response = await this.httpClient.get<any>(`/addrs/${address}?unspentOnly=true`);
                Console.info('BlockCypher response (unspentOnly)', { 
                    hasTxrefs: !!response.txrefs, 
                    txrefsCount: response.txrefs?.length || 0,
                    responseKeys: Object.keys(response)
                });
                
                if (response.txrefs && response.txrefs.length > 0) {
                    txrefs = response.txrefs;
                } else {
                    // Method 2: Get full address data and filter for unspent outputs
                    Console.info('Trying full address endpoint as fallback', { address });
                    const fullResponse = await this.httpClient.get<any>(`/addrs/${address}/full`);
                    
                    Console.info('BlockCypher full response', {
                        hasTxs: !!fullResponse.txs,
                        txsCount: fullResponse.txs?.length || 0,
                        responseKeys: Object.keys(fullResponse)
                    });
                    
                    if (fullResponse.txs && Array.isArray(fullResponse.txs)) {
                        // Process transactions to find unspent outputs
                        for (const tx of fullResponse.txs) {
                            if (tx.outputs && Array.isArray(tx.outputs)) {
                                for (const output of tx.outputs) {
                                    // Check if this output is for our address and not spent
                                    if (output.addresses && output.addresses.includes(address)) {
                                        const isSpent = output.spent_by && output.spent_by.length > 0;
                                        
                                        if (!isSpent) {
                                            txrefs.push({
                                                tx_hash: tx.hash || tx.tx_hash,
                                                tx_output_n: output.n ?? output.index,
                                                value: output.value || 0,
                                                script: output.script || output.script_hex
                                            });
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            } catch (apiError: any) {
                Console.warn('BlockCypher failed, trying Blockstream as fallback', { 
                    address, 
                    error: apiError?.message || 'Unknown error' 
                });
                
                // Fallback to Blockstream
                try {
                    const blockstreamResponse = await this.blockstreamClient.get<any>(`/address/${address}/utxo`);
                    
                    if (Array.isArray(blockstreamResponse) && blockstreamResponse.length > 0) {
                        Console.info('Found UTXOs via Blockstream', { 
                            address, 
                            count: blockstreamResponse.length 
                        });
                        
                        // Convert Blockstream format to our format
                        txrefs = blockstreamResponse.map((utxo: any) => ({
                            tx_hash: utxo.txid,
                            tx_output_n: utxo.vout,
                            value: utxo.value, // Blockstream returns value in satoshis
                            script: utxo.scriptpubkey || ''
                        }));
                    } else {
                        Console.warn('No UTXOs found on Blockstream either', { address });
                    }
                } catch (blockstreamError: any) {
                    Console.error(blockstreamError, { 
                        message: 'Both BlockCypher and Blockstream failed', 
                        address 
                    });
                    throw new ServiceError(
                        `Failed to fetch UTXOs from both BlockCypher and Blockstream. ` +
                        `BlockCypher error: ${apiError?.message || 'Unknown'}. ` +
                        `Blockstream error: ${blockstreamError?.message || 'Unknown'}`
                    );
                }
            }

            // If BlockCypher returned successfully but empty, try Blockstream (common on testnet)
            if (txrefs.length === 0) {
                Console.info('BlockCypher returned no UTXOs, trying Blockstream as fallback', { address });
                try {
                    const blockstreamResponse = await this.blockstreamClient.get<any>(`/address/${address}/utxo`);
                    if (Array.isArray(blockstreamResponse) && blockstreamResponse.length > 0) {
                        txrefs = blockstreamResponse.map((utxo: any) => ({
                            tx_hash: utxo.txid,
                            tx_output_n: utxo.vout,
                            value: utxo.value,
                            script: utxo.scriptpubkey || ''
                        }));
                        Console.info('Found UTXOs via Blockstream (BlockCypher was empty)', {
                            address,
                            count: txrefs.length
                        });
                    }
                } catch (blockstreamError: any) {
                    Console.warn('Blockstream fallback also failed', { address, error: blockstreamError?.message });
                }
            }

            if (txrefs.length === 0) {
                Console.warn('No UTXOs found for address after trying all methods', { address });
                return 0;
            }

            Console.info(`Found ${txrefs.length} UTXOs from blockchain`, { address });

            let syncedCount = 0;

            // Process each UTXO
            for (const txref of txrefs) {
                try {
                    const txid = txref.tx_hash;
                    const vout = txref.tx_output_n;
                    const amountInSatoshis = Number(txref.value) || 0;
                    const amount = Number.isNaN(amountInSatoshis) ? 0 : amountInSatoshis / 100000000; // Convert to BTC

                    // Check if UTXO already exists
                    const existing = await this.utxoRepo.findByTxidAndVout(txid, vout);

                    if (existing) {
                        // Update if status changed (e.g., was marked as spent but blockchain says available)
                        if (existing.status === 'spent') {
                            Console.warn('UTXO marked as spent in DB but available on blockchain', {
                                txid,
                                vout,
                                address
                            });
                            // Don't update - blockchain might be wrong or transaction was replaced
                        }
                        continue;
                    }

                    // Create new UTXO
                    const utxo = await this.utxoRepo.create({
                        txid,
                        vout,
                        amount,
                        address,
                        script: txref.script || undefined, // Store script if available
                        status: 'available',
                        ownership: 'user',
                        wallet_account_id: walletAccountId || null,
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString()
                    });

                    syncedCount++;
                    Console.info('UTXO synced', {
                        txid,
                        vout,
                        amount,
                        address
                    });
                } catch (error: any) {
                    Console.error(error, {
                        message: 'Failed to sync individual UTXO',
                        txid: txref.tx_hash,
                        vout: txref.tx_output_n
                    });
                    // Continue with next UTXO
                }
            }

            Console.info('UTXO sync completed', {
                address,
                syncedCount,
                totalUTXOs: txrefs.length
            });

            return syncedCount;
        } catch (error: any) {
            Console.error(error, { message: 'Failed to sync UTXOs', address });
            throw new ServiceError(`Failed to sync UTXOs for address: ${error.message}`);
        }
    }

    /**
     * Select and reserve UTXOs for an order
     * Returns the reserved UTXOs
     */
    async reserveUTXOsForOrder(address: string, amount: number, orderId: string): Promise<IUTXO[]> {
        try {
            Console.info('Reserving UTXOs for order', { address, amount, orderId });

            // Get available UTXOs
            const availableUTXOs = await this.utxoRepo.findAvailableByAddress(address);

            if (availableUTXOs.length === 0) {
                throw new ServiceError(`No available UTXOs found for address: ${address}`);
            }

            // Select UTXOs to cover amount (we'll add fee later, but need enough for amount)
            let totalSelected = 0;
            const selectedUTXOs: IUTXO[] = [];

            for (const utxo of availableUTXOs) {
                selectedUTXOs.push(utxo);
                totalSelected += parseFloat(utxo.amount.toString());

                // We need at least the amount (fee will be added separately)
                if (totalSelected >= amount) {
                    break;
                }
            }

            if (totalSelected < amount) {
                throw new ServiceError(
                    `Insufficient UTXOs. Need ${amount} BTC, have ${totalSelected} BTC available`
                );
            }

            // Reserve the selected UTXOs atomically
            const utxoIds = selectedUTXOs.map(u => u._id!);
            const reserved = await this.utxoRepo.reserveUTXOs(utxoIds, orderId);

            Console.info('UTXOs reserved for order', {
                orderId,
                address,
                reservedCount: reserved.length,
                totalAmount: totalSelected
            });

            return reserved;
        } catch (error: any) {
            Console.error(error, { message: 'Failed to reserve UTXOs', address, amount, orderId });
            throw error;
        }
    }

    /**
     * Mark UTXOs as spent after transaction is broadcast
     */
    async markUTXOsAsSpent(utxoIds: string[], spentTxid: string): Promise<void> {
        try {
            Console.info('Marking UTXOs as spent', { utxoIds, spentTxid });

            await this.utxoRepo.markAsSpent(utxoIds, spentTxid);

            Console.info('UTXOs marked as spent', {
                utxoIds,
                spentTxid,
                count: utxoIds.length
            });
        } catch (error: any) {
            Console.error(error, { message: 'Failed to mark UTXOs as spent', utxoIds, spentTxid });
            throw error;
        }
    }

    /**
     * Store change output from a transaction
     * Extracts change output from transaction and stores as new UTXO
     */
    async storeChangeUTXO(txid: string, address: string, walletAccountId?: string, ownership: 'user' | 'platform' = 'user'): Promise<IUTXO | null> {
        try {
            Console.info('Storing change UTXO', { txid, address });

            // Try BlockCypher first
            let txResponse: any = null;
            let usedBlockstream = false;

            try {
                txResponse = await this.httpClient.get<any>(`/txs/${txid}`);
                if (txResponse && (txResponse.hash || txResponse.outputs)) {
                    Console.info('Transaction found via BlockCypher for change UTXO', { txid });
                }
            } catch (blockcypherError: any) {
                Console.warn('BlockCypher failed for change UTXO, trying Blockstream', {
                    txid,
                    error: blockcypherError?.message || 'Unknown error'
                });

                // Fallback to Blockstream
                try {
                    txResponse = await this.blockstreamClient.get<any>(`/tx/${txid}`);
                    usedBlockstream = true;
                    Console.info('Transaction found via Blockstream for change UTXO', { txid });
                } catch (blockstreamError: any) {
                    Console.error(blockstreamError, {
                        message: 'Both BlockCypher and Blockstream failed to fetch transaction for change UTXO',
                        txid,
                        address
                    });
                    throw new ServiceError(
                        `Failed to fetch transaction from both BlockCypher and Blockstream: ${txid}. ` +
                        `BlockCypher: ${blockcypherError?.message || 'Unknown'}. ` +
                        `Blockstream: ${blockstreamError?.message || 'Unknown'}`
                    );
                }
            }

            // BlockCypher uses 'hash', Blockstream uses 'txid'
            if (!txResponse || (!txResponse.hash && !txResponse.txid)) {
                Console.warn('Transaction not found or invalid response', { txid });
                return null;
            }

            // Parse outputs based on API provider
            let outputs: any[] = [];

            if (usedBlockstream) {
                // Blockstream format
                if (txResponse.vout && Array.isArray(txResponse.vout)) {
                    outputs = txResponse.vout.map((vout: any, index: number) => ({
                        n: index,
                        value: vout.value ? Math.round(vout.value * 100000000) : 0, // Convert BTC to satoshis
                        addresses: vout.scriptpubkey_address ? [vout.scriptpubkey_address] : [],
                        script: vout.scriptpubkey || '',
                        spent_by: vout.spent ? [{}] : []
                    }));
                }
            } else {
                // BlockCypher format
                outputs = txResponse.outputs || [];
            }

            if (outputs.length === 0) {
                Console.warn('Transaction has no outputs', { txid });
                return null;
            }

            // Find outputs that go back to the sender address (change)
            let changeUTXO: IUTXO | null = null;

            for (let i = 0; i < outputs.length; i++) {
                const output = outputs[i];
                const outputAddresses = output.addresses || [];

                // Check if this output goes to our address (change)
                if (outputAddresses.includes(address)) {
                    // Coerce to number to avoid string concatenation when storing (pg numeric)
                    const amountInSatoshis = Number(output.value || 0);
                    const amount = amountInSatoshis / 100000000; // Convert to BTC

                    // Check if this UTXO already exists
                    const existing = await this.utxoRepo.findByTxidAndVout(txid, i);
                    if (existing) {
                        Console.info('Change UTXO already exists', { txid, vout: i });
                        return existing;
                    }

                    // Get script from output
                    const script = output.script || output.script_hex || '';

                    // Create new UTXO for change (ensure amount is number)
                    changeUTXO = await this.utxoRepo.create({
                        txid,
                        vout: i,
                        amount: Number(amount),
                        address,
                        script: script || undefined,
                        status: 'available',
                        ownership,
                        wallet_account_id: walletAccountId || null,
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString()
                    });

                    Console.info('Change UTXO stored', {
                        txid,
                        vout: i,
                        amount,
                        address,
                        source: usedBlockstream ? 'Blockstream' : 'BlockCypher'
                    });

                    // Only store the first change output (typically there's only one)
                    break;
                }
            }

            if (!changeUTXO) {
                Console.warn('No change output found for address in transaction', {
                    txid,
                    address,
                    outputCount: outputs.length
                });
            }

            return changeUTXO;
        } catch (error: any) {
            Console.error(error, { message: 'Failed to store change UTXO', txid, address });
            throw new ServiceError(`Failed to store change UTXO: ${error.message}`);
        }
    }

    /**
     * Get available UTXOs for an address
     */
    async getAvailableUTXOs(address: string, minAmount?: number): Promise<IUTXO[]> {
        try {
            return await this.utxoRepo.findAvailableByAddress(address, minAmount);
        } catch (error: any) {
            Console.error(error, { message: 'Failed to get available UTXOs', address });
            throw error;
        }
    }

    /**
     * Reconcile UTXOs for an address
     * Compares database with blockchain and fixes mismatches
     */
    async reconcileAddress(address: string): Promise<{
        added: number;
        removed: number;
        updated: number;
    }> {
        try {
            Console.info('Reconciling UTXOs for address', { address });

            // Get UTXOs from blockchain
            const response = await this.httpClient.get<any>(`/addrs/${address}?unspentOnly=true`);
            const blockchainUTXOs = response.txrefs || [];

            // Get UTXOs from database
            const dbUTXOs = await this.utxoRepo.findByAddress(address);

            // Create a map of blockchain UTXOs by (txid, vout)
            const blockchainMap = new Map<string, any>();
            for (const utxo of blockchainUTXOs) {
                const key = `${utxo.tx_hash}_${utxo.tx_output_n}`;
                blockchainMap.set(key, utxo);
            }

            // Create a map of database UTXOs by (txid, vout)
            const dbMap = new Map<string, IUTXO>();
            for (const utxo of dbUTXOs) {
                const key = `${utxo.txid}_${utxo.vout}`;
                dbMap.set(key, utxo);
            }

            let added = 0;
            let removed = 0;
            let updated = 0;

            // Add UTXOs that exist on blockchain but not in database
            for (const [key, blockchainUTXO] of blockchainMap.entries()) {
                if (!dbMap.has(key)) {
                    const amount = (blockchainUTXO.value || 0) / 100000000;
                    await this.utxoRepo.create({
                        txid: blockchainUTXO.tx_hash,
                        vout: blockchainUTXO.tx_output_n,
                        amount,
                        address,
                        script: blockchainUTXO.script || undefined,
                        status: 'available',
                        ownership: 'user',
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString()
                    });
                    added++;
                }
            }

            // Mark UTXOs as spent that exist in database but not on blockchain
            // (only if they're marked as available or reserved)
            for (const [key, dbUTXO] of dbMap.entries()) {
                if (!blockchainMap.has(key)) {
                    if (dbUTXO.status === 'available' || dbUTXO.status === 'reserved') {
                        // This UTXO was spent but we didn't track it
                        // Mark as spent (we don't know the spending txid, so leave it null)
                        await this.utxoRepo.update(dbUTXO._id!, {
                            status: 'spent',
                            spent_at: new Date().toISOString(),
                            updated_at: new Date().toISOString()
                        });
                        removed++;
                    }
                }
            }

            Console.info('UTXO reconciliation completed', {
                address,
                added,
                removed,
                updated
            });

            return { added, removed, updated };
        } catch (error: any) {
            Console.error(error, { message: 'Failed to reconcile UTXOs', address });
            throw new ServiceError(`Failed to reconcile UTXOs: ${error.message}`);
        }
    }

    /**
     * Unlock reserved UTXOs (for order cancellation or failure)
     */
    async unlockUTXOs(utxoIds: string[]): Promise<void> {
        try {
            Console.info('Unlocking UTXOs', { utxoIds });

            for (const utxoId of utxoIds) {
                await this.utxoRepo.update(utxoId, {
                    status: 'available',
                    reserved_for_order_id: null,
                    updated_at: new Date().toISOString()
                });
            }

            Console.info('UTXOs unlocked', { utxoIds, count: utxoIds.length });
        } catch (error: any) {
            Console.error(error, { message: 'Failed to unlock UTXOs', utxoIds });
            throw new ServiceError(`Failed to unlock UTXOs: ${error.message}`);
        }
    }

    /**
     * Create UTXO from transaction hash
     * Fetches transaction from blockchain and creates UTXO for specific output
     * Tries BlockCypher first, falls back to Blockstream if BlockCypher fails
     */
    async createUTXOFromTransaction(txHash: string, vout?: number, address?: string, walletAccountId?: string): Promise<IUTXO> {
        try {
            Console.info('Creating UTXO from transaction', { txHash, vout, address });

            // Try BlockCypher first
            let txResponse: any = null;
            let usedBlockstream = false;

            try {
                txResponse = await this.httpClient.get<any>(`/txs/${txHash}`);
                if (txResponse && txResponse.hash) {
                    Console.info('Transaction found via BlockCypher', { txHash });
                }
            } catch (blockcypherError: any) {
                Console.warn('BlockCypher failed, trying Blockstream', { 
                    txHash, 
                    error: blockcypherError?.message || 'Unknown error' 
                });
                
                // Fallback to Blockstream
                try {
                    txResponse = await this.blockstreamClient.get<any>(`/tx/${txHash}`);
                    usedBlockstream = true;
                    Console.info('Transaction found via Blockstream', { txHash });
                } catch (blockstreamError: any) {
                    throw new ServiceError(
                        `Transaction not found on both BlockCypher and Blockstream: ${txHash}. ` +
                        `BlockCypher error: ${blockcypherError?.message || 'Unknown'}. ` +
                        `Blockstream error: ${blockstreamError?.message || 'Unknown'}`
                    );
                }
            }

            // BlockCypher uses 'hash', Blockstream uses 'txid'
            if (!txResponse || (!txResponse.hash && !txResponse.txid)) {
                throw new ServiceError(`Transaction not found: ${txHash}`);
            }

            // Parse outputs based on API provider
            let outputs: any[] = [];
            
            if (usedBlockstream) {
                // Blockstream format
                if (txResponse.vout && Array.isArray(txResponse.vout)) {
                    outputs = txResponse.vout.map((vout: any, index: number) => ({
                        n: index,
                        value: vout.value ? Math.round(vout.value * 100000000) : 0, // Convert BTC to satoshis
                        addresses: vout.scriptpubkey_address ? [vout.scriptpubkey_address] : [],
                        script: vout.scriptpubkey || '',
                        spent_by: vout.spent ? [{}] : [] // Blockstream uses 'spent' boolean
                    }));
                }
            } else {
                // BlockCypher format
                outputs = txResponse.outputs || [];
            }

            if (outputs.length === 0) {
                throw new ServiceError(`Transaction has no outputs: ${txHash}`);
            }

            // Find target output
            let targetOutput: any = null;
            let targetVout: number = -1;

            if (vout !== undefined && vout !== null) {
                // Use specific vout
                if (vout >= outputs.length) {
                    throw new ServiceError(`Invalid vout ${vout}. Transaction has ${outputs.length} outputs`);
                }
                targetOutput = outputs[vout];
                targetVout = vout;

                // If address is provided, validate it matches
                if (address) {
                    const outputAddresses = targetOutput.addresses || [];
                    if (!outputAddresses.includes(address)) {
                        throw new ServiceError(`Output ${vout} does not belong to address ${address}`);
                    }
                }
            } else if (address) {
                // Find first output that matches the address
                for (let i = 0; i < outputs.length; i++) {
                    const output = outputs[i];
                    const outputAddresses = output.addresses || [];
                    if (outputAddresses.includes(address)) {
                        // Check if this output is spent
                        const isSpent = output.spent_by && output.spent_by.length > 0;
                        if (!isSpent) {
                            targetOutput = output;
                            targetVout = i;
                            break;
                        }
                    }
                }

                if (!targetOutput) {
                    throw new ServiceError(`No unspent output found for address ${address} in transaction ${txHash}`);
                }
            } else {
                throw new ServiceError('Either vout or address must be provided');
            }

            // Check if output is spent
            const isSpent = targetOutput.spent_by && targetOutput.spent_by.length > 0;
            if (isSpent) {
                throw new ServiceError(`Output ${targetVout} in transaction ${txHash} is already spent`);
            }

            // Extract amount and script (coerce to number to avoid string concat when storing)
            const amountInSatoshis = Number(targetOutput.value || 0);
            const amount = amountInSatoshis / 100000000; // Convert to BTC
            
            // Safety check: if amount seems too large (likely stored as satoshis), convert it
            if (amount > 21000000) { // Max Bitcoin supply is 21M, so if amount > 21M, it's likely satoshis
                Console.warn('Amount seems too large, converting from satoshis', { 
                    originalAmount: amount, 
                    convertedAmount: amount / 100000000 
                });
                const correctedAmount = amount / 100000000;
                // Use corrected amount
                const script = targetOutput.script || targetOutput.script_hex || '';
                const outputAddress = targetOutput.addresses?.[0] || address;

                if (!outputAddress) {
                    throw new ServiceError(`Could not determine address for output ${targetVout}`);
                }

                // Check if UTXO already exists
                const existing = await this.utxoRepo.findByTxidAndVout(txHash, targetVout);
                if (existing) {
                    Console.info('UTXO already exists', { txHash, vout: targetVout });
                    return existing;
                }

                // Create new UTXO with corrected amount (ensure number)
                const utxo = await this.utxoRepo.create({
                    txid: txHash,
                    vout: targetVout,
                    amount: Number(correctedAmount),
                    address: outputAddress,
                    script: script || undefined,
                    status: 'available',
                    wallet_account_id: walletAccountId || null,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                });

                Console.info('UTXO created from transaction', {
                    txHash,
                    vout: targetVout,
                    amount: correctedAmount,
                    address: outputAddress,
                    source: usedBlockstream ? 'Blockstream' : 'BlockCypher'
                });

                return utxo;
            }
            
            const script = targetOutput.script || targetOutput.script_hex || '';
            const outputAddress = targetOutput.addresses?.[0] || address;

            if (!outputAddress) {
                throw new ServiceError(`Could not determine address for output ${targetVout}`);
            }

            // Check if UTXO already exists
            const existing = await this.utxoRepo.findByTxidAndVout(txHash, targetVout);
            if (existing) {
                Console.info('UTXO already exists', { txHash, vout: targetVout });
                return existing;
            }

            // Create new UTXO (ensure amount is number)
            const utxo = await this.utxoRepo.create({
                txid: txHash,
                vout: targetVout,
                amount: Number(amount),
                address: outputAddress,
                script: script || undefined,
                status: 'available',
                wallet_account_id: walletAccountId || null,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            });

            Console.info('UTXO created from transaction', {
                txHash,
                vout: targetVout,
                amount,
                address: outputAddress,
                source: usedBlockstream ? 'Blockstream' : 'BlockCypher'
            });

            return utxo;
        } catch (error: any) {
            Console.error(error, { 
                message: 'Failed to create UTXO from transaction', 
                txHash, 
                vout, 
                address,
                errorType: error?.constructor?.name,
                errorMessage: error?.message
            });
            
            // Extract error message properly
            let errorMessage = 'Unknown error';
            if (error instanceof ServiceError || error instanceof AppError) {
                errorMessage = error.message;
            } else if (error?.message) {
                errorMessage = error.message;
            } else if (typeof error === 'string') {
                errorMessage = error;
            }
            
            throw new ServiceError(`Failed to create UTXO from transaction: ${errorMessage}`);
        }
    }
}

