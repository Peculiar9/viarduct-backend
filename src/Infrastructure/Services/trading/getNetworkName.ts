/**
 * User-facing network label for deposit addresses / trade intents.
 * Production → mainnet; any non-production NODE_ENV → test networks.
 */
export function resolveNetworkName(cryptoType: string): string {
    return getNetworkName(cryptoType);
}

export function getNetworkName(cryptoType: string): string {
    const isProduction = process.env.NODE_ENV === 'production';
    const asset = String(cryptoType || '').trim().toUpperCase();

    switch (asset) {
        case 'ETH':
            return isProduction ? 'Ethereum Mainnet' : 'Ethereum Sepolia';
        case 'BTC':
            return isProduction ? 'Bitcoin Mainnet' : 'Bitcoin Testnet';
        case 'USDT':
            return isProduction ? 'Ethereum (ERC-20)' : 'Ethereum Sepolia (ERC-20)';
        default:
            return isProduction ? `${asset} Mainnet` : `${asset} Testnet`;
    }
}
