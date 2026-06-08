import { injectable } from 'inversify';
import axios from 'axios';
import { FetchRequest, JsonRpcProvider, formatEther, getAddress } from 'ethers';
import { IEthereumBlockchainService } from '../../../Core/Application/Interface/Services/IEthereumBlockchainService';
import { EnvironmentConfig } from '../../Config/EnvironmentConfig';
import { Console } from '../../Utils/Console';
import { ServiceError } from '../../../Core/Application/Error/AppError';

@injectable()
export class EthereumBlockchainService implements IEthereumBlockchainService {
    private readonly provider: JsonRpcProvider;
    private readonly scannerApiBase: string;
    private readonly etherscanApiKey: string;
    private readonly networkLabel: string;
    private readonly chainId: number;
    private readonly rpcUrlUsed: string;

    constructor() {
        const rpc = EnvironmentConfig.get('ETHEREUM_RPC_URL', '').trim();
        this.networkLabel = EnvironmentConfig.get('ETHEREUM_NETWORK', 'sepolia').toLowerCase();
        this.chainId = this.resolveChainId(this.networkLabel);
        const fallback =
            this.networkLabel === 'mainnet'
                ? 'https://ethereum.publicnode.com'
                : 'https://rpc.sepolia.org';
        if (!rpc) {
            Console.warn('ETHEREUM_RPC_URL is not set; using public fallback RPC', { network: this.networkLabel });
        }
        this.rpcUrlUsed = rpc || fallback;
        const transport = this.buildJsonRpcTransport(this.rpcUrlUsed);
        // Pin chain id + static network to avoid flaky auto-detect and wrong-network RPC errors.
        this.provider = new JsonRpcProvider(transport, this.chainId, { staticNetwork: true });
        this.scannerApiBase = this.resolveScannerBase(this.networkLabel);
        this.etherscanApiKey = EnvironmentConfig.get('ETHERSCAN_API_KEY', '');

        let rpcHost = 'unknown';
        try {
            rpcHost = new URL(this.rpcUrlUsed).host;
        } catch {
            /* ignore */
        }
        const infuraSecretConfigured = Boolean(EnvironmentConfig.get('ETHEREUM_INFURA_API_SECRET', '').trim());
        Console.info('EthereumBlockchainService ready', {
            network: this.networkLabel,
            chainId: this.chainId,
            rpcHost,
            infuraBasicAuth: infuraSecretConfigured && this.rpcUrlUsed.toLowerCase().includes('infura.io')
        });
    }

    /**
     * Infura projects with "Require API Key Secret" return HTTP 400 unless Basic auth is sent:
     * username = API key (same id as in the /v3/... URL path), password = secret (see MetaMask / Infura docs).
     */
    private buildJsonRpcTransport(rpcUrl: string): string | FetchRequest {
        const secret = EnvironmentConfig.get('ETHEREUM_INFURA_API_SECRET', '').trim();
        if (!secret || !rpcUrl.toLowerCase().includes('infura.io')) {
            return rpcUrl;
        }
        const m = rpcUrl.match(/\/v3\/([^/?#]+)/i);
        const apiKey = m?.[1];
        if (!apiKey) {
            Console.warn(
                'ETHEREUM_INFURA_API_SECRET is set but ETHEREUM_RPC_URL has no /v3/<apiKey> segment; RPC calls may fail with 400'
            );
            return rpcUrl;
        }
        const req = new FetchRequest(rpcUrl);
        req.setCredentials(apiKey, secret);
        return req;
    }

    private resolveChainId(networkLabel: string): number {
        const fromEnv = EnvironmentConfig.getNumber('ETHEREUM_CHAIN_ID', 0);
        if (fromEnv > 0) {
            return fromEnv;
        }
        switch (networkLabel) {
            case 'mainnet':
                return 1;
            case 'holesky':
                return 17000;
            case 'sepolia':
            default:
                return 11155111;
        }
    }

    private resolveScannerBase(network: string): string {
        switch (network) {
            case 'mainnet':
                return 'https://api.etherscan.io/api';
            case 'holesky':
                return 'https://api-holesky.etherscan.io/api';
            case 'sepolia':
            default:
                return 'https://api-sepolia.etherscan.io/api';
        }
    }

    getProvider(): JsonRpcProvider {
        return this.provider;
    }

    async getAddressBalance(address: string): Promise<number> {
        try {
            const checksum = getAddress(address);
            const bal = await this.provider.getBalance(checksum);
            return Number.parseFloat(formatEther(bal));
        } catch (error: any) {
            const rpcMsg =
                error?.info?.error?.message ||
                error?.shortMessage ||
                error?.message ||
                String(error);
            const safeMsg = String(rpcMsg).slice(0, 280);
            Console.error(error, {
                message: 'Failed to read ETH balance',
                address,
                chainId: this.chainId,
                network: this.networkLabel,
                detail: safeMsg
            });
            throw new ServiceError(
                `Failed to read Ethereum balance: ${safeMsg}. ` +
                    `Confirm ETHEREUM_RPC_URL matches ETHEREUM_NETWORK (chainId ${this.chainId}), ` +
                    `or set ETHEREUM_CHAIN_ID explicitly. ` +
                    `If Infura returns 400 Bad Request, enable ETHEREUM_INFURA_API_SECRET when your project requires an API key secret.`
            );
        }
    }

    async checkAddressForIncomingTransactions(address: string): Promise<
        Array<{
            hash: string;
            valueEth: number;
            confirmations: number;
            block_time?: string;
            raw?: Record<string, unknown>;
        }>
    > {
        const checksum = getAddress(address);
        const params: Record<string, string> = {
            module: 'account',
            action: 'txlist',
            address: checksum,
            startblock: '0',
            endblock: '99999999',
            sort: 'desc',
            page: '1',
            offset: '50'
        };
        if (this.etherscanApiKey) {
            params.apikey = this.etherscanApiKey;
        }

        try {
            const res = await axios.get(this.scannerApiBase, { params, timeout: 25_000 });
            const list = res.data?.result;
            if (!Array.isArray(list)) {
                if (typeof list === 'string') {
                    Console.warn('Etherscan API message', { message: list, network: this.networkLabel });
                }
                return [];
            }

            const head = await this.provider.getBlockNumber();
            const incoming: Array<{
                hash: string;
                valueEth: number;
                confirmations: number;
                block_time?: string;
                raw?: Record<string, unknown>;
            }> = [];

            for (const row of list) {
                const to = (row.to as string)?.toLowerCase();
                const from = (row.from as string)?.toLowerCase();
                const valueWei = BigInt(row.value || '0');
                if (!to || to !== checksum.toLowerCase()) continue;
                if (valueWei <= 0n) continue;
                if (from === to) continue;

                const conf = row.blockNumber
                    ? Math.max(0, head - Number(row.blockNumber) + 1)
                    : 0;
                const valueEth = Number.parseFloat(formatEther(valueWei));

                incoming.push({
                    hash: row.hash as string,
                    valueEth,
                    confirmations: conf,
                    block_time: row.timeStamp ? new Date(Number(row.timeStamp) * 1000).toISOString() : undefined,
                    raw: row as Record<string, unknown>
                });
            }

            return incoming;
        } catch (error: any) {
            Console.error(error, { message: 'Failed to fetch Ethereum tx list', address });
            throw new ServiceError('Failed to fetch Ethereum transactions');
        }
    }

    async verifyTransaction(txHash: string): Promise<{
        confirmed: boolean;
        confirmations: number;
        amount: number;
        to: string;
    } | null> {
        try {
            const receipt = await this.provider.getTransactionReceipt(txHash);
            if (!receipt) {
                return null;
            }
            const tx = await this.provider.getTransaction(txHash);
            if (!tx) {
                return null;
            }
            const head = await this.provider.getBlockNumber();
            const confirmations = Math.max(0, head - receipt.blockNumber + 1);
            const ok = receipt.status === 1 && confirmations >= 1;
            return {
                confirmed: ok,
                confirmations,
                amount: Number.parseFloat(formatEther(tx.value)),
                to: tx.to ?? ''
            };
        } catch (error: any) {
            Console.warn('verifyTransaction ETH failed', { txHash, error: error?.message });
            return null;
        }
    }
}
