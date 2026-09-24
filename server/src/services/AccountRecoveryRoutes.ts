import express, { type ErrorRequestHandler } from 'express';
import { createHash } from 'node:crypto';
import { RankedAuth, isRankedUserId } from './RankedAuth';
import { AccountWriteGate } from './AccountDeletion';
import { RecoveryChallenges, RecoveryError, recoveryEmail, recoveryPassword, type RecoveryStore } from './AccountRecovery';

export function createAccountRecoveryRouter(auth: RankedAuth, store: RecoveryStore, gate: AccountWriteGate,
    busy: (id: string) => boolean, disconnect: (id: string) => void, enabled = false) {
    const router = express.Router(), challenges = new RecoveryChallenges();
    const attempts = new Map<string, { count: number; until: number }>(), active = new Set<string>();
    router.use(['/account/recovery', '/auth/recovery'], (req, res, next) => {
        res.setHeader('Cache-Control', 'no-store'); res.setHeader('Vary', 'Authorization');
        const now = Date.now(); for (const [key, item] of attempts) if (item.until <= now) attempts.delete(key);
        const key = req.socket.remoteAddress ?? 'unknown', item = attempts.get(key) ?? { count: 0, until: now + 60000 };
        if (item.count++ >= 30 || attempts.size >= 2000) { res.setHeader('Retry-After', '60'); res.status(429).json({ code: 'TRY_LATER' }); return; }
        attempts.set(key, item); next();
    });
    router.get('/account/recovery/capabilities', async (_req, res) => res.json({ available: enabled && await store.ready() }));
    router.use(['/account/recovery', '/auth/recovery'], (req, res, next) => {
        if (!enabled) { res.status(503).json({ code: 'UNAVAILABLE' }); return; }
        if (req.method !== 'POST' || !req.is('application/json') || Object.keys(req.query).length) { res.status(400).json({ code: 'INVALID_REQUEST' }); return; }
        next();
    }, express.json({ limit: '3kb', inflate: false }));
    const fail = (res: express.Response, error: unknown) => {
        const code = error instanceof RecoveryError ? error.code : 'UNAVAILABLE';
        res.status(code === 'AUTH_REQUIRED' ? 401 : code === 'ACCOUNT_BUSY' ? 409 : code === 'TRY_LATER' ? 429 : code === 'UNAVAILABLE' ? 503 : 400).json({ code });
    };
    router.post(['/account/recovery/start', '/auth/recovery/start'], async (req, res) => {
        let release: (() => void) | undefined;
        try {
            const enroll = req.path === '/account/recovery/start';
            const { userId, email: rawEmail, password } = req.body ?? {}, email = recoveryEmail(rawEmail);
            if (!isRankedUserId(userId) || !email || Object.keys(req.body).sort().join(',') !== (enroll ? 'email,password,userId' : 'email,userId')) throw new RecoveryError('INVALID_REQUEST');
            const emailKey = 'email:' + createHash('sha256').update(email).digest('hex');
            const quota = attempts.get(emailKey) ?? { count: 0, until: Date.now() + 3600000 };
            if (quota.count >= 6) throw new RecoveryError('TRY_LATER');
            quota.count++; attempts.set(emailKey, quota);
            if (!await store.ready()) throw new RecoveryError('UNAVAILABLE');
            if (enroll) {
                const token = /^Bearer (ranked_[A-Za-z0-9_-]{43})$/.exec(req.headers.authorization ?? '')?.[1];
                if (!auth.verifySession(token, userId) || typeof password !== 'string' || Buffer.byteLength(password) > 1024
                    || !await store.verifyPassword(userId, password)) throw new RecoveryError('AUTH_REQUIRED');
                release = gate.enter(userId) ?? undefined;
                if (!release || await store.blocked(userId)) throw new RecoveryError('ACCOUNT_BUSY');
            }
            const binding = await store.binding(userId);
            // Initial enrollment or idempotent re-verification only. Never silently reassign an existing recovery address.
            if (enroll && binding && binding.email !== email) throw new RecoveryError('INVALID_REQUEST');
            const matched = binding?.email === email ? binding : null;
            const ticket = challenges.create(enroll ? 'enroll' : 'reset', userId, email, matched);
            if (enroll) await store.sendCode(email, true);
            res.status(202).json({ ticket });
            if (!enroll && matched) {
                // Do not expose address membership through SMTP response latency or errors.
                void store.blocked(userId).then(blocked => blocked ? undefined : store.sendCode(email, false)).catch(() => {});
            }
        } catch (error) { fail(res, error); } finally { release?.(); }
    });
    router.post(['/account/recovery/complete', '/auth/recovery/complete'], async (req, res) => {
        let reserved: string | undefined, ownsTicket = false, uncertainReset = false;
        try {
            const enroll = req.path === '/account/recovery/complete';
            const { ticket, code, password } = req.body ?? {};
            if (typeof code !== 'string' || !/^\d{6,10}$/.test(code) || Object.keys(req.body).sort().join(',') !== (enroll ? 'code,ticket' : 'code,password,ticket')
                || (!enroll && !recoveryPassword(password))) throw new RecoveryError('INVALID_REQUEST');
            if (active.has(ticket)) throw new RecoveryError('TRY_LATER');
            const challenge = challenges.take(ticket);
            if (challenge.kind !== (enroll ? 'enroll' : 'reset')) throw new RecoveryError('INVALID_CODE');
            if (enroll && !auth.verifySession(/^Bearer (ranked_[A-Za-z0-9_-]{43})$/.exec(req.headers.authorization ?? '')?.[1], challenge.id)) throw new RecoveryError('AUTH_REQUIRED');
            active.add(ticket); ownsTicket = true;
            if (gate.blocked(challenge.id) || busy(challenge.id) || await store.blocked(challenge.id)) throw new RecoveryError('ACCOUNT_BUSY');
            try { gate.reserve(challenge.id, busy(challenge.id)); } catch { throw new RecoveryError('ACCOUNT_BUSY'); }
            reserved = challenge.id;
            if (!enroll && !challenge.binding) throw new RecoveryError('INVALID_CODE');
            const authId = await store.verifyCode(challenge.email, code);
            if (!authId || (!enroll && authId !== challenge.binding?.auth_user_id)) throw new RecoveryError('INVALID_CODE');
            challenges.consume(ticket); // OTP success is one-use, even if a downstream operation fails.
            if (enroll) await store.enroll(challenge.id, challenge.email, authId);
            else {
                // Revoke in-flight as well as existing proofs BEFORE the password write.
                auth.revokeUserSessions(challenge.id); disconnect(challenge.id);
                try { await store.reset(challenge.binding!, password); }
                catch {
                    // An aborted HTTP response does not prove the database rolled back.
                    // Only reopen login after the new password is confirmed persisted.
                    const persisted = await store.verifyPassword(challenge.id, password).catch(() => false);
                    if(!persisted) { uncertainReset = true; throw new RecoveryError('UNAVAILABLE'); }
                } finally { auth.revokeUserSessions(challenge.id); }
            }
            res.json({ completed: true });
        } catch (error) { fail(res, error); }
        finally { if (ownsTicket) active.delete(req.body.ticket); if (reserved&&!uncertainReset) gate.release(reserved); }
    });
    const malformed: ErrorRequestHandler = (error, _req, res, next) => {
        if (['entity.too.large','entity.parse.failed','encoding.unsupported'].includes(error?.type)) { res.status(400).json({ code: 'INVALID_REQUEST' }); return; } next(error);
    };
    router.use(malformed); return router;
}
