import express from 'express';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RankedAuth } from './RankedAuth';
import { AccountWriteGate } from './AccountDeletion';
import { createDailyLoginRouter } from './DailyLoginRoutes';
import type { DailyLoginStore } from './DailyLoginStore';

describe('authenticated daily login reward HTTP API', () => {
    let server: http.Server, base: string, token: string, auth: RankedAuth;
    let gate: AccountWriteGate, enabled: boolean;
    let store: { [K in keyof DailyLoginStore]: ReturnType<typeof vi.fn> };
    const state = { lastClaimUtcDay: '2026-09-30', streakDays: 2, tickets: { ranked: 2, hint: 3 } };
    const claim = { ...state, claimed: true, credited: { ranked: 1, hint: 2 } };
    const get = (proof: string) => ({ headers: { Authorization: `Bearer ${proof}` } });
    const post = (proof: string, body = '{}') => ({
        method: 'POST', headers: { Authorization: `Bearer ${proof}`, 'Content-Type': 'application/json' }, body,
    });

    beforeEach(async () => {
        enabled = true;
        store = {
            verifyUser: vi.fn().mockResolvedValue(null), blocked: vi.fn().mockResolvedValue(false), hasCurrentTerms: vi.fn().mockResolvedValue(true),
            read: vi.fn().mockResolvedValue(state), claim: vi.fn().mockResolvedValue(claim),
        };
        auth = new RankedAuth(async (id, password) => id === 'Alice' && password === 'right');
        token = (await auth.issueLegacySession('Alice', 'right'))!.token;
        gate = new AccountWriteGate();
        const app = express(); app.use(createDailyLoginRouter(auth, store, gate, () => enabled));
        server = http.createServer(app);
        await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
        base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    });
    afterEach(async () => {
        server?.closeAllConnections();
        if (server?.listening) await new Promise<void>(resolve => server.close(() => resolve()));
        vi.restoreAllMocks();
    });

    it('rejects old-consent claims but permits reading the existing balance', async () => {
        store.hasCurrentTerms.mockResolvedValue(false);
        expect((await fetch(base+'/rewards/daily-login/claim',post(token))).status).toBe(403);
        expect(store.claim).not.toHaveBeenCalled();
        expect((await fetch(base+'/rewards/daily-login',get(token))).status).toBe(200);
    });
    it('is OFF by default and does not call the store while disabled', async () => {
        enabled = false;
        const result = await fetch(`${base}/rewards/daily-login`, get(token));
        expect(result.status).toBe(503);
        expect(await result.json()).toEqual({ code: 'FEATURE_DISABLED', enabled: false });
        expect(result.headers.get('cache-control')).toBe('no-store');
        expect(store.read).not.toHaveBeenCalled();
    });
    it('keeps the production default OFF without explicit environment activation', async () => {
        vi.stubEnv('DAILY_LOGIN_REWARDS_ENABLED', undefined);
        const app = express(); app.use(createDailyLoginRouter(auth, store, gate));
        const dormant = http.createServer(app);
        await new Promise<void>(resolve => dormant.listen(0, '127.0.0.1', resolve));
        const origin = `http://127.0.0.1:${(dormant.address() as AddressInfo).port}`;
        try {
            for (const [path, options] of [
                ['/rewards/daily-login', get(token)],
                ['/rewards/daily-login/claim', post(token)],
            ] as const) {
                const result = await fetch(`${origin}${path}`, options);
                expect(result.status).toBe(503);
                expect(await result.json()).toEqual({ code: 'FEATURE_DISABLED', enabled: false });
            }
            expect(store.read).not.toHaveBeenCalled();
            expect(store.claim).not.toHaveBeenCalled();
            expect(store.verifyUser).not.toHaveBeenCalled();
        } finally {
            dormant.closeAllConnections();
            await new Promise<void>(resolve => dormant.close(() => resolve()));
            vi.unstubAllEnvs();
        }
    });
    it('rejects guests, forged sessions and client-chosen identities or amounts', async () => {
        for (const proof of ['', 'GUEST-Alice', 'ranked_forged', 'a.b.c']) {
            expect((await fetch(`${base}/rewards/daily-login`, get(proof))).status).toBe(401);
            expect((await fetch(`${base}/rewards/daily-login/claim`, post(proof))).status).toBe(401);
        }
        for (const body of ['{"userId":"Bob"}', '{"amount":999}', '{"date":"2099-01-01"}', '[]']) {
            expect((await fetch(`${base}/rewards/daily-login/claim`, post(token, body))).status).toBe(400);
        }
        expect((await fetch(`${base}/rewards/daily-login?userId=Bob`, get(token))).status).toBe(400);
        expect(store.read).not.toHaveBeenCalled();
        expect(store.claim).not.toHaveBeenCalled();
    });
    it('uses the authenticated owner for status and claim; returns no-store responses', async () => {
        const status = await fetch(`${base}/rewards/daily-login`, get(token));
        expect(status.status).toBe(200);
        expect(await status.json()).toEqual({ userId: 'Alice', enabled: true, ...state, currentUtcDay: new Date().toISOString().slice(0, 10) });
        expect(status.headers.get('cache-control')).toBe('no-store');
        const result = await fetch(`${base}/rewards/daily-login/claim`, post(token));
        expect(result.status).toBe(200);
        expect(await result.json()).toEqual({ userId: 'Alice', enabled: true, ...claim, currentUtcDay: new Date().toISOString().slice(0, 10) });
        expect(store.read).toHaveBeenCalledExactlyOnceWith('Alice');
        expect(store.claim).toHaveBeenCalledExactlyOnceWith('Alice');
    });
    it('accepts a validated OAuth token but no unauthenticated JWT-shaped string', async () => {
        store.verifyUser.mockResolvedValueOnce('OAuthUser');
        expect((await fetch(`${base}/rewards/daily-login`, get('valid.jwt.token'))).status).toBe(200);
        expect(store.read).toHaveBeenCalledWith('OAuthUser');
        expect((await fetch(`${base}/rewards/daily-login`, get('valid.jwt.token'))).status).toBe(401);
    });
    it('rechecks OAuth ownership just before a claim and rejects a revoked proof', async () => {
        store.verifyUser.mockResolvedValueOnce('OAuthUser').mockResolvedValueOnce(null);
        expect((await fetch(`${base}/rewards/daily-login/claim`, post('valid.jwt.token'))).status).toBe(401);
        expect(store.claim).not.toHaveBeenCalled();
    });
    it('rejects invalid content types and oversized claim bodies before mutation', async () => {
        expect((await fetch(`${base}/rewards/daily-login/claim`, {
            method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'text/plain' }, body: '{}',
        })).status).toBe(415);
        expect((await fetch(`${base}/rewards/daily-login/claim`, post(token, JSON.stringify({ filler: 'x'.repeat(200) })))).status).toBe(413);
        expect(store.claim).not.toHaveBeenCalled();
    });
    it('blocks deleted accounts and fails closed on account or DB errors', async () => {
        store.blocked.mockResolvedValue(true);
        expect((await fetch(`${base}/rewards/daily-login/claim`, post(token))).status).toBe(423);
        expect(store.claim).not.toHaveBeenCalled();
        store.blocked.mockRejectedValue(new Error('private detail'));
        const result = await fetch(`${base}/rewards/daily-login`, get(token));
        expect(result.status).toBe(503);
        expect(await result.text()).not.toContain('private detail');
        store.blocked.mockResolvedValue(false);
        store.claim.mockRejectedValue(new Error('private detail'));
        expect((await fetch(`${base}/rewards/daily-login/claim`, post(token))).status).toBe(503);
    });
    it('keeps a write lease throughout the claim so deletion cannot race the award', async () => {
        let complete!: () => void, entered!: () => void;
        const began = new Promise<void>(resolve => { entered = resolve; });
        store.claim.mockImplementation(async () => {
            entered(); await new Promise<void>(resolve => { complete = resolve; }); return claim;
        });
        const pending = fetch(`${base}/rewards/daily-login/claim`, post(token));
        await began;
        expect(() => gate.reserve('Alice', false)).toThrow('ACCOUNT_BUSY');
        complete();
        expect((await pending).status).toBe(200);
        expect(() => gate.reserve('Alice', false)).not.toThrow();
    });
});
