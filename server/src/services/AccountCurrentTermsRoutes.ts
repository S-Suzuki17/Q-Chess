import express from 'express';
import { type RankedSessionAuthority, isRankedUserId } from './RankedAuth';
import { AccountWriteGate } from './AccountDeletion';
import { CURRENT_TICKET_TERMS_VERSION, type createCurrentTermsStore } from './AccountCurrentTerms';

/** Keep the shipped Android /account/terms contract unchanged. */
export function createCurrentTermsRouter(auth: RankedSessionAuthority, store: ReturnType<typeof createCurrentTermsStore>, gate: AccountWriteGate) {
    const router = express.Router(), counts = new Map<string, { n: number; until: number }>();
    const allow = (key: string, max: number) => {
        const now = Date.now(); for (const [k, v] of counts) if (v.until <= now) counts.delete(k);
        const v = counts.get(key) ?? { n: 0, until: now + 60000 };
        if (v.n >= max || (!counts.has(key) && counts.size >= 10000)) return false;
        v.n++; counts.set(key, v); return true;
    };
    const recheck = async (res: express.Response) => res.locals.legacy
        ? !!(await auth.verifySession(res.locals.token, res.locals.owner))
        : await store.verifyUser(res.locals.token) === res.locals.owner;
    router.use('/account/current-terms', async (req, res, next) => {
        res.setHeader('Cache-Control', 'no-store'); res.setHeader('Vary', 'Authorization');
        if (!allow(`ip:${req.socket.remoteAddress ?? 'unknown'}`, 120)) { res.setHeader('Retry-After', '60'); res.status(429).json({ code: 'TRY_LATER' }); return; }
        const token = /^Bearer ([-\w.]{1,8192})$/i.exec(req.headers.authorization ?? '')?.[1];
        try {
            const proof = await auth.verifySession(token);
            const id = proof?.userId ?? (token && /^[-\w]+\.[-\w]+\.[-\w]+$/.test(token) ? await store.verifyUser(token) : null);
            if (!id || !isRankedUserId(id)) { res.status(401).json({ code: 'AUTH_REQUIRED' }); return; }
            if (Object.keys(req.query).length) { res.status(400).json({ code: 'INVALID_REQUEST' }); return; }
            if (!allow(`user:${id}`, 30)) { res.setHeader('Retry-After', '60'); res.status(429).json({ code: 'TRY_LATER' }); return; }
            if (gate.blocked(id) || await store.blocked(id)) { res.status(423).json({ code: 'ACCOUNT_DELETING' }); return; }
            res.locals.owner = id; res.locals.token = token; res.locals.legacy = !!proof;
            if (!await recheck(res)) { res.status(401).json({ code: 'AUTH_REQUIRED' }); return; }
            next();
        } catch { res.status(503).json({ code: 'TERMS_UNAVAILABLE' }); }
    });
    router.get('/account/current-terms', async (_req, res) => {
        try {
            const value = await store.read(res.locals.owner);
            if (!await recheck(res)) { res.status(401).json({ code: 'AUTH_REQUIRED' }); return; }
            res.json(value);
        } catch { res.status(503).json({ code: 'TERMS_UNAVAILABLE' }); }
    });
    router.post('/account/current-terms', express.json({ limit: '1kb', inflate: false }), async (req, res) => {
        if (!req.is('application/json') || !req.body || Array.isArray(req.body)
            || Object.keys(req.body).sort().join(',') !== 'accepted,version'
            || req.body.accepted !== true || req.body.version !== CURRENT_TICKET_TERMS_VERSION) {
            res.status(400).json({ code: 'INVALID_REQUEST' }); return;
        }
        const id = res.locals.owner, release = gate.enter(id);
        if (!release) { res.status(423).json({ code: 'ACCOUNT_DELETING' }); return; }
        try {
            if (await store.blocked(id)) { res.status(423).json({ code: 'ACCOUNT_DELETING' }); return; }
            if (!(await store.read(id)).effective) { res.status(409).json({ code: 'TERMS_NOT_EFFECTIVE' }); return; }
            if (!await recheck(res)) { res.status(401).json({ code: 'AUTH_REQUIRED' }); return; }
            res.json(await store.accept(id, !res.locals.legacy));
        } catch { res.status(503).json({ code: 'TERMS_UNAVAILABLE' }); }
        finally { release(); }
    });
    router.use(((error, _req, res, next) => {
        if (['entity.too.large', 'entity.parse.failed', 'encoding.unsupported'].includes(error?.type)) {
            res.status(error.type === 'entity.too.large' ? 413 : 400).json({ code: 'INVALID_REQUEST' }); return;
        }
        next(error);
    }) as express.ErrorRequestHandler);
    return router;
}
