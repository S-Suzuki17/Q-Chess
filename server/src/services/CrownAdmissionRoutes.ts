import express, { type ErrorRequestHandler } from 'express';
import { AccountWriteGate } from './AccountDeletion';
import { isRankedUserId, type RankedSessionAuthority } from './RankedAuth';
import type { CrownAdmissionStore } from './CrownAdmissionStore';
import { CrownAdmissionError, crownAdmissionEnabled, crownRankKey } from '../protocol/CrownAdmission';

export function createCrownAdmissionRouter(auth: RankedSessionAuthority, store: CrownAdmissionStore,
    verifyUser: (token: string) => Promise<string | null>, gate: AccountWriteGate,
    enabled = crownAdmissionEnabled, rankKeyForStage = crownRankKey) {
    const router = express.Router();
    const attempts = new Map<string, { until: number; count: number }>();
    router.post('/crown/first-attempt', (req, res, next) => {
        res.setHeader('Cache-Control', 'no-store'); res.setHeader('Vary', 'Authorization');
        if (!enabled()) { res.status(503).json({ code: 'FEATURE_DISABLED' }); return; }
        const now = Date.now(), key = req.socket.remoteAddress ?? 'unknown';
        for (const [id, entry] of attempts) if (entry.until <= now) attempts.delete(id);
        const entry = attempts.get(key) ?? { until: now + 60000, count: 0 };
        if (entry.count >= 120 || (!attempts.has(key) && attempts.size >= 10000)) {
            res.status(429).json({ code: 'TRY_LATER' }); return;
        }
        entry.count++; attempts.set(key, entry);
        if (!req.is('application/json')) { res.status(415).json({ code: 'JSON_REQUIRED' }); return; }
        next();
    }, express.json({ limit: '1kb', inflate: false }), async (req, res) => {
        let release: (() => void) | null = null;
        const controller = new AbortController();
        req.once('aborted', () => controller.abort());
        res.once('close', () => { if (!res.writableEnded) controller.abort(); });
        try {
            const body = req.body;
            if (Object.keys(req.query).length || !body || typeof body !== 'object' || Array.isArray(body)
                || Object.keys(body).length !== 1 || !Object.hasOwn(body, 'stageId')) throw new CrownAdmissionError('INVALID_REQUEST');
            const rankKey = rankKeyForStage(body.stageId);
            if (!rankKey) throw new CrownAdmissionError('INVALID_REQUEST');
            const token = /^Bearer ([-\w.]{1,8192})$/i.exec(req.headers.authorization ?? '')?.[1];
            const legacy = await auth.verifySession(token);
            const userId = legacy?.userId ?? (token ? await verifyUser(token) : null);
            if (!userId || !isRankedUserId(userId)) throw new CrownAdmissionError('AUTH_REQUIRED');
            release = gate.enter(userId);
            if (!release) throw new CrownAdmissionError('ACCOUNT_UNAVAILABLE');
            const check = async () => {
                controller.signal.throwIfAborted();
                if (gate.blocked(userId)) throw new CrownAdmissionError('ACCOUNT_UNAVAILABLE');
                if (legacy ? !(await auth.verifySession(token, userId)) : !token || await verifyUser(token) !== userId) {
                    throw new CrownAdmissionError('AUTH_REQUIRED');
                }
                controller.signal.throwIfAborted();
            };
            await check();
            const result = await store.authorize(userId, rankKey, controller.signal);
            // The durable authorization survives a lost response; a revoked request
            // cannot activate a game with it. A fresh valid request can retrieve it.
            await check();
            res.json(result);
        } catch (error) {
            if (res.destroyed) return;
            const code = error instanceof CrownAdmissionError ? error.code : 'CROWN_UNAVAILABLE';
            res.status(code === 'AUTH_REQUIRED' ? 401 : code === 'ACCOUNT_UNAVAILABLE' ? 403 : code === 'INVALID_REQUEST' ? 400 : 503).json({ code });
        } finally { release?.(); }
    });
    const malformed: ErrorRequestHandler = (error, _req, res, next) => {
        if (['entity.too.large','entity.parse.failed','encoding.unsupported'].includes(error?.type)) {
            res.status(error.type === 'entity.too.large' ? 413 : 400).json({ code: 'INVALID_REQUEST' }); return;
        }
        next(error);
    };
    router.use(malformed); return router;
}
