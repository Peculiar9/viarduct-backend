import { JsonRpcProvider } from 'ethers';

export interface IEthereumBlockchainService {
    getProvider(): JsonRpcProvider;

    getAddressBalance(address: string): Promise<number>;

    /**
     * Normalized incoming native ETH transfers for an address (Etherscan-style API).
     */
    checkAddressForIncomingTransactions(address: string): Promise<
        Array<{
            hash: string;
            valueEth: number;
            confirmations: number;
            block_time?: string;
            raw?: Record<string, unknown>;
        }>
    >;

    verifyTransaction(txHash: string): Promise<{
        confirmed: boolean;
        confirmations: number;
        amount: number;
        to: string;
    } | null>;
}
