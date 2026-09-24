import express, { type RequestHandler, type ErrorRequestHandler } from 'express';
import { RankedAuth, isRankedUserId } from './RankedAuth';
import { AccountWriteGate, completeAccountDeletion, DeletionError, deletionTicketHash, type AccountDeletionStore } from './AccountDeletion';

type Identity = { id: string; authId: string | null };
async function identity(header: unknown, auth: RankedAuth, store: AccountDeletionStore): Promise<Identity | null> {
    const token = typeof header === 'string' ? /^Bearer ([-\w.]{1,8192})$/i.exec(header)?.[1] : undefined;
    if (!token) return null;
    const proof = auth.verifySession(token);
    if (proof) return { id: proof.userId, authId: null };
    const id = /^[-\w]+\.[-\w]+\.[-\w]+$/.test(token) ? await store.verifyUser(token) : null;
    return id && isRankedUserId(id) ? { id, authId: id } : null;
}
export function createAccountDeletionRouter(auth: RankedAuth, store: AccountDeletionStore, gate: AccountWriteGate,
    isBusy: (id: string) => boolean, disconnect: (id: string) => void) {
    const router = express.Router();
    const attempts = new Map<string, { count: number; until: number }>();
    const running = new Set<string>();
    const limit: RequestHandler = (req, res, next) => {
        res.setHeader('Cache-Control', 'no-store'); res.setHeader('Vary', 'Authorization');
        const now = Date.now(); for (const [key, entry] of attempts) if (entry.until <= now) attempts.delete(key);
        const key = req.socket.remoteAddress ?? 'unknown';
        const entry = attempts.get(key) ?? { count: 0, until: now + 60000 };
        if (attempts.size >= 2000 || entry.count >= 60) { res.setHeader('Retry-After', '60'); res.status(429).json({ code: 'TRY_LATER' }); return; }
        entry.count++; attempts.set(key, entry); next();
    };
    const body: RequestHandler = (req, res, next) => {
        if (Object.keys(req.query).length || !req.is('application/json')) { res.status(400).json({ code: 'INVALID_REQUEST' }); return; } next();
    };
    const fail = (error: unknown, res: express.Response) => {
        const code = error instanceof DeletionError ? error.code : 'UNAVAILABLE';
        res.status(code === 'AUTH_REQUIRED' ? 401 : code === 'ACCOUNT_BUSY' ? 409 : code === 'INVALID_REQUEST' ? 400 : 503).json({ code });
    };
    router.get('/account/deletion/capabilities', limit, async (_req, res) => res.json({ available: await store.ready() }));
    router.post('/account/deletion', limit, body, express.json({ limit: '1kb', inflate: false }), async (req, res) => {
        let reservedId: string | undefined;
        try {
            if (!req.body || Array.isArray(req.body) || Object.keys(req.body).sort().join(',') !== 'confirmation,ticket'
                || req.body.confirmation !== 'DELETE') throw new DeletionError('INVALID_REQUEST');
            const hash = deletionTicketHash(req.body.ticket); if (!hash) throw new DeletionError('INVALID_REQUEST');
            const actor = await identity(req.headers.authorization, auth, store); if (!actor) throw new DeletionError('AUTH_REQUIRED');
            if (!await store.ready()) throw new DeletionError('UNAVAILABLE');
            gate.reserve(actor.id, isBusy(actor.id)); reservedId = actor.id;
            await store.begin(actor.id, hash, actor.authId);
            // Durable intent now exists. Revoke every device proof, not just this browser.
            reservedId = undefined; auth.revokeUserSessions(actor.id); disconnect(actor.id);
            res.status(202).json({ phase: 'pending' });
        } catch (error) {
            if (reservedId) {
                // A timeout may mean the DB committed but the response was lost.
                // Only reopen writes when the durable store confirms no intent.
                let blocked = true;
                try { blocked = await store.blocked(reservedId); } catch { /* Keep the barrier closed. */ }
                if (!blocked) gate.release(reservedId);
                else { auth.revokeUserSessions(reservedId); try { disconnect(reservedId); } catch { /* Retry completes cleanup. */ } }
            }
            fail(error, res);
        }
    });
    router.post('/account/deletion/complete', limit, body, express.json({ limit: '1kb', inflate: false }), async (req, res) => {
        const ticket = /^Bearer (delete_[a-f0-9]{64})$/.exec(req.headers.authorization ?? '')?.[1];
        const hash = deletionTicketHash(ticket);
        if (!hash) { res.status(401).json({ code: 'AUTH_REQUIRED' }); return; }
        if (!req.body || Object.keys(req.body).join(',') !== 'confirmation' || req.body.confirmation !== 'DELETE') { res.status(400).json({ code: 'INVALID_REQUEST' }); return; }
        if (running.has(hash)) { res.status(202).json({ phase: 'pending' }); return; }
        running.add(hash);
        let deletedId: string | undefined;
        try {
            const phase = await completeAccountDeletion(store, hash, id => {
                gate.reserve(id, isBusy(id)); deletedId = id; auth.revokeUserSessions(id); disconnect(id);
            });
            if (phase === 'completed' && deletedId) gate.release(deletedId);
            res.status(phase === 'completed' ? 200 : 202).json({ phase });
        } catch (error) { fail(error, res); }
        finally { running.delete(hash); }
    });
    const malformed: ErrorRequestHandler = (error, _req, res, next) => {
        if (['entity.too.large', 'entity.parse.failed', 'encoding.unsupported'].includes(error?.type)) { res.status(400).json({ code: 'INVALID_REQUEST' }); return; } next(error);
    };
    router.use(malformed); return router;
}

/** Mount after deletion routes, before avatar/history/native-reward routes. */
export function accountRequestGuard(auth: RankedAuth, store: AccountDeletionStore, gate: AccountWriteGate): RequestHandler {
    return async (req, res, next) => {
        if (!req.headers.authorization || !['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) { next(); return; }
        try {
            const actor = await identity(req.headers.authorization, auth, store);
            if (!actor) { next(); return; } // The owning router still performs full authentication.
            if (gate.blocked(actor.id) || await store.blocked(actor.id)) { res.status(423).json({ code: 'ACCOUNT_DELETING' }); return; }
            const release = gate.enter(actor.id);
            if (!release) { res.status(423).json({ code: 'ACCOUNT_DELETING' }); return; }
            res.once('finish', release); res.once('close', release); next();
        } catch { res.status(503).json({ code: 'UNAVAILABLE' }); }
    };
}
