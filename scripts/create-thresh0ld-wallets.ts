/**
 * One-time Thresh0ld setup script.
 *
 * Usage:
 *   1. Put THRESH0LD_CLIENT_ID / THRESH0LD_CLIENT_SECRET / THRESH0LD_BASE_URL in .env
 *   2. npx ts-node scripts/create-thresh0ld-wallets.ts
 *   3. Copy printed wallet IDs into .env
 *
 * Optional args:
 *   --coins=btc,eth
 *   --type=deposit|withdrawal
 *   --list-only   (do not create; only list existing wallets)
 */
import { EnvironmentConfig } from '../src/Infrastructure/Config/EnvironmentConfig';
import { Thresh0ldApiClient } from '../src/Infrastructure/Services/custody/thresh0ld/Thresh0ldApiClient';

function parseArgs(argv: string[]) {
    const coinsArg = argv.find(a => a.startsWith('--coins='));
    const typeArg = argv.find(a => a.startsWith('--type='));
    const listOnly = argv.includes('--list-only');
    const coins = (coinsArg?.split('=')[1] || 'btc,eth')
        .split(',')
        .map(c => c.trim().toLowerCase())
        .filter(Boolean);
    const walletType = (typeArg?.split('=')[1] || 'deposit').trim();
    return { coins, walletType, listOnly };
}

async function main() {
    EnvironmentConfig.initialize();

    const clientId = EnvironmentConfig.get('THRESH0LD_CLIENT_ID', '').trim();
    const clientSecret = EnvironmentConfig.get('THRESH0LD_CLIENT_SECRET', '').trim();
    if (!clientId || !clientSecret) {
        console.error('Missing THRESH0LD_CLIENT_ID / THRESH0LD_CLIENT_SECRET in .env');
        process.exit(1);
    }

    const { coins, walletType, listOnly } = parseArgs(process.argv.slice(2));
    const client = new Thresh0ldApiClient();

    console.log('Thresh0ld base URL:', EnvironmentConfig.get('THRESH0LD_BASE_URL', 'https://vaults-dev.thresh0ld.com'));
    console.log('Mode:', listOnly ? 'list-only' : `create (${walletType})`);
    console.log('Coins:', coins.join(', '));
    console.log('---');

    for (const coin of coins) {
        console.log(`\n[${coin.toUpperCase()}] listing existing wallets...`);
        try {
            const listed = await client.listWallets(coin);
            console.log(JSON.stringify(listed, null, 2));
        } catch (error: any) {
            console.warn(`list failed for ${coin}:`, error?.message || error);
        }

        if (listOnly) continue;

        console.log(`\n[${coin.toUpperCase()}] creating ${walletType} wallet...`);
        try {
            const created = await client.createWallet(coin, walletType);
            console.log(`Created walletId=${created.walletId}`);
            console.log('Raw response:', JSON.stringify(created.raw, null, 2));
            console.log(
                `→ Add to .env: THRESH0LD_HOT_WALLET_ID_${coin.toUpperCase()}=${created.walletId}`
            );
        } catch (error: any) {
            console.error(`create failed for ${coin}:`, error?.message || error);
        }
    }

    console.log('\nDone. After creating, set TRANSACTION_MODE=automated and CUSTODY_PROVIDER=thresh0ld, then restart the API.');
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
