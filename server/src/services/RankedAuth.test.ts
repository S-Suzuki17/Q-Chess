import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    MAX_RANKED_PASSWORD_BYTES, MAX_RANKED_SESSION_TTL_MS, MAX_RANKED_SESSIONS,
    MAX_RANKED_USER_ID_BYTES, RankedAuth,
} from './RankedAuth';

afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
});

describe('RankedAuth password proof', () => {
    it('requires actual password verification and binds an opaque token to that exact user', async () => {
        const verify = vi.fn(async (id: string, password: string) => id === 'Alice' && password === 'correct password');
        const auth = new RankedAuth(verify);
        expect(await auth.issueLegacySession('Alice', 'wrong password')).toBeNull();
        expect(auth.activeSessionCount).toBe(0);
        const session = (await auth.issueLegacySession('Alice', 'correct password'))!;
        expect(verify).toHaveBeenLastCalledWith('Alice', 'correct password');
        expect(session.token).toMatch(/^ranked_[A-Za-z0-9_-]{43}$/);
        expect(auth.verifySession(session.token, 'Alice')).toEqual({ userId: 'Alice', expiresAt: session.expiresAt });
        expect(auth.verifySession(session.token, 'Bob')).toBeNull();
        expect(auth.verifySession(session.token, 'alice')).toBeNull();
        expect(auth.verifySession(session.token, null)).toBeNull();
        expect(auth.verifySession(session.token, 'GUEST-Alice')).toBeNull();
        expect(auth.verifySession(session.token)?.userId).toBe('Alice');
    });

    it.each([false, null, undefined, 1, 'true', { success: true }])('fails closed for verifier result %j', async (result) => {
        const auth = new RankedAuth(vi.fn().mockResolvedValue(result));
        expect(await auth.issueLegacySession('Alice', 'password')).toBeNull();
        expect(auth.activeSessionCount).toBe(0);
    });

    it('fails closed on verifier exceptions without logging credentials', async () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});
        const log = vi.spyOn(console, 'log').mockImplementation(() => {});
        const auth = new RankedAuth(async () => { throw new Error('upstream password details'); });
        expect(await auth.issueLegacySession('Alice', 'password')).toBeNull();
        expect(auth.activeSessionCount).toBe(0);
        expect(error).not.toHaveBeenCalled();
        expect(log).not.toHaveBeenCalled();
    });

    it.each([
        null, undefined, 123, {}, '', ' ', ' Alice', 'Alice ', 'a\nb', 'a\0b',
        'GUEST-123', 'guest-123', 'anon_123', 'ANON-123', 'anonymous', 'ai', 'CPU-10', 'SUPABASE-Alice',
        'a'.repeat(MAX_RANKED_USER_ID_BYTES + 1), '界'.repeat(MAX_RANKED_USER_ID_BYTES),
    ])('rejects malformed or reserved user ID %j before checking a password', async (id) => {
        const verify = vi.fn().mockResolvedValue(true);
        const auth = new RankedAuth(verify);
        expect(await auth.issueLegacySession(id, 'password')).toBeNull();
        expect(verify).not.toHaveBeenCalled();
    });

    it.each([null, undefined, 123, {}, '', 'x'.repeat(MAX_RANKED_PASSWORD_BYTES + 1), '界'.repeat(MAX_RANKED_PASSWORD_BYTES)])(
        'rejects invalid or oversized passwords before calling the verifier', async (password) => {
            const verify = vi.fn().mockResolvedValue(true);
            const auth = new RankedAuth(verify);
            expect(await auth.issueLegacySession('Alice', password)).toBeNull();
            expect(verify).not.toHaveBeenCalled();
        },
    );

    it.each([null, undefined, {}, 5, '', 'Alice', 'SUPABASE-Alice', 'GUEST-123', 'anon_123', 'ranked_bad', 'x'.repeat(100_000)])(
        'never accepts an ID or malformed token as a session', (token) => {
            const auth = new RankedAuth(vi.fn().mockResolvedValue(true));
            expect(auth.verifySession(token)).toBeNull();
            expect(auth.revokeSession(token)).toBe(false);
        },
    );

    it('uses separate random tokens and stores only token digests and identities', async () => {
        const password = 'a secret password that must not be retained';
        const auth = new RankedAuth(async () => true);
        const first = (await auth.issueLegacySession('Alice', password))!;
        const second = (await auth.issueLegacySession('Alice', password))!;
        expect(first.token).not.toBe(second.token);
        const store = (auth as unknown as { sessions: Map<string, { userId: string; expiresAt: number }> }).sessions;
        expect(store.get(createHash('sha256').update(first.token).digest('hex'))).toEqual({ userId: 'Alice', expiresAt: first.expiresAt });
        const stored = JSON.stringify([...store.entries()]);
        expect(stored).not.toContain(password);
        expect(stored).not.toContain(first.token);
        expect(stored).not.toContain(second.token);
        for (const [digest, identity] of store) {
            expect(digest).toMatch(/^[a-f0-9]{64}$/);
            expect(Object.keys(identity).sort()).toEqual(['expiresAt', 'userId']);
        }
    });

    it('does not expose mutable retained identities', async () => {
        const auth = new RankedAuth(async () => true);
        const session = (await auth.issueLegacySession('Alice', 'password'))!;
        const token = session.token;
        session.userId = 'Bob';
        const identity = auth.verifySession(token)!;
        identity.userId = 'Carol';
        identity.expiresAt = 0;
        expect(auth.verifySession(token)?.userId).toBe('Alice');
        expect(auth.verifySession(token)?.expiresAt).toBeGreaterThan(Date.now());
    });

    it('rejects a modified or unknown well-formed token', async () => {
        const auth = new RankedAuth(async () => true);
        const session = (await auth.issueLegacySession('Alice', 'password'))!;
        const modified = `${session.token.slice(0, -1)}${session.token.endsWith('A') ? 'B' : 'A'}`;
        expect(auth.verifySession(modified)).toBeNull();
        expect(new RankedAuth(async () => true).verifySession(session.token)).toBeNull();
    });
});

describe('RankedAuth session lifetime and capacity', () => {
    it('expires at the exact one-hour boundary and removes the expired entry', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(1_000);
        const auth = new RankedAuth(async () => true);
        const session = (await auth.issueLegacySession('Alice', 'password'))!;
        expect(session.expiresAt).toBe(1_000 + MAX_RANKED_SESSION_TTL_MS);
        vi.setSystemTime(session.expiresAt - 1);
        expect(auth.verifySession(session.token)).not.toBeNull();
        vi.setSystemTime(session.expiresAt);
        expect(auth.verifySession(session.token)).toBeNull();
        expect(auth.activeSessionCount).toBe(0);
    });

    it('starts the lifetime only after password verification succeeds', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(1_000);
        let complete!: (value: boolean) => void;
        const auth = new RankedAuth(() => new Promise(resolve => { complete = resolve; }), { sessionTtlMs: 100 });
        const pending = auth.issueLegacySession('Alice', 'password');
        vi.setSystemTime(10_000);
        complete(true);
        expect((await pending)?.expiresAt).toBe(10_100);
    });

    it('revokes a single token and all sessions for one user', async () => {
        const auth = new RankedAuth(async () => true);
        const first = (await auth.issueLegacySession('Alice', 'password'))!;
        const second = (await auth.issueLegacySession('Alice', 'password'))!;
        const other = (await auth.issueLegacySession('Bob', 'password'))!;
        expect(auth.revokeSession(first.token)).toBe(true);
        expect(auth.revokeSession(first.token)).toBe(false);
        expect(auth.verifySession(first.token)).toBeNull();
        expect(auth.verifySession(second.token)).not.toBeNull();
        expect(auth.revokeUserSessions('Alice')).toBe(1);
        expect(auth.revokeUserSessions('Alice')).toBe(0);
        expect(auth.revokeUserSessions('GUEST-123')).toBe(0);
        expect(auth.verifySession(second.token)).toBeNull();
        expect(auth.verifySession(other.token)?.userId).toBe('Bob');
    });

    it('rejects issuance at capacity and reuses expired capacity without evicting active users', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(0);
        const verify = vi.fn().mockResolvedValue(true);
        const auth = new RankedAuth(verify, { maxSessions: 1, sessionTtlMs: 100 });
        const first = (await auth.issueLegacySession('Alice', 'password'))!;
        expect(await auth.issueLegacySession('Bob', 'password')).toBeNull();
        expect(verify).toHaveBeenCalledTimes(1);
        expect(auth.verifySession(first.token)?.userId).toBe('Alice');
        vi.setSystemTime(100);
        const next = await auth.issueLegacySession('Bob', 'password');
        expect(next?.userId).toBe('Bob');
        expect(auth.activeSessionCount).toBe(1);
        expect(auth.verifySession(first.token)).toBeNull();
    });

    it('keeps the capacity bound when password checks complete concurrently', async () => {
        const completions: Array<(value: boolean) => void> = [];
        const auth = new RankedAuth(() => new Promise(resolve => completions.push(resolve)), { maxSessions: 1 });
        const first = auth.issueLegacySession('Alice', 'password');
        const second = auth.issueLegacySession('Bob', 'password');
        completions.forEach(resolve => resolve(true));
        expect((await first)?.userId).toBe('Alice');
        expect(await second).toBeNull();
        expect(auth.activeSessionCount).toBe(1);
    });

    it('cleans expired sessions explicitly without retaining a background timer', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(0);
        const auth = new RankedAuth(async () => true, { sessionTtlMs: 10 });
        await auth.issueLegacySession('Alice', 'password');
        vi.setSystemTime(5);
        const other = (await auth.issueLegacySession('Bob', 'password'))!;
        vi.setSystemTime(10);
        expect(auth.cleanupExpiredSessions()).toBe(1);
        expect(auth.verifySession(other.token)?.userId).toBe('Bob');
        expect(auth.activeSessionCount).toBe(1);
        expect(vi.getTimerCount()).toBe(0);
    });

    it.each([0, -1, 1.5, NaN, Infinity, MAX_RANKED_SESSION_TTL_MS + 1])('rejects invalid lifetime %s', sessionTtlMs => {
        expect(() => new RankedAuth(async () => true, { sessionTtlMs })).toThrow(RangeError);
    });

    it.each([0, -1, 1.5, NaN, Infinity, MAX_RANKED_SESSIONS + 1])('rejects invalid capacity %s', maxSessions => {
        expect(() => new RankedAuth(async () => true, { maxSessions })).toThrow(RangeError);
    });
});
