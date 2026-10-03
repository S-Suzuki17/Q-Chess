import express from 'express';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { RankedAuth } from './RankedAuth';
import { AccountWriteGate } from './AccountDeletion';
import { createRankedRefundRouter, type RankedRefundReader } from './RankedRefundRoutes';

let server: http.Server, base: string, token: string, auth: RankedAuth, gate: AccountWriteGate, enabled: boolean;
let store: { [K in keyof RankedRefundReader]: ReturnType<typeof vi.fn> };
const get = (proof = token) => ({ headers: { Authorization: `Bearer ${proof}` } });
beforeEach(async () => {
    enabled = true;
    store = { verifyUser: vi.fn().mockResolvedValue(null), blocked: vi.fn().mockResolvedValue(false),
        read: vi.fn().mockResolvedValue({ freeRankedRefunds: 43, paidRankedRefunds: 27 }) };
    auth = new RankedAuth(async () => true); gate = new AccountWriteGate();
    token = (await auth.issueLegacySession('Alice', 'right'))!.token;
    const app = express(); app.use(createRankedRefundRouter(auth, store, gate, () => enabled));
    server = http.createServer(app);
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/tickets/ranked-refunds`;
});
afterEach(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); vi.unstubAllEnvs(); });

it('passes uncapped free and eligible paid credits for the authenticated owner only', async () => {
    const response = await fetch(base, get());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ userId: 'Alice', enabled: true, freeRankedRefunds: 43, paidRankedRefunds: 27 });
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('vary')).toContain('Authorization');
    expect(store.read).toHaveBeenCalledExactlyOnceWith('Alice');
    store.read.mockResolvedValue({ freeRankedRefunds: 43, paidRankedRefunds: 0 });
    expect(await (await fetch(base, get())).json()).toMatchObject({ freeRankedRefunds: 43, paidRankedRefunds: 0 });
});
it('is hard OFF even when admission/recovery environments request ON', async () => {
    vi.stubEnv('RANKED_TICKET_ADMISSION_ENABLED', 'true'); vi.stubEnv('RANKED_ADMISSION_RECOVERY_ENABLED', 'true');
    const app = express(); app.use(createRankedRefundRouter(auth, store, gate));
    const dormant = http.createServer(app);
    await new Promise<void>(resolve => dormant.listen(0, '127.0.0.1', resolve));
    try {
        const response = await fetch(`http://127.0.0.1:${(dormant.address() as AddressInfo).port}/tickets/ranked-refunds`, get());
        expect(response.status).toBe(503); expect(await response.json()).toEqual({ code: 'FEATURE_DISABLED', enabled: false });
        expect(store.read).not.toHaveBeenCalled(); expect(store.verifyUser).not.toHaveBeenCalled();
    } finally { dormant.closeAllConnections(); await new Promise<void>(resolve => dormant.close(() => resolve())); }
});
it('rejects spoofed owners, unauthenticated/guest sessions, and mutation requests', async () => {
    for (const proof of ['', 'GUEST-Alice', 'forged', 'a.b.c']) expect((await fetch(base, get(proof))).status).toBe(401);
    expect((await fetch(`${base}?userId=Bob`, get())).status).toBe(400);
    expect((await fetch(base, { ...get(), method: 'POST' })).status).toBe(404);
    expect(store.read).not.toHaveBeenCalled();
});
it('verifies OAuth owner, including a second check before returning the balance', async () => {
    store.verifyUser.mockResolvedValue('OAuthUser');
    const response = await fetch(base, get('valid.jwt.token'));
    expect(response.status).toBe(200); expect(await response.json()).toMatchObject({ userId: 'OAuthUser' });
    expect(store.read).toHaveBeenCalledExactlyOnceWith('OAuthUser'); expect(store.verifyUser).toHaveBeenCalledTimes(2);
    store.verifyUser.mockResolvedValueOnce('OAuthUser').mockResolvedValueOnce(null);
    expect((await fetch(base, get('valid.jwt.token'))).status).toBe(401);
});
it('blocks deleting accounts before reading and after a read in flight', async () => {
    store.blocked.mockResolvedValueOnce(true);
    expect((await fetch(base, get())).status).toBe(423); expect(store.read).not.toHaveBeenCalled();
    store.blocked.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    expect((await fetch(base, get())).status).toBe(423);
});
it('rejects a legacy session revoked while the balance read is in flight', async () => {
    store.read.mockImplementation(async () => { auth.revokeUserSessions('Alice'); return { freeRankedRefunds: 1, paidRankedRefunds: 2 }; });
    expect((await fetch(base, get())).status).toBe(401);
});
it('does not return a balance if recovery is disabled during a read', async () => {
    store.read.mockImplementation(async () => { enabled = false; return { freeRankedRefunds: 1, paidRankedRefunds: 2 }; });
    const response = await fetch(base, get()); expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ code: 'FEATURE_DISABLED', enabled: false });
});
it('fails closed on malformed balances and DB/auth failures without exposing internal details', async () => {
    for (const count of [-1, 1.2, Number.MAX_SAFE_INTEGER + 1, '4', null]) {
        store.read.mockResolvedValue({ freeRankedRefunds: count, paidRankedRefunds: 0 });
        expect((await fetch(base, get())).status).toBe(503);
    }
    store.read.mockRejectedValue(new Error('private DB detail'));
    const response = await fetch(base, get()); expect(response.status).toBe(503);
    expect(await response.text()).toBe('{"code":"REFUND_BALANCE_UNAVAILABLE"}');
    store.verifyUser.mockRejectedValue(new Error('private auth detail'));
    expect((await fetch(base, get('valid.jwt.token'))).status).toBe(503);
});
it('bounds balance polling per authenticated user', async () => {
    for (let i = 0; i < 90; i++) expect((await fetch(base, get())).status).toBe(200);
    const response = await fetch(base, get()); expect(response.status).toBe(429); expect(response.headers.get('retry-after')).toBe('60');
    expect(store.read).toHaveBeenCalledTimes(90);
});
