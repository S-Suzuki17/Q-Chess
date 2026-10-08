import express, { type ErrorRequestHandler, type RequestHandler } from 'express';
import type { RankedSessionAuthority } from './RankedAuth';
import { isRankedUserId } from './RankedAuth';
import { AccountWriteGate } from './AccountDeletion';
import type { MatchHintService } from './MatchHintService';
import { MatchHintError, isHintRevision, isHintUuid, type HintRequestContext } from './MatchHintTypes';
import { cpuHintTicketsEnabled } from './TicketFeatureGates';

export interface MatchHintRouteOptions {
    service: MatchHintService | (() => MatchHintService);
    verifyUser(token: string): Promise<string | null>;
    accountGate: AccountWriteGate;
    /** Validates the current socket's proof and returns its connection fence. */
    connection(userId: string, token: string): string;
    enabled?: () => boolean;
}
export function createMatchHintRouter(auth: RankedSessionAuthority, options: MatchHintRouteOptions) {
    const router = express.Router(), gate = options.accountGate;
    const service = () => typeof options.service === 'function' ? options.service() : options.service;
    const attempts = new Map<string, { until: number; count: number }>();
    const allow = (key: string, cap: number) => {
        const now = Date.now();
        for (const [id, entry] of attempts) if (entry.until <= now) attempts.delete(id);
        const entry = attempts.get(key) ?? { until: now + 60000, count: 0 };
        if (entry.count >= cap || (!attempts.has(key) && attempts.size >= 10000)) return false;
        entry.count++; attempts.set(key, entry); return true;
    };
    const authenticate = (purchase: boolean): RequestHandler => async (req, res, next) => {
        res.setHeader('Cache-Control', 'no-store'); res.setHeader('Vary', 'Authorization');
        if (purchase && !(options.enabled ?? cpuHintTicketsEnabled)()) { res.status(503).json({ code: 'FEATURE_DISABLED' }); return; }
        if (!allow('ip:' + (req.socket.remoteAddress ?? 'unknown'), 240)) { res.status(429).json({ code: 'TRY_LATER' }); return; }
        if (Object.keys(req.query).length) { res.status(400).json({ code: 'INVALID_REQUEST' }); return; }
        const token = /^Bearer ([-\w.]{1,8192})$/i.exec(req.headers.authorization ?? '')?.[1];
        try {
            const legacy = await auth.verifySession(token);
            const userId = legacy?.userId ?? (token ? await options.verifyUser(token) : null);
            if (!userId || !isRankedUserId(userId)) throw new MatchHintError('AUTH_REQUIRED');
            if (!allow('user:' + userId, 90)) { res.status(429).json({ code: 'TRY_LATER' }); return; }
            const controller = new AbortController();
            const abort = () => controller.abort(new MatchHintError('CANCELLED'));
            req.once('aborted', abort); res.once('close', () => { if (!res.writableEnded) abort(); });
            const connectionId = purchase ? options.connection(userId, token!) : undefined;
            const context: HintRequestContext = { signal: controller.signal, connectionId, async check() {
                controller.signal.throwIfAborted();
                if (gate.blocked(userId)) throw new MatchHintError('ACCOUNT_UNAVAILABLE');
                if (legacy ? !await auth.verifySession(token, userId) : !token || await options.verifyUser(token) !== userId) {
                    throw new MatchHintError('AUTH_REQUIRED');
                }
                if (purchase && options.connection(userId, token!) !== connectionId) throw new MatchHintError('RECONNECT_REQUIRED');
                controller.signal.throwIfAborted();
            } };
            await context.check(); res.locals.hintUser = userId; res.locals.hintContext = context; next();
        } catch (error) { if (!res.destroyed) respondError(res, error); }
    };
    const json: RequestHandler = (req, res, next) => {
        if (!req.is('application/json')) { res.status(415).json({ code: 'JSON_REQUIRED' }); return; } next();
    };
    const action = (purchase: boolean): RequestHandler => async (req, res) => {
        const body = purchase ? req.body : {};
        if (!body || typeof body !== 'object' || Array.isArray(body)
            || Object.keys(body).some(key => !['requestId', 'revision'].includes(key))) {
            res.status(400).json({ code: 'INVALID_REQUEST' }); return;
        }
        const requestId = purchase ? body.requestId : String(req.params.requestId);
        const revision = purchase ? body.revision : /^(0|[1-9][0-9]{0,9})$/.test(String(req.params.revision)) ? Number(req.params.revision) : NaN;
        if (!isHintUuid(requestId) || !isHintRevision(revision)) { res.status(400).json({ code: 'INVALID_REQUEST' }); return; }
        const referenceId = String(purchase ? req.params.matchId : req.params.contextId);
        if ((purchase && (!referenceId || referenceId.length > 128)) || (!purchase && !isHintUuid(referenceId))) {
            res.status(400).json({ code: 'INVALID_REQUEST' }); return;
        }
        const userId: string = res.locals.hintUser, context: HintRequestContext = res.locals.hintContext;
        const release = gate.enter(userId);
        if (!release) { res.status(423).json({ code: 'ACCOUNT_UNAVAILABLE' }); return; }
        try {
            const result = purchase ? await service().requestHint(userId, referenceId, revision, requestId, context)
                : await service().receipt(userId, referenceId, revision, requestId, context);
            await context.check();
            if (!res.destroyed) res.json(result);
        } catch (error) { if (!res.destroyed) respondError(res, error); }
        finally { release(); }
    };
    router.post('/match-hints/:matchId', authenticate(true), json, express.json({ limit: '2kb', inflate: false }), action(true));
    router.get('/match-hints/:contextId/:revision/:requestId', authenticate(false), action(false));
    const malformed: ErrorRequestHandler = (error, _req, res, next) => {
        if (['entity.too.large', 'entity.parse.failed', 'encoding.unsupported'].includes(error?.type)) {
            res.status(error.type === 'entity.too.large' ? 413 : 400).json({ code: 'INVALID_REQUEST' }); return;
        }
        next(error);
    };
    router.use(malformed); return router;
}
const errors = new Set(['AUTH_REQUIRED', 'ACCOUNT_UNAVAILABLE', 'TERMS_REQUIRED', 'INVALID_REQUEST', 'REQUEST_MISMATCH',
    'NOT_A_PARTICIPANT', 'RECONNECT_REQUIRED', 'MATCH_AUTHORITY_UNAVAILABLE', 'STALE_REVISION', 'SESSION_FINISHED',
    'MATCH_PREPARING', 'NOT_YOUR_TURN', 'HINT_PURCHASE_PENDING', 'HINT_RECOVERY_PENDING', 'HINT_CONTEXT_EXPIRED',
    'INSUFFICIENT_FUNDS', 'NO_LEGAL_HINT', 'FEATURE_DISABLED', 'HINT_STORE_UNAVAILABLE', 'SEARCH_BUSY', 'SEARCH_FAILED',
    'SEARCH_TIMEOUT', 'SEARCH_CLOCK_EXPIRED', 'CANCELLED']);
function respondError(res: express.Response, error: unknown) {
    const raw = error instanceof Error ? ((error as Error & { code?: string }).code ?? error.message) : null;
    const code = raw && errors.has(raw) ? raw : 'HINT_STORE_UNAVAILABLE';
    const status = code === 'AUTH_REQUIRED' ? 401 : code === 'INSUFFICIENT_FUNDS' ? 402
        : ['NOT_A_PARTICIPANT', 'ACCOUNT_UNAVAILABLE', 'TERMS_REQUIRED'].includes(code) ? 403
        : ['STALE_REVISION', 'REQUEST_MISMATCH', 'HINT_PURCHASE_PENDING', 'HINT_CONTEXT_EXPIRED'].includes(code) ? 409
        : code === 'INVALID_REQUEST' ? 400
        : ['NOT_YOUR_TURN', 'SESSION_FINISHED', 'NO_LEGAL_HINT'].includes(code) ? 422 : 503;
    res.status(status).json({ code });
}
