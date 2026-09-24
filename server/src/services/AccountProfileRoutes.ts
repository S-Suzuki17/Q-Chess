import express, { type RequestHandler, type ErrorRequestHandler } from 'express';
import { RankedAuth, isRankedUserId } from './RankedAuth';
import { AccountWriteGate } from './AccountDeletion';
import { AccountProfileError, parseDisplayName, validAccountFriendId, type AccountProfileStore } from './AccountProfiles';

/** Additive rollout: older clients keep their DB path until the Play update is available. */
export function createAccountProfileRouter(auth: RankedAuth, store: AccountProfileStore, gate: AccountWriteGate) {
    const router = express.Router();
    const attempts = new Map<string, { count: number; until: number }>();
    const pairs = new Set<string>();
    const allow = (key: string, max: number) => {
        const now = Date.now(); for (const [id, entry] of attempts) if (entry.until <= now) attempts.delete(id);
        const entry = attempts.get(key) ?? { count: 0, until: now + 60_000 };
        if (entry.count >= max || (!attempts.has(key) && attempts.size >= 10_000)) return false;
        entry.count++; attempts.set(key, entry); return true;
    };
    const rateError = (res: express.Response) => { res.setHeader('Retry-After', '60'); res.status(429).json({ code: 'TRY_LATER' }); };
    const authenticate: RequestHandler = async (req, res, next) => {
        res.setHeader('Cache-Control', 'no-store'); res.setHeader('Vary', 'Authorization');
        if (!allow(`ip:${req.socket.remoteAddress ?? 'unknown'}`, 180)) { rateError(res); return; }
        const token = /^Bearer ([-\w.]{1,8192})$/i.exec(req.headers.authorization ?? '')?.[1];
        const proof = auth.verifySession(token);
        let userId = proof?.userId;
        try {
            if (!userId && token && /^[-\w]+\.[-\w]+\.[-\w]+$/.test(token)) userId = await store.verifyUser(token) ?? undefined;
            if (!userId || !isRankedUserId(userId)) { res.status(401).json({ code: 'AUTH_REQUIRED' }); return; }
            if (!allow(`user:${userId}:${req.method}`, req.method === 'GET' ? 90 : 20)) { rateError(res); return; }
            if (Object.keys(req.query).length) { res.status(400).json({ code: 'INVALID_REQUEST' }); return; }
            if (gate.blocked(userId) || await store.blocked(userId)) { res.status(423).json({ code: 'ACCOUNT_DELETING' }); return; }
            if (proof && !auth.verifySession(token)) { res.status(401).json({ code: 'AUTH_REQUIRED' }); return; }
            res.locals.profileOwner = userId; res.locals.profileMayCreate = !proof; next();
        } catch { res.status(503).json({ code: 'UNAVAILABLE' }); }
    };
    const json: RequestHandler = (req, res, next) => { if (!req.is('application/json')) { res.status(415).json({ code: 'JSON_REQUIRED' }); return; } next(); };
    const body = express.json({ limit: '1kb', inflate: false });
    const exactBody = (value: unknown, keys: string[]) => !!value && typeof value === 'object' && !Array.isArray(value)
        && Object.keys(value).sort().join(',') === [...keys].sort().join(',');
    const fail = (error: unknown, res: express.Response) => {
        const code = error instanceof AccountProfileError ? error.code : 'UNAVAILABLE';
        if (code === 'TRY_LATER') { rateError(res); return; }
        res.status(code === 'INVALID_REQUEST' ? 400 : code === 'NOT_FOUND' ? 404 : code === 'ACCOUNT_DELETING' ? 423 : 503).json({ code });
    };
    // Operation leases survive request aborts and prevent deletion of either participant mid-write.
    const operate = async (ids: string[], fn: () => Promise<void>) => {
        const releases: (() => void)[] = [];
        try {
            for (const id of [...new Set(ids)].sort()) {
                const release = gate.enter(id); if (!release) throw new AccountProfileError('ACCOUNT_DELETING');
                releases.push(release);
                if (await store.blocked(id)) throw new AccountProfileError('ACCOUNT_DELETING');
            }
            await fn();
        } finally { releases.reverse().forEach(release => release()); }
    };
    router.get('/account/profile/capabilities', (_req, res) => { res.setHeader('Cache-Control', 'no-store'); res.json({ version: 1 }); });
    router.post('/account/profile/ensure', authenticate, json, body, async (req, res) => {
        try {
            if (!exactBody(req.body, ['name'])) throw new AccountProfileError('INVALID_REQUEST');
            // OAuth display names may be longer; only an initial fallback is used, never metadata for authorization.
            const name = parseDisplayName(req.body.name) ?? 'Player';
            const userId = res.locals.profileOwner;
            await operate([userId], async () => { res.json({ userId, profile: await store.ensure(userId, name, res.locals.profileMayCreate) }); });
        } catch (error) { fail(error, res); }
    });
    router.post('/account/profile/name', authenticate, json, body, async (req, res) => {
        try {
            const name = parseDisplayName(req.body?.name);
            if (!exactBody(req.body, ['name']) || !name) throw new AccountProfileError('INVALID_REQUEST');
            const userId = res.locals.profileOwner;
            await operate([userId], async () => { res.json({ userId, profile: await store.rename(userId, name) }); });
        } catch (error) { fail(error, res); }
    });
    router.get('/account/friends', authenticate, async (_req, res) => {
        try {
            const userId = res.locals.profileOwner;
            if (!await store.profile(userId)) throw new AccountProfileError('NOT_FOUND');
            const friends = (await store.friends(userId)).filter(row => row.user_id === userId || row.friend_id === userId);
            res.json({ userId, friends });
        } catch (error) { fail(error, res); }
    });
    router.post('/account/friends', authenticate, json, body, async (req, res) => {
        let pair: string | undefined;
        try {
            const userId = res.locals.profileOwner, peer = req.body?.friendId, action = req.body?.action;
            if (!exactBody(req.body, ['friendId', 'action']) || !validAccountFriendId(userId) || !validAccountFriendId(peer)
                || peer === userId || !['request', 'accept', 'remove'].includes(action)) throw new AccountProfileError('INVALID_REQUEST');
            const key = JSON.stringify([userId, peer].sort());
            if (pairs.has(key)) throw new AccountProfileError('TRY_LATER');
            pairs.add(key); pair = key;
            await operate([userId, peer], async () => {
                if (!await store.profile(userId)) throw new AccountProfileError('NOT_FOUND');
                res.json({ userId, changed: await store.changeFriend(userId, peer, action) });
            });
        } catch (error) { fail(error, res); }
        finally { if (pair) pairs.delete(pair); }
    });
    const malformed: ErrorRequestHandler = (error, _req, res, next) => {
        if (['entity.too.large', 'entity.parse.failed', 'encoding.unsupported'].includes(error?.type)) {
            res.status(error.type === 'entity.too.large' ? 413 : error.type === 'encoding.unsupported' ? 415 : 400).json({ code: 'INVALID_REQUEST' }); return;
        } next(error);
    };
    router.use(malformed); return router;
}
