import express, { type ErrorRequestHandler, type RequestHandler } from 'express';
import { RankedAuth, isRankedUserId } from './RankedAuth';
import { AccountWriteGate } from './AccountDeletion';
import { StripeMembershipError, StripeMembershipApi, verifyStripeWebhook } from './StripeMembership';
import type { StripeMembershipStore } from './StripeMembershipStore';
import type { StripePortalApi } from './StripePortal';

type Enabled = () => boolean;
const REVERSAL_EVENTS = new Set([
    'charge.refunded', 'charge.dispute.created', 'radar.early_fraud_warning.created',
]);

/** Mount before any JSON parser or account middleware. All routes default OFF. */
export function createStripeWebhookRouter(
    api: StripeMembershipApi | null,
    store: StripeMembershipStore,
    webhookSecret: string,
    enabled: Enabled = () => process.env.STRIPE_MEMBERSHIP_TEST_ENABLED === 'true',
) {
    const router = express.Router();
    router.post('/membership/stripe/webhook', (req, res, next) => {
        res.setHeader('Cache-Control', 'no-store');
        if (!enabled() || !api) { res.status(503).json({ code: 'FEATURE_DISABLED' }); return; }
        if (!req.is('application/json')) { res.status(415).json({ code: 'JSON_REQUIRED' }); return; }
        next();
    }, express.raw({ type: 'application/json', limit: '64kb', inflate: false }), async (req, res) => {
        try {
            const event = verifyStripeWebhook(req.body, req.headers, webhookSecret);
            if (event.livemode !== api!.livemode) throw new StripeMembershipError('EVENT_MODE_MISMATCH');
            if (REVERSAL_EVENTS.has(event.type)) {
                const targets = await api!.resolveReversal(event);
                for (const target of targets) {
                    const lease = await store.acquireReconciliation(target.subscriptionId, event.livemode);
                    if (lease.retired) continue;
                    try {
                        const context = await api!.reversalContext(event, target.subscriptionId);
                        const reversedInvoiceId = target.reversedInvoiceIds.includes(context.currentInvoiceId)
                            ? context.currentInvoiceId : target.reversedInvoiceIds[0];
                        if (!reversedInvoiceId) throw new StripeMembershipError('REVERSAL_INVOICE_MISSING');
                        await store.applyReversal({
                            eventId: event.id, eventPayloadHash: event.payloadHash,
                            eventType: event.type as 'charge.refunded' | 'charge.dispute.created' | 'radar.early_fraud_warning.created',
                            subscriptionId: target.subscriptionId, reversedInvoiceId,
                            currentInvoiceId: context.currentInvoiceId,
                            checkoutId: context.checkoutId, customerId: context.customerId,
                            userId: context.userId, periodEnd: context.periodEnd, livemode: event.livemode,
                            reconciliationToken: lease.token!,
                        });
                    } finally {
                        await store.releaseReconciliation(target.subscriptionId, event.livemode, lease.token!);
                    }
                }
                res.status(targets.length ? 200 : 202).json({ received: true });
                return;
            }
            const subscriptionId = api!.eventSubscriptionId(event);
            if (!subscriptionId) { res.status(202).json({ received: true }); return; }
            const lease = await store.acquireReconciliation(subscriptionId, event.livemode);
            if (lease.retired) { res.status(200).json({ received: true }); return; }
            try {
                const snapshot = await api!.snapshot(event);
                if (!snapshot || snapshot.subscriptionId !== subscriptionId) throw new StripeMembershipError();
                await store.applySnapshot({ ...snapshot, reconciliationToken: lease.token! });
            } finally {
                await store.releaseReconciliation(subscriptionId, event.livemode, lease.token!);
            }
            res.status(200).json({ received: true });
        } catch (error) {
            const code = error instanceof StripeMembershipError ? error.message : '';
            // Bad signatures are terminal. Transient Stripe/DB or unresolved reversal
            // conditions must be retried, never silently acknowledged.
            if (code === 'INVALID_SIGNATURE' || code === 'INVALID_EVENT' || code === 'EVENT_MODE_MISMATCH') {
                res.status(400).json({ code: 'INVALID_WEBHOOK' }); return;
            }
            res.setHeader('Retry-After', '60');
            res.status(503).json({ code: 'MEMBERSHIP_UNAVAILABLE' });
        }
    });
    const malformed: ErrorRequestHandler = (error, _req, res, next) => {
        if (['entity.too.large', 'entity.parse.failed', 'encoding.unsupported'].includes(error?.type)) {
            res.status(error.type === 'entity.too.large' ? 413 : 400).json({ code: 'INVALID_WEBHOOK' }); return;
        }
        next(error);
    };
    router.use(malformed);
    return router;
}

/** Authenticated checkout. No billing URL is returned before DB intent registration. */
export function createStripeMembershipRouter(
    auth: RankedAuth,
    api: StripeMembershipApi | null,
    store: StripeMembershipStore,
    gate: AccountWriteGate,
    enabled: Enabled = () => process.env.STRIPE_MEMBERSHIP_TEST_ENABLED === 'true',
    portalApi: StripePortalApi | null = null,
    portalEnabled: Enabled = () => process.env.STRIPE_MEMBERSHIP_PORTAL_ENABLED === 'true',
    checkoutEnabled: Enabled = enabled,
) {
    const router = express.Router();
    const attempts = new Map<string, { count: number; until: number }>();
    const allow = (key: string, max: number) => {
        const now = Date.now();
        for (const [id, entry] of attempts) if (entry.until <= now) attempts.delete(id);
        const entry = attempts.get(key) ?? { count: 0, until: now + 60_000 };
        if (entry.count >= max || (!attempts.has(key) && attempts.size >= 10_000)) return false;
        entry.count++; attempts.set(key, entry); return true;
    };
    const authenticateFor = (available: () => boolean): RequestHandler => async (req, res, next) => {
        res.setHeader('Cache-Control', 'no-store'); res.setHeader('Vary', 'Authorization');
        if (!available()) { res.status(503).json({ code: 'FEATURE_DISABLED', enabled: false }); return; }
        if (!allow(`ip:${req.socket.remoteAddress ?? 'unknown'}`, 120)) {
            res.setHeader('Retry-After', '60'); res.status(429).json({ code: 'TRY_LATER' }); return;
        }
        const token = /^Bearer ([-\w.]{1,8192})$/i.exec(req.headers.authorization ?? '')?.[1];
        const proof = auth.verifySession(token);
        let userId = proof?.userId;
        try {
            if (!userId && token && /^[-\w]+\.[-\w]+\.[-\w]+$/.test(token))
                userId = await store.verifyUser(token) ?? undefined;
            if (!userId || !isRankedUserId(userId)) { res.status(401).json({ code: 'AUTH_REQUIRED' }); return; }
            if (!allow(`user:${userId}:${req.method}`, req.method === 'GET' ? 60 : 6)) {
                res.setHeader('Retry-After', '60'); res.status(429).json({ code: 'TRY_LATER' }); return;
            }
            if (Object.keys(req.query).length) { res.status(400).json({ code: 'INVALID_REQUEST' }); return; }
            if (gate.blocked(userId) || await store.blocked(userId)) {
                res.status(423).json({ code: 'ACCOUNT_DELETING' }); return;
            }
            if (proof && !auth.verifySession(token)) { res.status(401).json({ code: 'AUTH_REQUIRED' }); return; }
            res.locals.memberUser = userId;
            res.locals.memberToken = token;
            res.locals.memberLegacy = !!proof;
            next();
        } catch { res.status(503).json({ code: 'MEMBERSHIP_UNAVAILABLE' }); }
    };
    const authenticate = authenticateFor(() => enabled() && !!api);
    const authenticateCheckout = authenticateFor(() => checkoutEnabled() && enabled() && !!api);
    const authenticatePortal = authenticateFor(() => portalEnabled() && !!portalApi);
    const emptyJson: RequestHandler[] = [
        (req, res, next) => {
            if (!req.is('application/json')) { res.status(415).json({ code: 'JSON_REQUIRED' }); return; }
            next();
        },
        express.json({ limit: '128b', inflate: false }),
        (req, res, next) => {
            if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)
                || Object.keys(req.body).length !== 0) {
                res.status(400).json({ code: 'INVALID_REQUEST' }); return;
            }
            next();
        },
    ];
    const recheck = async (res: express.Response, userId: string) => {
        if (await store.blocked(userId)) return false;
        const token = res.locals.memberToken as string;
        return res.locals.memberLegacy
            ? !!auth.verifySession(token, userId)
            : await store.verifyUser(token) === userId;
    };
    router.get('/membership/stripe/status', authenticate, async (_req, res) => {
        try {
            const userId = res.locals.memberUser as string;
            const status = await store.status(userId, api!.livemode);
            const owner = portalEnabled() && portalApi
                ? await store.portalCustomer(userId, portalApi.livemode) : null;
            res.json({ enabled: true, ...status,
                canManageBilling: !!owner && owner.livemode === portalApi?.livemode });
        }
        catch { res.status(503).json({ code: 'MEMBERSHIP_UNAVAILABLE' }); }
    });
    router.post('/membership/stripe/checkout', authenticateCheckout, ...emptyJson, async (_req, res) => {
        const userId = res.locals.memberUser as string;
        const release = gate.enter(userId);
        if (!release) { res.status(423).json({ code: 'ACCOUNT_DELETING' }); return; }
        let checkoutId: string | undefined;
        try {
            if (!(await recheck(res, userId))) { res.status(401).json({ code: 'AUTH_REQUIRED' }); return; }
            let preflight = await store.preflight(userId, api!.livemode);
            if (preflight.reason === 'checkout_pending' && preflight.checkoutId && preflight.expiresAt
                && Date.parse(preflight.expiresAt) <= Date.now()) {
                // An elapsed deadline does not prove non-payment. Stripe's
                // terminal expired status does; a completed session remains
                // blocked until its signed webhook has been reconciled.
                if (await api!.isCheckoutExpired(preflight.checkoutId)) {
                    await store.closeExpiredIntent(userId, preflight.checkoutId, api!.livemode);
                    preflight = await store.preflight(userId, api!.livemode);
                }
            }
            if (!preflight.eligible) { res.status(409).json({ code: 'CHECKOUT_ALREADY_PENDING' }); return; }
            const checkout = await api!.createCheckout(userId);
            checkoutId = checkout.id;
            // Atomic DB registration rejects concurrent requests/active membership.
            await store.registerCheckoutIntent(userId, checkout.id, api!.priceId, checkout.expiresAt, api!.livemode);
            if (!(await recheck(res, userId))) {
                await api!.expireCheckout(checkout.id);
                res.status(401).json({ code: 'AUTH_REQUIRED' }); return;
            }
            res.json({ url: checkout.url });
        } catch {
            if (checkoutId) await api!.expireCheckout(checkoutId).catch(() => {});
            res.status(503).json({ code: 'MEMBERSHIP_UNAVAILABLE' });
        } finally { release(); }
    });
    router.post('/membership/stripe/daily-grant', authenticate, ...emptyJson, async (_req, res) => {
        const userId = res.locals.memberUser as string;
        const release = gate.enter(userId);
        if (!release) { res.status(423).json({ code: 'ACCOUNT_DELETING' }); return; }
        try {
            if (!(await recheck(res, userId))) { res.status(401).json({ code: 'AUTH_REQUIRED' }); return; }
            res.json({ enabled: true, ...await store.claim(userId, api!.livemode) });
        } catch { res.status(503).json({ code: 'MEMBERSHIP_UNAVAILABLE' }); }
        finally { release(); }
    });
    router.post('/membership/stripe/portal', authenticatePortal, ...emptyJson, async (_req, res) => {
        const userId = res.locals.memberUser as string;
        const release = gate.enter(userId);
        if (!release) { res.status(423).json({ code: 'ACCOUNT_DELETING' }); return; }
        try {
            if (!(await recheck(res, userId))) { res.status(401).json({ code: 'AUTH_REQUIRED' }); return; }
            const owner = await store.portalCustomer(userId, portalApi!.livemode);
            if (!owner) { res.status(404).json({ code: 'MEMBERSHIP_NOT_FOUND' }); return; }
            if (owner.livemode !== portalApi!.livemode) {
                res.status(503).json({ code: 'MEMBERSHIP_UNAVAILABLE' }); return;
            }
            const url = await portalApi!.createSession(owner.customerId);
            if (!(await recheck(res, userId))) { res.status(401).json({ code: 'AUTH_REQUIRED' }); return; }
            res.json({ url });
        } catch { res.status(503).json({ code: 'MEMBERSHIP_UNAVAILABLE' }); }
        finally { release(); }
    });
    const malformed: ErrorRequestHandler = (error, _req, res, next) => {
        if (['entity.too.large', 'entity.parse.failed', 'encoding.unsupported'].includes(error?.type)) {
            res.status(error.type === 'entity.too.large' ? 413 : 400).json({ code: 'INVALID_REQUEST' }); return;
        }
        next(error);
    };
    router.use(malformed);
    return router;
}
