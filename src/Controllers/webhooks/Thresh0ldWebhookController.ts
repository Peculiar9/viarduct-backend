import { createHmac, timingSafeEqual } from 'crypto';
import { Request, Response } from 'express';
import { inject } from 'inversify';
import { controller, httpPost, request, response } from 'inversify-express-utils';
import { API_PATH, TYPES } from '../../Core/Types/Constants';
import { BaseController } from '../BaseController';
import { ITradeIntentService } from '../../Core/Application/Interface/Services/ITradeIntentService';
import { IWalletService } from '../../Core/Application/Interface/Services/IWalletService';
import { TradeIntentNotificationHelper } from '../../Infrastructure/Services/trading/TradeIntentNotificationHelper';
import { EnvironmentConfig } from '../../Infrastructure/Config/EnvironmentConfig';
import { Console } from '../../Infrastructure/Utils/Console';
import { Thresh0ldWebhookPayload } from '../../Infrastructure/Services/custody/thresh0ld/Thresh0ldTypes';

type MappedAsset = 'BTC' | 'ETH' | 'USDT';
type ReceiveHandleResult = { status: 'OK' | 'PENDING_CONFIRMATION' | 'IGNORED' };

@controller(`/${API_PATH}/webhooks/thresh0ld`)
export class Thresh0ldWebhookController extends BaseController {
    constructor(
        @inject(TYPES.TradeIntentService) private readonly tradeIntentService: ITradeIntentService,
        @inject(TYPES.WalletService) private readonly walletService: IWalletService,
        @inject(TYPES.TradeIntentNotificationHelper)
        private readonly intentNotifications: TradeIntentNotificationHelper
    ) {
        super();
    }

    /**
     * Thresh0ld MPC custody webhook.
     * @route POST /api/v1/webhooks/thresh0ld
     */
    @httpPost('/')
    async handleWebhook(@request() req: Request, @response() res: Response) {
        try {
            if (!this.verifySignature(req)) {
                Console.warn('Thresh0ld webhook: invalid signature');
                return res.status(401).json({ success: false, message: 'Invalid signature' });
            }

            const payload = (req.body || {}) as Thresh0ldWebhookPayload;
            const eventName = this.resolveEventName(payload);
            Console.info('Thresh0ld webhook received', {
                eventName,
                keys: Object.keys(payload || {})
            });

            if (this.isReceiveEvent(eventName)) {
                const result = await this.handleReceive(payload);
                if (result.status === 'PENDING_CONFIRMATION') {
                    return res.status(200).json({ status: 'PENDING_CONFIRMATION' });
                }
            } else if (this.isSendEvent(eventName)) {
                Console.info('Thresh0ld webhook: Send event acknowledged', {
                    txHash: this.extractTxHash(payload)
                });
            } else {
                Console.info('Thresh0ld webhook: unhandled event type', { eventName });
            }

            return res.status(200).json({ success: true, message: 'OK' });
        } catch (error: any) {
            Console.error(error, {
                message: `Thresh0ldWebhookController::handleWebhook - ${error?.message}`
            });
            return res.status(200).json({ success: true, message: 'OK' });
        }
    }

    private async handleReceive(payload: Thresh0ldWebhookPayload): Promise<ReceiveHandleResult> {
        const address = this.extractAddress(payload);
        const txHash = this.extractTxHash(payload);
        const amountCrypto = this.extractAmount(payload);
        const asset = this.extractAsset(payload);

        if (!address || !txHash || !asset || !(amountCrypto > 0)) {
            Console.warn('Thresh0ld Receive event missing fields', {
                address,
                txHash,
                amountCrypto,
                asset
            });
            return { status: 'IGNORED' };
        }

        if (!this.isDepositConfirmed(payload, asset)) {
            Console.info('Thresh0ld Receive pending confirmation', {
                txHash,
                asset,
                status: this.extractStatus(payload),
                confirmations: this.extractConfirmations(payload)
            });
            return { status: 'PENDING_CONFIRMATION' };
        }

        if (asset === 'USDT') {
            Console.warn('Thresh0ld USDT/ERC-20 Receive identified but native user ledger is BTC/ETH only', {
                txHash,
                address
            });
            return { status: 'IGNORED' };
        }

        const walletCredit = await this.walletService.handleIncomingWalletDeposit({
            address,
            txHash,
            amountCrypto,
            asset
        });
        if (walletCredit.credited || walletCredit.alreadyProcessed) {
            Console.info('Thresh0ld Receive applied to user wallet', {
                userId: walletCredit.userId,
                credited: walletCredit.credited,
                alreadyProcessed: walletCredit.alreadyProcessed
            });
            return { status: 'OK' };
        }

        const updated = await this.tradeIntentService.handleIncomingCryptoDeposit({
            address,
            txHash,
            amountCrypto,
            asset
        });

        if (updated && updated.status === 'crypto_detected') {
            void this.intentNotifications.onDepositTxHashSubmitted(updated);
        }
        return { status: 'OK' };
    }

    private isDepositConfirmed(payload: Thresh0ldWebhookPayload, asset: MappedAsset): boolean {
        const status = this.extractStatus(payload);
        if (
            status === 'CONFIRMED' ||
            status === 'SUCCESS' ||
            status === 'COMPLETED' ||
            status === 'FINALIZED'
        ) {
            return true;
        }
        if (
            status === 'PENDING' ||
            status === 'UNCONFIRMED' ||
            status === 'MEMPOOL' ||
            status === 'PENDING_CONFIRMATION'
        ) {
            return false;
        }

        const confirmations = this.extractConfirmations(payload);
        if (confirmations == null) {
            return false;
        }
        const minRequired =
            asset === 'BTC'
                ? Number(EnvironmentConfig.get('THRESH0LD_BTC_MIN_CONFIRMATIONS', '2'))
                : Number(EnvironmentConfig.get('THRESH0LD_ETH_MIN_CONFIRMATIONS', '1'));
        return confirmations >= (Number.isFinite(minRequired) ? minRequired : asset === 'BTC' ? 2 : 1);
    }

    private extractStatus(payload: Thresh0ldWebhookPayload): string {
        return String(payload.status || payload.data?.status || '')
            .trim()
            .toUpperCase();
    }

    private extractConfirmations(payload: Thresh0ldWebhookPayload): number | null {
        const raw = payload.confirmations ?? payload.data?.confirmations;
        if (raw === undefined || raw === null || raw === '') {
            return null;
        }
        const value = Number(raw);
        return Number.isFinite(value) ? value : null;
    }

    private verifySignature(req: Request): boolean {
        const secret = EnvironmentConfig.get('THRESH0LD_WEBHOOK_SECRET', '').trim();
        if (!secret) {
            Console.warn('THRESH0LD_WEBHOOK_SECRET not set — rejecting webhook');
            return false;
        }

        const header =
            (req.headers['x-thresh0ld-signature'] as string) ||
            (req.headers['x-signature'] as string) ||
            (req.headers['x-hub-signature-256'] as string) ||
            '';

        if (!header) {
            return false;
        }

        const provided = header.replace(/^sha256=/i, '').trim();
        const rawBody =
            typeof (req as any).rawBody === 'string' || Buffer.isBuffer((req as any).rawBody)
                ? (req as any).rawBody
                : JSON.stringify(req.body ?? {});

        const expected = createHmac('sha256', secret).update(rawBody).digest('hex');

        try {
            const a = Buffer.from(provided, 'utf8');
            const b = Buffer.from(expected, 'utf8');
            if (a.length !== b.length) return false;
            return timingSafeEqual(a, b);
        } catch {
            return false;
        }
    }

    private resolveEventName(payload: Thresh0ldWebhookPayload): string {
        return String(
            payload.event ||
                payload.type ||
                payload.eventType ||
                payload.data?.event ||
                payload.data?.type ||
                ''
        ).trim();
    }

    private isReceiveEvent(eventName: string): boolean {
        const n = eventName.toLowerCase();
        return n === 'receive' || n.includes('receive') || n.includes('incoming') || n.includes('deposit');
    }

    private isSendEvent(eventName: string): boolean {
        const n = eventName.toLowerCase();
        return n === 'send' || n.includes('send') || n.includes('outgoing') || n.includes('withdraw');
    }

    private extractAddress(payload: Thresh0ldWebhookPayload): string | null {
        const value = payload.address || payload.data?.address;
        return value ? String(value).trim() : null;
    }

    private extractTxHash(payload: Thresh0ldWebhookPayload): string | null {
        const value =
            payload.txHash ||
            payload.txid ||
            payload.transactionHash ||
            payload.data?.txHash ||
            payload.data?.txid ||
            payload.data?.transactionHash;
        return value ? String(value).trim() : null;
    }

    private extractAmount(payload: Thresh0ldWebhookPayload): number {
        const raw = payload.amount ?? payload.data?.amount;
        const amount = Number(raw);
        return Number.isFinite(amount) ? amount : 0;
    }

    private extractAsset(payload: Thresh0ldWebhookPayload): MappedAsset | null {
        const raw = String(
            payload.coin ||
                payload.asset ||
                payload.data?.coin ||
                payload.data?.asset ||
                payload.data?.tokenName ||
                ''
        )
            .trim()
            .toUpperCase()
            .replace(/[\s-]+/g, '_');

        if (
            raw === 'USDT' ||
            raw === 'ERC20_USDT' ||
            raw === 'USDT_ERC20' ||
            raw === 'TETHER'
        ) {
            return 'USDT';
        }
        if (
            raw === 'ETH' ||
            raw === 'ETHEREUM' ||
            raw === 'SEPOLIA' ||
            raw === 'HOLESKY' ||
            raw === 'ETH_SEPOLIA' ||
            raw === 'SEPOLIA_ETH'
        ) {
            return 'ETH';
        }
        if (
            raw === 'BTC' ||
            raw === 'TBTC' ||
            raw === 'BITCOIN' ||
            raw === 'TESTNET' ||
            raw === 'BTC_TESTNET' ||
            raw === 'BITCOIN_TESTNET'
        ) {
            return 'BTC';
        }
        return null;
    }
}
