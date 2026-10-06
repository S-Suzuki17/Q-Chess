import express, { type ErrorRequestHandler, type RequestHandler } from 'express';
import { type RankedSessionAuthority, isRankedUserId } from './RankedAuth';
import { AccountWriteGate } from './AccountDeletion';
import { CpuPracticeService, CpuPracticeError, type PracticeContext } from './CpuPracticeService';
import { cpuHintTicketsEnabled } from './TicketFeatureGates';

export function createCpuPracticeRouter(auth: RankedSessionAuthority, service: CpuPracticeService|(()=>CpuPracticeService),
    verifyUser: (token: string) => Promise<string | null>, gate: AccountWriteGate,
    matchBusy: (userId: string) => boolean, enabled = cpuHintTicketsEnabled) {
    const router = express.Router();
    const practice=()=>typeof service==='function'?service():service;
    const attempts = new Map<string, { until: number; count: number }>();
    const allow = (key: string, cap: number) => {
        const now = Date.now();
        for (const [id, entry] of attempts) if (entry.until <= now) attempts.delete(id);
        const entry = attempts.get(key) ?? { until: now + 60_000, count: 0 };
        if (entry.count >= cap || (!attempts.has(key) && attempts.size >= 10000)) return false;
        entry.count++; attempts.set(key, entry); return true;
    };
    const authenticate: RequestHandler = async (req, res, next) => {
        res.setHeader('Cache-Control', 'no-store'); res.setHeader('Vary', 'Authorization');
        if (!enabled()) { res.status(503).json({ code: 'FEATURE_DISABLED' }); return; }
        if (!allow('ip:' + (req.socket.remoteAddress ?? 'unknown'), 240)) {
            res.status(429).json({ code: 'TRY_LATER' }); return;
        }
        const token = /^Bearer ([-\w.]{1,8192})$/i.exec(req.headers.authorization ?? '')?.[1];
        try {
            const legacy = await auth.verifySession(token);
            const userId = legacy?.userId ?? (token ? await verifyUser(token) : null);
            if (!userId || !isRankedUserId(userId)) { res.status(401).json({ code: 'AUTH_REQUIRED' }); return; }
            if (!allow('user:' + userId, 90)) { res.status(429).json({ code: 'TRY_LATER' }); return; }
            if (Object.keys(req.query).length) { res.status(400).json({ code: 'INVALID_REQUEST' }); return; }
            const controller = new AbortController();
            const abort = () => controller.abort(new CpuPracticeError('CANCELLED'));
            req.once('aborted', abort);
            res.once('close', () => { if (!res.writableEnded) abort(); });
            const context: PracticeContext = { signal: controller.signal, async check() {
                if (gate.blocked(userId)) throw new CpuPracticeError('ACCOUNT_UNAVAILABLE');
                if (matchBusy(userId)) throw new CpuPracticeError('HINT_UNAVAILABLE_IN_MATCH');
                if (legacy ? !(await auth.verifySession(token, userId)) : !token || await verifyUser(token) !== userId) {
                    throw new CpuPracticeError('AUTH_REQUIRED');
                }
            } };
            await context.check(); res.locals.practiceUser = userId; res.locals.practiceContext = context; next();
        } catch (error) { respondError(res, error); }
    };
    const json: RequestHandler = (req, res, next) => {
        if (!req.is('application/json')) { res.status(415).json({ code: 'JSON_REQUIRED' }); return; } next();
    };
    const action = (run: (body: any, userId: string, context: PracticeContext, req: express.Request) => Promise<unknown>, keys: string[]): RequestHandler =>
        async (req, res) => {
            const body = req.method === 'GET' ? {} : req.body;
            if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !keys.includes(key))) {
                res.status(400).json({ code: 'INVALID_REQUEST' }); return;
            }
            const release = gate.enter(res.locals.practiceUser);
            if (!release) { res.status(423).json({ code: 'ACCOUNT_UNAVAILABLE' }); return; }
            try { const result = await run(body, res.locals.practiceUser, res.locals.practiceContext, req);
                if (!res.destroyed) res.json(result); }
            catch (error) { if (!res.destroyed) respondError(res, error); }
            finally { release(); }
        };
    const parser = express.json({ limit: '2kb', inflate: false });
    router.post('/cpu-practice/sessions', authenticate, json, parser,
        action((b,u,c) => practice().open(u,b.sessionId,b.playerSide,b.level,b.seconds,c), ['sessionId','playerSide','level','seconds']));
    router.get('/cpu-practice/sessions/:sessionId', authenticate,
        action((_b,u,c,r) => practice().read(u,String(r.params.sessionId),c), []));
    router.post('/cpu-practice/sessions/:sessionId/moves', authenticate, json, parser,
        action((b,u,c,r) => practice().advance(u,String(r.params.sessionId),b.revision,b.operationId,b.actor,b.move,c),
            ['revision','operationId','actor','move']));
    router.post('/cpu-practice/sessions/:sessionId/close', authenticate, json, parser,
        action((_b,u,c,r) => practice().close(u,String(r.params.sessionId),c), []));
    router.post('/cpu-practice/sessions/:sessionId/hints', authenticate, json, parser,
        action((b,u,c,r) => practice().requestHint(b.requestId,u,String(r.params.sessionId),b.revision,c), ['requestId','revision']));
    router.get('/cpu-practice/sessions/:sessionId/hints/:revision/:requestId', authenticate,
        action((_b,u,c,r) => practice().receipt(u,String(r.params.sessionId),Number(r.params.revision),String(r.params.requestId),c), []));
    const malformed: ErrorRequestHandler = (error, _req, res, next) => {
        if (['entity.too.large','entity.parse.failed','encoding.unsupported'].includes(error?.type)) {
            res.status(error.type === 'entity.too.large' ? 413 : 400).json({ code: 'INVALID_REQUEST' }); return;
        } next(error);
    };
    router.use(malformed); return router;
}
function respondError(res: express.Response, error: unknown) {
    const code = error instanceof CpuPracticeError ? error.code
        : error instanceof Error && ['SEARCH_BUSY','SEARCH_FAILED','SEARCH_TIMEOUT'].includes(error.message) ? error.message : 'CPU_PRACTICE_UNAVAILABLE';
    const status = code === 'AUTH_REQUIRED' ? 401 : code === 'INSUFFICIENT_FUNDS' ? 402
        : ['SESSION_NOT_FOUND','ACCOUNT_UNAVAILABLE','HINT_UNAVAILABLE_IN_MATCH'].includes(code) ? 403
        : ['STALE_REVISION','REQUEST_MISMATCH'].includes(code) ? 409
        : ['INVALID_REQUEST','INVALID_MOVE','NOT_YOUR_TURN','SESSION_FINISHED','NO_LEGAL_HINT'].includes(code) ? 422 : 503;
    res.status(status).json({ code });
}
