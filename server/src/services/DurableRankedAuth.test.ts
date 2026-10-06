import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DurableRankedAuth, SessionAuthorityUnavailable, createDurableRankedAuth, type DurableSessionRpc } from './DurableRankedAuth';

const token = 'ranked_' + 'A'.repeat(43);
const hash = createHash('sha256').update(token).digest('hex');
const success = (data: unknown) => ({ data, error: null });
const fields = (persistent = false) => ({
    userId: 'Alice', incarnation: '8f030a96-5736-4b29-a6f8-ed588775f738', generation: '0', persistent,
    issuedAt: '2026-10-06T12:00:00.123456+00:00',
    expiresAt: persistent ? '2026-11-05T12:00:00.123456+00:00' : '2026-10-06T13:00:00.123456+00:00',
});
const fixture = (data: unknown) => {
    const rpc = vi.fn<DurableSessionRpc>().mockResolvedValue(success(data));
    return { rpc, auth: new DurableRankedAuth(rpc) };
};
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('dormant durable session RPC boundary', () => {
    it.each([false, true])('issues an opaque bearer with the exact DB lifetime, persistent=%s', async persistent => {
        const { rpc, auth } = fixture({ ok: true, ...fields(persistent) });
        const proof = await auth.issueLegacySession('Alice', 'synthetic-password', persistent);
        expect(proof).toEqual({ userId: 'Alice', expiresAt: Date.parse(fields(persistent).expiresAt), token: expect.stringMatching(/^ranked_[A-Za-z0-9_-]{43}$/) });
        expect(rpc.mock.calls[0].slice(0, 2)).toEqual(['issue_legacy_session', {
            p_user_id: 'Alice', p_password: 'synthetic-password', p_token_hash: createHash('sha256').update(proof!.token).digest('hex'), p_persistent: persistent,
        }]);
        expect(JSON.stringify(rpc.mock.calls)).not.toContain(proof!.token);
        expect(rpc).toHaveBeenCalledOnce();
    });
    it.each(['INVALID_CREDENTIALS', 'STALE_AUTHENTICATION'])('returns a normal denial without retry or revoke: %s', async error => {
        const { rpc, auth } = fixture({ ok: false, error });
        expect(await auth.issueLegacySession('Alice', 'wrong')).toBeNull();
        expect(rpc).toHaveBeenCalledOnce();
    });
    it.each(['INVALID_REQUEST', 'TOKEN_CONFLICT', 'CAPACITY'])('does not revoke an existing proof on confirmed denial %s', async error => {
        const { rpc, auth } = fixture({ ok: false, error });
        await expect(auth.issueLegacySession('Alice', 'password')).rejects.toBeInstanceOf(SessionAuthorityUnavailable);
        expect(rpc.mock.calls.map(call => call[0])).toEqual(['issue_legacy_session']);
    });
    it.each([{ ok: false, error: 'UNKNOWN' }, { ok: true, ...fields(), userId: 'Bob' }, { ok: true, ...fields(), persistent: true }])('cleans up only the attempted proof on an unknown/malformed issuance %j', async data => {
        const { rpc, auth } = fixture(data);
        await expect(auth.issueLegacySession('Alice', 'password')).rejects.toBeInstanceOf(SessionAuthorityUnavailable);
        expect(rpc.mock.calls.map(call => call[0])).toEqual(['issue_legacy_session', 'revoke_legacy_session']);
        expect(rpc.mock.calls[1][1]).toEqual({ p_token_hash: rpc.mock.calls[0][1].p_token_hash });
    });
    it('redacts provider errors and failed cleanup without logging or affecting other devices', async () => {
        const rpc = vi.fn<DurableSessionRpc>().mockRejectedValue(new Error('submitted-password private-token'));
        const logs = [vi.spyOn(console, 'log'), vi.spyOn(console, 'warn'), vi.spyOn(console, 'error')];
        const error = await new DurableRankedAuth(rpc).issueLegacySession('Alice', 'submitted-password').catch(error => error);
        expect(error).toBeInstanceOf(SessionAuthorityUnavailable);
        expect(error.message).toBe('Session authority unavailable');
        expect(error.cause).toBeUndefined(); expect(error.stack).not.toContain('submitted-password');
        expect(rpc.mock.calls.map(call => call[0])).toEqual(['issue_legacy_session', 'revoke_legacy_session']);
        logs.forEach(log => expect(log).not.toHaveBeenCalled());
    });
    it('bounds issuance and cleanup even if a provider ignores the abort signal', async () => {
        vi.useFakeTimers();
        const rpc = vi.fn<DurableSessionRpc>().mockImplementation(() => new Promise(() => {}));
        const result = new DurableRankedAuth(rpc, 10).issueLegacySession('Alice', 'password').catch(error => error);
        await vi.advanceTimersByTimeAsync(20);
        expect(await result).toBeInstanceOf(SessionAuthorityUnavailable);
        expect(rpc.mock.calls).toHaveLength(2);
        expect(rpc.mock.calls.every(call => call[2].aborted)).toBe(true);
        expect(vi.getTimerCount()).toBe(0);
    });
    it.each([['GUEST-1', 'password'], [' Alice', 'password'], ['Alice', ''], ['Alice', 'é'.repeat(513)], [null, 'password']])('rejects bad input locally: %s', async (user, password) => {
        const { auth, rpc } = fixture({}); expect(await auth.issueLegacySession(user, password)).toBeNull(); expect(rpc).not.toHaveBeenCalled();
    });
    it.each([null, '', 'GUEST-test', 'a.b.c', token + '\n', token + 'A', 'ranked_' + '*'.repeat(43)])('does not query legacy DB for malformed/other-protocol proof %s', async invalid => {
        const { auth, rpc } = fixture({});
        expect(await auth.verifySession(invalid)).toBeNull(); expect(await auth.revokeSession(invalid)).toBe(false); expect(rpc).not.toHaveBeenCalled();
    });
    it('hashes each verification and binds expected identity without positive caching', async () => {
        const { auth, rpc } = fixture({ status: 'valid', ...fields() });
        expect(await auth.verifySession(token, 'Alice')).toEqual({ userId: 'Alice', expiresAt: Date.parse(fields().expiresAt) });
        expect(rpc.mock.calls[0].slice(0, 2)).toEqual(['verify_legacy_session', { p_token_hash: hash, p_expected_user_id: 'Alice' }]);
        rpc.mockResolvedValueOnce(success({ status: 'revoked' })); expect(await auth.verifySession(token, 'Alice')).toBeNull(); expect(rpc).toHaveBeenCalledTimes(2);
    });
    it('uses database validity instead of the application host clock', async () => {
        vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2099-01-01T00:00:00Z'));
        expect(await fixture({ status: 'valid', ...fields() }).auth.verifySession(token)).toMatchObject({ userId: 'Alice' });
    });
    it.each([{ status: 'invalid' }, { status: 'revoked' }, { status: 'expired', ...fields() }])('returns no identity for $status', async row => {
        expect(await fixture(row).auth.verifySession(token)).toBeNull();
    });
    it('rejects invalid expected identity before querying', async () => {
        const { auth, rpc } = fixture({}); expect(await auth.verifySession(token, 'GUEST-1')).toBeNull(); expect(await auth.revokeUserSessions(null)).toBe(0); expect(rpc).not.toHaveBeenCalled();
    });
    it.each([
        { userId: 'Bob' }, { persistent: true }, { incarnation: 'not-a-uuid' }, { generation: '01' },
        { generation: '9223372036854775808' }, { generation: 1 }, { issuedAt: '2026-02-31T12:00:00Z' },
        { expiresAt: '2026-10-06T14:00:00.123456+00:00' }, { issuedAt: '2026-10-06T24:00:00Z' },
        { expiresAt: 'infinity' }, { expiresAt: '2026-10-06T13:00:00.123456+15:00' }, { extra: true },
        { issuedAt: '2026-10-06T12:00:00.123999+00:00', expiresAt: '2026-10-06T13:00:00.123000+00:00' },
    ])('rejects malformed or mismatched identity %j', async changed => {
        await expect(fixture({ status: 'valid', ...fields(), ...changed }).auth.verifySession(token, 'Alice')).rejects.toBeInstanceOf(SessionAuthorityUnavailable);
    });
    it('accepts exact duration with differing offsets and microsecond formatting', async () => {
        const row = { status: 'valid', ...fields(), issuedAt: '2026-10-25T02:30:00.12+02:00', expiresAt: '2026-10-25T02:30:00.120000+01:00' };
        expect(await fixture(row).auth.verifySession(token)).toMatchObject({ expiresAt: Date.parse(row.expiresAt) });
    });
    it.each([null, [], true, {}, { status: 'revoked', userId: 'Alice' }, { status: 'unknown' }])('rejects malformed RPC data %j', async row => {
        await expect(fixture(row).auth.verifySession(token)).rejects.toBeInstanceOf(SessionAuthorityUnavailable);
    });
    it('validates token and account revocation counts separately', async () => {
        const { auth, rpc } = fixture({ revoked: 1 }); expect(await auth.revokeSession(token)).toBe(true);
        expect(rpc.mock.calls[0].slice(0, 2)).toEqual(['revoke_legacy_session', { p_token_hash: hash }]);
        rpc.mockResolvedValueOnce(success({ revoked: 0 })); expect(await auth.revokeSession(token)).toBe(false);
        rpc.mockResolvedValueOnce(success({ revoked: 10001 })); expect(await auth.revokeUserSessions('Alice')).toBe(10001);
        expect(rpc.mock.calls[2].slice(0, 2)).toEqual(['revoke_user_legacy_sessions', { p_user_id: 'Alice' }]);
    });
    it.each([-1, 1.2, 2, '1', null, Infinity])('rejects malformed single-token count %s', async revoked => {
        await expect(fixture({ revoked }).auth.revokeSession(token)).rejects.toBeInstanceOf(SessionAuthorityUnavailable);
    });
    it('does not accept an error beside otherwise valid RPC data', async () => {
        const rpc = vi.fn<DurableSessionRpc>().mockResolvedValue({ data: { status: 'valid', ...fields() }, error: { message: 'secret' } });
        await expect(new DurableRankedAuth(rpc).verifySession(token)).rejects.toThrow('Session authority unavailable');
    });
    it('keeps protocol activation closed and rejects unknown contracts', async () => {
        const { auth, rpc } = fixture({ version: 1, activationReady: false }); expect(await auth.protocol()).toEqual({ version: 1, activationReady: false });
        for (const data of [{ version: 2, activationReady: false }, { version: 1, activationReady: true }, { version: 1 }]) {
            rpc.mockResolvedValueOnce(success(data)); await expect(auth.protocol()).rejects.toBeInstanceOf(SessionAuthorityUnavailable);
        }
        expect(readFileSync('server/src/index.ts', 'utf8')).not.toMatch(/\b(?:createDurableRankedAuth|DurableRankedAuth)\b/);
    });
    it('passes the bounded abort signal into the Supabase builder', async () => {
        const abortSignal = vi.fn().mockResolvedValue(success({ status: 'invalid' })); const rpc = vi.fn().mockReturnValue({ abortSignal });
        expect(await createDurableRankedAuth({ rpc } as any).verifySession(token)).toBeNull(); expect(abortSignal).toHaveBeenCalledWith(expect.any(AbortSignal));
    });
});
