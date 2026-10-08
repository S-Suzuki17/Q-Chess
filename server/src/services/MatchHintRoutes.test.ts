import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import { RankedAuth } from './RankedAuth';
import { AccountWriteGate } from './AccountDeletion';
import { createMatchHintRouter } from './MatchHintRoutes';
import { MatchHintError } from './MatchHintTypes';

describe('authenticated match hint HTTP boundary', () => {
    let server: http.Server, base: string, auth: RankedAuth, token: string, enabled: boolean,
        connection: string, gate: AccountWriteGate;
    const requestHint = vi.fn(), receipt = vi.fn(), verifyUser = vi.fn();
    beforeEach(async () => {
        vi.resetAllMocks(); enabled = true; connection = 'socket-1'; gate = new AccountWriteGate();
        auth = new RankedAuth(async () => true); token = (await auth.issueLegacySession('Alice', 'pw'))!.token;
        requestHint.mockResolvedValue({ receiptId: randomUUID() }); receipt.mockResolvedValue(null); verifyUser.mockResolvedValue(null);
        const app = express(); app.use(createMatchHintRouter(auth, { service: { requestHint, receipt } as never, verifyUser,
            accountGate: gate, enabled: () => enabled, connection: (_id, proof) => {
                if (proof !== token || !connection) throw new MatchHintError('RECONNECT_REQUIRED'); return connection;
            } }));
        server = http.createServer(app); await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
        base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    });
    afterEach(async () => { server.closeAllConnections(); await new Promise<void>(r => server.close(() => r())); });
    const post = (body: unknown, proof = token, path = '/match-hints/private-room') => fetch(base + path, { method: 'POST',
        headers: { Authorization: `Bearer ${proof}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    it('accepts only requestId/revision and derives user from the current proof', async () => {
        const requestId = randomUUID(); const response = await post({ requestId, revision: 3 });
        expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toBe('no-store');
        expect(requestHint.mock.calls[0].slice(0, 4)).toEqual(['Alice', 'private-room', 3, requestId]);
        expect(requestHint.mock.calls[0][4].connectionId).toBe('socket-1');
        for (const extra of [{ board: [] }, { userId: 'Bob' }, { side: 'black' }, { amount: 0 }, { mode: 'practice' }, { history: [] }]) {
            expect((await post({ requestId, revision: 3, ...extra })).status).toBe(400);
        }
        expect(requestHint).toHaveBeenCalledTimes(1);
    });
    it('rejects guests, malformed IDs/query/body and gate-OFF before purchase', async () => {
        expect((await post({ requestId: randomUUID(), revision: 0 }, 'GUEST-fake')).status).toBe(401);
        for (const body of [[], null, {}, { requestId: 'bad', revision: 0 }, { requestId: randomUUID(), revision: -1 },
            { requestId: randomUUID(), revision: '0' }, { requestId: randomUUID(), revision: 2147483648 }]) {
            expect((await post(body)).status).toBe(400);
        }
        expect((await post({ requestId: randomUUID(), revision: 0 }, token, '/match-hints/room?board=bad')).status).toBe(400);
        enabled = false; expect((await post({}, 'invalid')).status).toBe(503);
        expect(requestHint).not.toHaveBeenCalled();
    });
    it('uses independently verified Supabase identity and current-socket proof', async () => {
        await auth.revokeSession(token); verifyUser.mockResolvedValue('Alice');
        expect((await post({ requestId: randomUUID(), revision: 0 })).status).toBe(200);
        connection = ''; expect((await post({ requestId: randomUUID(), revision: 0 })).status).toBe(503);
        expect(requestHint).toHaveBeenCalledTimes(1);
    });
    it('does not send a successful committed result to a revoked proof; fresh login can recover it', async () => {
        const saved = { receiptId: randomUUID(), deliveryState: 'paid_retrievable' };
        requestHint.mockImplementation(async () => { await auth.revokeSession(token); return saved; });
        expect((await post({ requestId: randomUUID(), revision: 0 })).status).toBe(401);
        receipt.mockResolvedValue(saved); token = (await auth.issueLegacySession('Alice', 'pw'))!.token;
        const response = await fetch(base + `/match-hints/${randomUUID()}/0/${randomUUID()}`, { headers: { Authorization: `Bearer ${token}` } });
        expect(response.status).toBe(200); expect(await response.json()).toEqual(saved);
        expect(requestHint).toHaveBeenCalledTimes(1);
    });
    it('rechecks connection ownership immediately before sending a paid hint', async () => {
        requestHint.mockImplementation(async () => { connection = 'socket-2'; return { receiptId: randomUUID() }; });
        const response = await post({ requestId: randomUUID(), revision: 0 });
        expect(response.status).toBe(503); expect(await response.json()).toEqual({ code: 'RECONNECT_REQUIRED' });
    });
    it('blocks stale proof on read response while allowing receipt reads after gate-OFF and disconnect', async () => {
        enabled = false; connection = '';
        const path = `/match-hints/${randomUUID()}/0/${randomUUID()}`;
        receipt.mockImplementation(async () => { await auth.revokeSession(token); return { receiptId: randomUUID() }; });
        expect((await fetch(base + path, { headers: { Authorization: `Bearer ${token}` } })).status).toBe(401);
        token = (await auth.issueLegacySession('Alice', 'pw'))!.token; receipt.mockResolvedValue(null);
        expect((await fetch(base + path, { headers: { Authorization: `Bearer ${token}` } })).status).toBe(200);
        expect(requestHint).not.toHaveBeenCalled();
    });
    it('holds the account write barrier during async work and releases it on errors', async () => {
        requestHint.mockImplementation(async () => { expect(() => gate.reserve('Alice', false)).toThrow('ACCOUNT_BUSY');
            throw new MatchHintError('HINT_RECOVERY_PENDING'); });
        const response = await post({ requestId: randomUUID(), revision: 0 });
        expect(response.status).toBe(503); expect(await response.json()).toEqual({ code: 'HINT_RECOVERY_PENDING' });
        expect(() => gate.reserve('Alice', false)).not.toThrow(); gate.release('Alice');
    });
    it('propagates a real HTTP disconnect to pre-dispatch search cancellation', async () => {
        let started!: () => void, stopped!: () => void;
        const entered = new Promise<void>(r => { started = r; }), cancelled = new Promise<void>(r => { stopped = r; });
        requestHint.mockImplementation((_u, _r, _v, _q, context) => new Promise((_resolve, reject) => {
            started(); context.signal.addEventListener('abort', () => { stopped(); reject(context.signal.reason); }, { once: true });
        }));
        const controller = new AbortController();
        const response = fetch(base + '/match-hints/room', { method: 'POST', headers: {
            Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ requestId: randomUUID(), revision: 0 }), signal: controller.signal });
        await entered; controller.abort(); await expect(response).rejects.toThrow(); await cancelled;
    });
});
