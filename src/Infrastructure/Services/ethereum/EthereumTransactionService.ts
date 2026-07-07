import { inject, injectable } from 'inversify';
import { formatEther, getAddress, parseEther, Wallet } from 'ethers';
import { TYPES } from '../../../Core/Types/Constants';
import { IEthereumTransactionService } from '../../../Core/Application/Interface/Services/IEthereumTransactionService';
import { IEthereumBlockchainService } from '../../../Core/Application/Interface/Services/IEthereumBlockchainService';
import { IEthereumWalletService } from '../../../Core/Application/Interface/Services/IEthereumWalletService';
import { ServiceError } from '../../../Core/Application/Error/AppError';
import { Console } from '../../Utils/Console';

@injectable()
export class EthereumTransactionService implements IEthereumTransactionService {
    constructor(
        @inject(TYPES.EthereumBlockchainService)
        private readonly ethereumBlockchainService: IEthereumBlockchainService,
        @inject(TYPES.EthereumWalletService) private readonly ethereumWalletService: IEthereumWalletService
    ) {}

    async estimateNativeTransferFee(
        fromAddress: string,
        toAddress: string,
        amountEth: number
    ): Promise<number> {
        const provider = this.ethereumBlockchainService.getProvider();
        const from = getAddress(fromAddress);
        const to = getAddress(toAddress);
        const value = parseEther(String(amountEth));

        const [gasLimit, feeData] = await Promise.all([
            provider.estimateGas({ from, to, value }),
            provider.getFeeData()
        ]);

        const gasPrice = feeData.maxFeePerGas ?? feeData.gasPrice;
        if (!gasPrice) {
            throw new ServiceError('Could not determine ETH gas price');
        }

        const feeWei = gasLimit * gasPrice;
        return Number.parseFloat(formatEther(feeWei));
    }

    async sendNativeSweep(
        walletAccountId: string,
        fromAddress: string,
        toVaultAddress: string,
        amountEth: number
    ): Promise<{ txHash: string; feeEth: number }> {
        if (amountEth <= 0) {
            throw new ServiceError('Sweep amount must be greater than 0');
        }

        const provider = this.ethereumBlockchainService.getProvider();
        const derived = await this.ethereumWalletService.getDerivedWalletForAccount(walletAccountId);
        const signer = new Wallet(derived.privateKey, provider);

        const from = getAddress(fromAddress);
        const to = getAddress(toVaultAddress);
        if (signer.address.toLowerCase() !== from.toLowerCase()) {
            throw new ServiceError(
                `Derived signer ${signer.address} does not match from address ${from}`
            );
        }

        const value = parseEther(String(amountEth));
        const tx = await signer.sendTransaction({ to, value });
        const receipt = await tx.wait();
        if (!receipt || receipt.status !== 1) {
            throw new ServiceError(`ETH sweep transaction failed: ${tx.hash}`);
        }

        const feeWei = receipt.gasUsed * receipt.gasPrice;
        const feeEth = Number.parseFloat(formatEther(feeWei));

        Console.info('ETH sweep broadcasted', {
            fromAddress: from,
            toVaultAddress: to,
            amountEth,
            feeEth,
            txHash: tx.hash
        });

        return { txHash: tx.hash, feeEth };
    }

    async sendFromDerivationPath(
        derivationPath: string,
        fromAddress: string,
        toAddress: string,
        amountEth: number
    ): Promise<{ txHash: string; feeEth: number }> {
        if (amountEth <= 0) {
            throw new ServiceError('Transfer amount must be greater than 0');
        }
        const provider = this.ethereumBlockchainService.getProvider();
        const derived = await this.ethereumWalletService.getDerivedWalletForPath(derivationPath);
        const signer = new Wallet(derived.privateKey, provider);
        const from = getAddress(fromAddress);
        const to = getAddress(toAddress);
        if (signer.address.toLowerCase() !== from.toLowerCase()) {
            throw new ServiceError(`Derived signer ${signer.address} does not match from address ${from}`);
        }
        const value = parseEther(String(amountEth));
        const tx = await signer.sendTransaction({ to, value });
        const receipt = await tx.wait();
        if (!receipt || receipt.status !== 1) {
            throw new ServiceError(`ETH transfer failed: ${tx.hash}`);
        }
        const feeWei = receipt.gasUsed * receipt.gasPrice;
        const feeEth = Number.parseFloat(formatEther(feeWei));
        return { txHash: tx.hash, feeEth };
    }

    async sendNativeSweepFromDerivationPath(
        derivationPath: string,
        fromAddress: string,
        toVaultAddress: string,
        amountEth: number
    ): Promise<{ txHash: string; feeEth: number }> {
        return this.sendFromDerivationPath(derivationPath, fromAddress, toVaultAddress, amountEth);
    }
}
