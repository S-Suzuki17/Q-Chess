import express, { type ErrorRequestHandler, type RequestHandler } from 'express';
import { RankedAuth, isRankedUserId } from './RankedAuth';
import { AccountWriteGate } from './AccountDeletion';
import type { DailyLoginStore } from './DailyLoginStore';
import { dailyLoginRewardsEnabled } from './TicketFeatureGates';

/** This flag stays OFF until the atomic database functions are deployed and tested. */
export function createDailyLoginRouter(
    auth: RankedAuth,
    store: DailyLoginStore,
    gate: AccountWriteGate,
    enabled = dailyLoginRewardsEnabled,
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
    const rateError = (res: express.Response) => {
        res.setHeader('Retry-After', '60'); res.status(429).json({ code: 'TRY_LATER' });
    };
    const authenticate: RequestHandler = async (req, res, next) => {
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('Vary', 'Authorization');
        if (!enabled()) { res.status(503).json({ code: 'FEATURE_DISABLED', enabled: false }); return; }
        if (!allow(`ip:${req.socket.remoteAddress ?? 'unknown'}`, 180)) { rateError(res); return; }
        const token = /^Bearer ([-\w.]{1,8192})$/i.exec(req.headers.authorization ?? '')?.[1];
        const proof = auth.verifySession(token);
        let userId = proof?.userId;
        try {
            if (!userId && token && /^[-\w]+\.[-\w]+\.[-\w]+$/.test(token)) {
                userId = await store.verifyUser(token) ?? undefined;
            }
            if (!userId || !isRankedUserId(userId)) { res.status(401).json({ code: 'AUTH_REQUIRED' }); return; }
            if (!allow(`user:${userId}:${req.method}`, req.method === 'GET' ? 90 : 12)) { rateError(res); return; }
            if (Object.keys(req.query).length) { res.status(400).json({ code: 'INVALID_REQUEST' }); return; }
            if (gate.blocked(userId) || await store.blocked(userId)) {
                res.status(423).json({ code: 'ACCOUNT_DELETING' }); return;
            }
            if (proof && !auth.verifySession(token)) { res.status(401).json({ code: 'AUTH_REQUIRED' }); return; }
            res.locals.rewardUser = userId;
            res.locals.rewardSession = token ?? null;
            res.locals.rewardLegacy = !!proof;
            next();
        } catch { res.status(503).json({ code: 'REWARD_UNAVAILABLE' }); }
    };

    router.get('/rewards/daily-login', authenticate, async (_req, res) => {
        try {
            const userId = res.locals.rewardUser as string;
            res.json({ userId, enabled: true, ...await store.read(userId), currentUtcDay: new Date().toISOString().slice(0, 10) });
        } catch { res.status(503).json({ code: 'REWARD_UNAVAILABLE' }); }
    });
    router.post('/rewards/daily-login/claim', authenticate,
        (req, res, next) => {
            if (!req.is('application/json')) { res.status(415).json({ code: 'JSON_REQUIRED' }); return; }
            next();
        }, express.json({ limit: '128b', inflate: false }), async (req, res) => {
            if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)
                || Object.keys(req.body).length !== 0) {
                res.status(400).json({ code: 'INVALID_REQUEST' }); return;
            }
            const userId = res.locals.rewardUser as string;
            const release = gate.enter(userId);
            if (!release) { res.status(423).json({ code: 'ACCOUNT_DELETING' }); return; }
            try {
                if (await store.blocked(userId)) { res.status(423).json({ code: 'ACCOUNT_DELETING' }); return; }
                const session = res.locals.rewardSession as string | null;
                if (session && (res.locals.rewardLegacy
                    ? !auth.verifySession(session, userId)
                    : await store.verifyUser(session) !== userId)) {
                    res.status(401).json({ code: 'AUTH_REQUIRED' }); return;
                }
                if (!await store.hasCurrentTerms(userId)) { res.status(403).json({ code: 'CURRENT_TERMS_REQUIRED' }); return; }
                // Atomic same-day idempotency and server UTC time belong to the DB RPC.
                res.json({ userId, enabled: true, ...await store.claim(userId), currentUtcDay: new Date().toISOString().slice(0, 10) });
            } catch { res.status(503).json({ code: 'REWARD_UNAVAILABLE' }); }
            finally { release(); }
        });
    const malformed: ErrorRequestHandler = (error, _req, res, next) => {
        if (['entity.too.large', 'entity.parse.failed', 'encoding.unsupported'].includes(error?.type)) {
            res.status(error.type === 'entity.too.large' ? 413 : error.type === 'encoding.unsupported' ? 415 : 400)
                .json({ code: 'INVALID_REQUEST' }); return;
        }
        next(error);
    };
    router.use(malformed);
    return router;
}
