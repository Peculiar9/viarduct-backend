import { injectable } from 'inversify';
import { ServiceError } from '../../../Core/Application/Error/AppError';
import { IEthereumWalletService } from '../../../Core/Application/Interface/Services/IEthereumWalletService';

@injectable()
export class DisabledEthereumWalletService implements IEthereumWalletService {
    private disabled(): never {
        throw new ServiceError('Ethereum is disabled (set ENABLE_ETHEREUM=true to enable)');
    }

    generateAddress(): Promise<{ address: string }> {
        this.disabled();
    }

    getOrGenerateAddress(): Promise<string> {
        this.disabled();
    }

    initializePlatformWallet(): Promise<void> {
        this.disabled();
    }

    getPlatformWalletAddress(): Promise<string> {
        this.disabled();
    }

    getDerivedWalletForAccount(): Promise<import('ethers').HDNodeWallet> {
        this.disabled();
    }
}

