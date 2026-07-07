export type CustodyAsset = 'BTC' | 'ETH';

export interface CustodyDepositAddress {
    address: string;
    derivationPath?: string;
    providerRef?: string;
}

export interface CustodyFeeEstimate {
    feeCrypto: number;
    feeNgn: number;
}

export interface CustodyBroadcastResult {
    txHash: string;
    feeCrypto?: number;
}

export interface ICustodyProvider {
    readonly providerName: 'inhouse' | 'liminal';

    createDepositAddress(intentId: string, asset: CustodyAsset): Promise<CustodyDepositAddress>;

    registerDepositWatcher(address: string, intentId: string, asset: CustodyAsset): Promise<void>;

    getVaultAddress(asset: CustodyAsset): Promise<string>;

    estimateOutboundFee(
        asset: CustodyAsset,
        fromAddress: string,
        toAddress: string,
        amountCrypto: number
    ): Promise<CustodyFeeEstimate>;

    estimateSweepFee(
        asset: CustodyAsset,
        fromAddress: string,
        vaultAddress: string,
        amountCrypto: number,
        derivationPath?: string
    ): Promise<CustodyFeeEstimate>;

    broadcastOutbound(
        asset: CustodyAsset,
        toAddress: string,
        amountCrypto: number,
        options?: { fromDerivationPath?: string; fromAddress?: string }
    ): Promise<CustodyBroadcastResult>;

    sweepTradeIntentDeposit(
        asset: CustodyAsset,
        intentId: string,
        fromAddress: string,
        derivationPath: string,
        amountCrypto: number
    ): Promise<CustodyBroadcastResult>;
}
