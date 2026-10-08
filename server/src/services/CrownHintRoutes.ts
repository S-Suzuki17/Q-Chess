import express, { type ErrorRequestHandler, type RequestHandler } from 'express';
import { AccountWriteGate } from './AccountDeletion';
import { isRankedUserId, type RankedSessionAuthority } from './RankedAuth';
import { CrownHintError, CrownHintRegistry, isCrownId } from './CrownHintRegistry';

export type CrownHintRequestContext = { signal: AbortSignal; check(): Promise<void> };
export interface CrownHintRouteOptions {
    registry: CrownHintRegistry;
    verifyUser(token: string): Promise<string | null>;
    accountGate: AccountWriteGate;
    enabled(): boolean;
    accountBusy?: (userId: string) => boolean;
    requestHint(userId: string, runId: string, revision: number, requestId: string, context: CrownHintRequestContext): Promise<unknown>;
    readReceipt(userId: string, contextId: string, revision: number, requestId: string, context: CrownHintRequestContext): Promise<unknown>;
}
/** The existing legacy Campaign entry remains unchanged. This router creates a
 * hint context only: it grants no stage progress, admission or ad reward and
 * never reauthorizes/consumes a Crown first-attempt grant. */
export function createCrownHintRouter(auth: RankedSessionAuthority, options: CrownHintRouteOptions) {
    const router = express.Router(), { registry, accountGate: gate } = options;
    const attempts = new Map<string, { until: number; count: number }>();
    const allow = (key: string, cap: number) => {
        const now = Date.now();
        for (const [id, entry] of attempts) if (entry.until <= now) attempts.delete(id);
        const entry = attempts.get(key) ?? { until: now + 60_000, count: 0 };
        if (entry.count >= cap || (!attempts.has(key) && attempts.size >= 10_000)) return false;
        entry.count++; attempts.set(key, entry); return true;
    };
    const authenticate = (gated: boolean, recovery = false): RequestHandler => async (req, res, next) => {
        res.setHeader('Cache-Control', 'no-store'); res.setHeader('Vary', 'Authorization');
        if (gated && !options.enabled()) { res.status(503).json({ code: 'FEATURE_DISABLED' }); return; }
        if (!allow('ip:' + (req.socket.remoteAddress ?? 'unknown'), 240)) {
            res.status(429).json({ code: 'TRY_LATER' }); return;
        }
        if (Object.keys(req.query).length) { res.status(400).json({ code: 'INVALID_REQUEST' }); return; }
        const token = /^Bearer ([-\w.]{1,8192})$/i.exec(req.headers.authorization ?? '')?.[1];
        try {
            const legacy = await auth.verifySession(token);
            const userId = legacy?.userId ?? (token ? await options.verifyUser(token) : null);
            if (!userId || !isRankedUserId(userId)) throw new CrownHintError('AUTH_REQUIRED');
            if (!allow('user:' + userId, 90)) { res.status(429).json({ code: 'TRY_LATER' }); return; }
            const controller = new AbortController();
            const abort = () => controller.abort(new CrownHintError('CANCELLED'));
            req.once('aborted', abort);
            res.once('close', () => { if (!res.writableEnded) abort(); });
            const context: CrownHintRequestContext = { signal: controller.signal, async check() {
                controller.signal.throwIfAborted();
                if (gate.blocked(userId)) throw new CrownHintError('ACCOUNT_UNAVAILABLE');
                if (!recovery && options.accountBusy?.(userId)) throw new CrownHintError('ACCOUNT_BUSY');
                if (legacy ? !(await auth.verifySession(token, userId)) : !token || await options.verifyUser(token) !== userId) {
                    throw new CrownHintError('AUTH_REQUIRED');
                }
                controller.signal.throwIfAborted();
            } };
            await context.check();
            res.locals.crownUser = userId; res.locals.crownContext = context; next();
        } catch (error) { if (!res.destroyed) respondError(res, error); }
    };
    const json: RequestHandler = (req, res, next) => {
        if (!req.is('application/json')) { res.status(415).json({ code: 'JSON_REQUIRED' }); return; } next();
    };
    const action = (keys: readonly string[], run: (body: any, userId: string, context: CrownHintRequestContext,
        req: express.Request) => Promise<unknown> | unknown): RequestHandler => async (req, res) => {
        const body = req.method === 'GET' ? {} : req.body;
        if (!body || typeof body !== 'object' || Array.isArray(body)
            || Object.keys(body).some(key => !keys.includes(key))) {
            res.status(400).json({ code: 'INVALID_REQUEST' }); return;
        }
        const release = gate.enter(res.locals.crownUser);
        if (!release) { res.status(423).json({ code: 'ACCOUNT_UNAVAILABLE' }); return; }
        try {
            const context: CrownHintRequestContext = res.locals.crownContext;
            await context.check();
            const result = await run(body, res.locals.crownUser, context, req);
            await context.check();
            if (!res.destroyed) res.json(result);
        } catch (error) { if (!res.destroyed) respondError(res, error); }
        finally { release(); }
    };
    const params = (req: express.Request) => {
        const runId = String(req.params.runId);
        if (!isCrownId(runId)) throw new CrownHintError('INVALID_REQUEST');
        return runId.toLowerCase();
    };
    const hintIds = (revision: unknown, requestId: unknown) => {
        if (!Number.isSafeInteger(revision) || (revision as number) < 0 || !isCrownId(requestId)) {
            throw new CrownHintError('INVALID_REQUEST');
        }
        return { revision: revision as number, requestId: requestId.toLowerCase() };
    };
    const parser = express.json({ limit: '2kb', inflate: false });
    router.post('/crown-hints/runs', authenticate(true), json, parser,
        action(['runId', 'stageId', 'playerSide'], (b, u) => registry.open(u, b.runId, b.stageId, b.playerSide)));
    router.get('/crown-hints/runs/:runId', authenticate(false),
        action([], (_b, u, _c, r) => registry.read(u, params(r))));
    router.post('/crown-hints/runs/:runId/moves', authenticate(true), json, parser,
        action(['operationId', 'revision', 'move', 'actor'], (b, u, _c, r) =>
            registry.advance(u, params(r), b.revision, b.operationId, b.actor, b.move)));
    router.post('/crown-hints/runs/:runId/close', authenticate(true), json, parser,
        action([], (_b, u, _c, r) => registry.close(u, params(r))));
    router.post('/crown-hints/runs/:runId/hints', authenticate(true), json, parser,
        action(['requestId', 'revision'], (b, u, c, r) => {
            const ids = hintIds(b.revision, b.requestId);
            return options.requestHint(u, params(r), ids.revision, ids.requestId, c);
        }));
    router.get('/crown-hints/receipts/:contextId/:revision/:requestId', authenticate(false, true),
        action([], (_b, u, c, r) => {
            const contextId = String(r.params.contextId);
            if (!isCrownId(contextId)) throw new CrownHintError('INVALID_REQUEST');
            if (!/^(0|[1-9][0-9]{0,14})$/.test(String(r.params.revision))) throw new CrownHintError('INVALID_REQUEST');
            const ids = hintIds(Number(r.params.revision), String(r.params.requestId));
            // Durable recovery is bound by the ledger to this authenticated user.
            // It does not depend on the process-local registry surviving restart.
            return options.readReceipt(u, contextId.toLowerCase(), ids.revision, ids.requestId, c);
        }));
    const malformed: ErrorRequestHandler = (error, _req, res, next) => {
        if (['entity.too.large', 'entity.parse.failed', 'encoding.unsupported'].includes(error?.type)) {
            res.status(error.type === 'entity.too.large' ? 413 : 400).json({ code: 'INVALID_REQUEST' }); return;
        }
        next(error);
    };
    router.use(malformed); return router;
}
const errorCodes = new Set(['AUTH_REQUIRED', 'ACCOUNT_UNAVAILABLE', 'ACCOUNT_BUSY', 'INVALID_REQUEST', 'INVALID_MOVE',
    'SESSION_NOT_FOUND', 'SESSION_LIMIT', 'REQUEST_MISMATCH', 'STALE_REVISION', 'SESSION_FINISHED', 'NOT_YOUR_TURN',
    'HINT_PURCHASE_PENDING', 'HINT_RECOVERY_PENDING', 'HINT_CONTEXT_EXPIRED', 'HINT_STORE_UNAVAILABLE', 'INSUFFICIENT_FUNDS', 'TERMS_REQUIRED',
    'NO_LEGAL_HINT', 'FEATURE_DISABLED', 'SEARCH_BUSY', 'SEARCH_FAILED', 'SEARCH_TIMEOUT', 'SEARCH_CLOCK_EXPIRED', 'CANCELLED']);
function respondError(res: express.Response, error: unknown) {
    const raw = error instanceof Error ? ((error as Error & { code?: string }).code ?? error.message) : null;
    const code = raw && errorCodes.has(raw) ? raw : 'CROWN_UNAVAILABLE';
    const status = code === 'AUTH_REQUIRED' ? 401 : code === 'INSUFFICIENT_FUNDS' ? 402
        : ['SESSION_NOT_FOUND', 'ACCOUNT_UNAVAILABLE', 'TERMS_REQUIRED'].includes(code) ? 403
        : ['ACCOUNT_BUSY', 'STALE_REVISION', 'REQUEST_MISMATCH', 'HINT_PURCHASE_PENDING', 'HINT_CONTEXT_EXPIRED'].includes(code) ? 409
        : code === 'INVALID_REQUEST' ? 400
        : ['INVALID_MOVE', 'NOT_YOUR_TURN', 'SESSION_FINISHED', 'NO_LEGAL_HINT'].includes(code) ? 422 : 503;
    res.status(status).json({ code });
}
