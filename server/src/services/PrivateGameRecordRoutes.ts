import express, { type RequestHandler, type ErrorRequestHandler } from 'express';
import { RankedAuth, isRankedUserId } from './RankedAuth';
import { parseLocalGameRecord, PRIVATE_RECORD_LIMIT, RECORD_ID_PATTERN } from './PrivateGameRecords';
import type { LocalGameRecord, PrivateGameRecord, PrivateGameStats } from './PrivateGameRecords';

export interface PrivateHistoryStore {
    verifyUser(token: string): Promise<string | null>;
    getPrivateGameRecords(userId: string, limit: number): Promise<PrivateGameRecord[]>;
    getPrivateGameStats(userId: string): Promise<PrivateGameStats>;
    saveLocalGameRecord(userId: string, record: LocalGameRecord): Promise<string>;
}

/** Mount before the global 4 KiB parser; only this authenticated POST accepts 2 MiB. */
export function createPrivateGameRecordRouter(auth: RankedAuth, store: PrivateHistoryStore) {
    const router = express.Router();
    const attempts = new Map<string, { count: number; until: number }>();
    const allow = (key: string, maximum: number) => {
        const now = Date.now();
        for (const [id, entry] of attempts) if (entry.until <= now) attempts.delete(id);
        const current = attempts.get(key) ?? { count: 0, until: now + 60_000 };
        if (attempts.size >= 10_000 || current.count >= maximum) return false;
        current.count += 1; attempts.set(key, current); return true;
    };
    const authenticate: RequestHandler = async (req, res, next) => {
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('Vary', 'Authorization');
        if (!allow(`ip:${req.socket.remoteAddress ?? 'unknown'}`, 240)) {
            res.setHeader('Retry-After', '60'); res.status(429).json({ code: 'TRY_LATER' }); return;
        }
        const header = req.headers.authorization;
        const token = typeof header === 'string' ? /^Bearer ([-\w.]{1,8192})$/i.exec(header)?.[1] : undefined;
        const proof = auth.verifySession(token);
        let userId = proof?.userId;
        try {
            if (!userId && token && /^[-\w]+\.[-\w]+\.[-\w]+$/.test(token)) userId = await store.verifyUser(token) ?? undefined;
        } catch { /* Failed identity checks never authorize private history. */ }
        if (!userId || !isRankedUserId(userId)) { res.status(401).json({ code: 'AUTH_REQUIRED' }); return; }
        if (!allow(`user:${userId}:${req.method === 'POST' ? 'write' : 'read'}`, req.method === 'POST' ? 12 : 120)) {
            res.setHeader('Retry-After', '60'); res.status(429).json({ code: 'TRY_LATER' }); return;
        }
        res.locals.historyUserId = userId;
        next();
    };
    const safe = (handler: RequestHandler): RequestHandler => async (req, res, next) => {
        try { await handler(req, res, next); }
        catch { console.warn('[History] Private history request failed'); res.status(503).json({ code: 'HISTORY_UNAVAILABLE' }); }
    };
    const ownRecords = async (userId: string, limit: number) => (await store.getPrivateGameRecords(userId, limit))
        .filter(record => record.white_id === userId || record.black_id === userId).slice(0, Math.min(limit, PRIVATE_RECORD_LIMIT));

    router.get('/game-records', authenticate, safe(async (req, res) => {
        if (Object.keys(req.query).some(key => key !== 'limit')) { res.status(400).json({ code: 'INVALID_QUERY' }); return; }
        const raw = req.query.limit;
        if (raw !== undefined && (typeof raw !== 'string' || !/^\d{1,6}$/.test(raw) || Number(raw) < 1)) {
            res.status(400).json({ code: 'INVALID_QUERY' }); return;
        }
        const limit = Math.min(raw === undefined ? PRIVATE_RECORD_LIMIT : Number(raw), PRIVATE_RECORD_LIMIT);
        res.json({ records: await ownRecords(res.locals.historyUserId, limit) });
    }));
    router.get('/game-records/:id', authenticate, safe(async (req, res) => {
        if (Object.keys(req.query).length || typeof req.params.id !== 'string' || !RECORD_ID_PATTERN.test(req.params.id)) {
            res.status(404).json({ code: 'RECORD_NOT_FOUND' }); return;
        }
        // Search the authorized latest-ten set, never the global ID index.
        const record = (await ownRecords(res.locals.historyUserId, PRIVATE_RECORD_LIMIT)).find(record => record.id === req.params.id.toString().toLowerCase());
        if (!record) { res.status(404).json({ code: 'RECORD_NOT_FOUND' }); return; }
        res.json({ record });
    }));
    router.get('/game-stats', authenticate, safe(async (req, res) => {
        if (Object.keys(req.query).length) { res.status(400).json({ code: 'INVALID_QUERY' }); return; }
        res.json({ stats: await store.getPrivateGameStats(res.locals.historyUserId) });
    }));
    router.post('/game-records', authenticate, (req, res, next) => {
        if (!req.is('application/json')) { res.status(415).json({ code: 'JSON_REQUIRED' }); return; }
        next();
    }, express.json({ limit: '2mb', inflate: false }), safe(async (req, res) => {
        if (Object.keys(req.query).length) { res.status(400).json({ code: 'INVALID_QUERY' }); return; }
        const record = parseLocalGameRecord(req.body, res.locals.historyUserId);
        if (!record) { res.status(400).json({ code: 'INVALID_LOCAL_RECORD' }); return; }
        const id = await store.saveLocalGameRecord(res.locals.historyUserId, record);
        res.json({ id });
    }));
    const malformedBody: ErrorRequestHandler = (error, _req, res, next) => {
        if (['entity.too.large', 'entity.parse.failed', 'encoding.unsupported'].includes(error?.type)) {
            res.status(error.type === 'entity.too.large' ? 413 : error.type === 'encoding.unsupported' ? 415 : 400)
                .json({ code: error.type === 'entity.too.large' ? 'RECORD_TOO_LARGE' : 'INVALID_BODY' }); return;
        }
        next(error);
    };
    router.use(malformedBody);
    return router;
}
