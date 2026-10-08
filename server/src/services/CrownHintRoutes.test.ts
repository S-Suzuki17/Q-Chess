import { afterEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import { RankedAuth } from './RankedAuth';
import { AccountWriteGate } from './AccountDeletion';
import { CrownHintError, CrownHintRegistry } from './CrownHintRegistry';
import { createCrownHintRouter, type CrownHintRequestContext } from './CrownHintRoutes';
import { getAllConcreteMoves } from '../quantum-engine/ai/random';

const servers: http.Server[] = [];
afterEach(async () => {
    for (const server of servers.splice(0)) { server.closeAllConnections(); await new Promise<void>(done => server.close(() => done())); }
});
async function fixture() {
    const auth = new RankedAuth(async () => true), accountGate = new AccountWriteGate();
    const alice = (await auth.issueLegacySession('Alice', 'secret'))!.token;
    const bob = (await auth.issueLegacySession('Bob', 'secret'))!.token;
    const registry = new CrownHintRegistry();
    let enabled = true, busy = false, supabaseValid = true;
    const verifyUser = vi.fn(async (token: string) => token === 'verified_supabase' && supabaseValid ? 'Alice' : null);
    const requestHint = vi.fn(async (_user: string, _runId: string, _revision: number, _requestId: string, _context: CrownHintRequestContext): Promise<unknown> => null);
    const readReceipt = vi.fn(async (_user: string, _runId: string, _revision: number, _requestId: string, _context: CrownHintRequestContext): Promise<unknown> => null);
    const app = express(); app.use(createCrownHintRouter(auth, { registry, verifyUser, accountGate,
        enabled: () => enabled, accountBusy: () => busy, requestHint, readReceipt }));
    const server = http.createServer(app); servers.push(server);
    await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const post = (path: string, body: unknown, token = alice, extra: RequestInit = {}) => fetch(base + path,
        { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(body), ...extra });
    const get = (path: string, token = alice) => fetch(base + path, { headers: { Authorization: `Bearer ${token}` } });
    const open = async (token = alice) => {
        const response = await post('/crown-hints/runs', { runId: randomUUID(), stageId: 1, playerSide: 'white' }, token);
        expect(response.status).toBe(200); return response.json();
    };
    return { auth, accountGate, registry, verifyUser, requestHint, readReceipt, base, post, get, open, alice, bob,
        setEnabled(value: boolean) { enabled = value; }, setBusy(value: boolean) { busy = value; },
        revokeSupabase() { supabaseValid = false; } };
}
describe('Crown hint HTTP ownership and recovery', () => {
    it('accepts only authenticated fixed stage inputs and keeps responses uncached', async () => {
        const f = await fixture(), runId = randomUUID();
        const response = await f.post('/crown-hints/runs', { runId, stageId: 3, playerSide: 'black' });
        expect(response.status).toBe(200);
        expect(response.headers.get('cache-control')).toBe('no-store'); expect(response.headers.get('vary')).toBe('Authorization');
        expect(await response.json()).toMatchObject({ kind: 'crown', runId, stageId: 3, strength: 1, seconds: 10, revision: 0 });
        for (const body of [{ runId: randomUUID(), stageId: 1, playerSide: 'white', userId: 'Bob' },
            { runId: randomUUID(), stageId: 1, playerSide: 'white', authorizationId: randomUUID() },
            { runId: randomUUID(), stageId: 1, playerSide: 'white', board: [] }, [], null]) {
            expect((await f.post('/crown-hints/runs', body)).status).toBe(400);
        }
        expect((await f.post('/crown-hints/runs', {}, 'GUEST-fake')).status).toBe(401);
        expect((await f.post('/crown-hints/runs?stageId=100', {})).status).toBe(400);
    });
    it('binds state reads and legal move writes to the authenticated owner and actor', async () => {
        const f = await fixture(), run = await f.open(), path = `/crown-hints/runs/${run.runId}`;
        expect((await f.get(path, f.bob)).status).toBe(403);
        const move = getAllConcreteMoves(run.state, { playable: true })[0], operationId = randomUUID();
        expect((await f.post(path + '/moves', { operationId, revision: 0, actor: 'human', move }, f.bob)).status).toBe(403);
        expect((await f.post(path + '/moves', { operationId, revision: 0, actor: 'cpu', move })).status).toBe(422);
        expect((await f.post(path + '/moves', { operationId, revision: 0, actor: 'human', move, state: { ply: 0 } })).status).toBe(400);
        const body = { operationId, revision: 0, actor: 'human', move };
        const first = await f.post(path + '/moves', body); expect(first.status).toBe(200);
        expect((await first.json()).revision).toBe(1);
        expect((await (await f.post(path + '/moves', body)).json()).revision).toBe(1);
        expect((await (await f.get(path)).json()).history).toHaveLength(1);
    });
    it('rejects account deletion and online busy states before allocating a context', async () => {
        const f = await fixture(), body = { runId: randomUUID(), stageId: 1, playerSide: 'white' };
        f.accountGate.reserve('Alice', false); expect((await f.post('/crown-hints/runs', body)).status).toBe(403);
        f.accountGate.release('Alice'); f.setBusy(true);
        expect((await f.post('/crown-hints/runs', body)).status).toBe(409); f.setBusy(false);
        expect(() => f.registry.read('Alice', body.runId)).toThrow('SESSION_NOT_FOUND');
    });
    it('accepts verified Supabase identities and rechecks them after receipt lookup', async () => {
        const f = await fixture(), run = await f.open('verified_supabase'), requestId = randomUUID();
        f.readReceipt.mockImplementation(async () => { f.revokeSupabase(); return { secret: 'must not be delivered' }; });
        const response = await f.get(`/crown-hints/receipts/${run.hintContextId}/0/${requestId}`, 'verified_supabase');
        expect(response.status).toBe(401); expect(await response.json()).toEqual({ code: 'AUTH_REQUIRED' });
        expect(f.verifyUser).toHaveBeenCalled();
    });
    it('preserves legacy revocation after a pending hint response', async () => {
        const f = await fixture(), run = await f.open(), requestId = randomUUID();
        f.requestHint.mockImplementation(async () => { await f.auth.revokeSession(f.alice); return { receiptId: randomUUID() }; });
        const response = await f.post(`/crown-hints/runs/${run.runId}/hints`, { requestId, revision: 0 });
        expect(response.status).toBe(401); expect(await response.json()).toEqual({ code: 'AUTH_REQUIRED' });
        expect(f.requestHint).toHaveBeenCalledWith('Alice', run.runId, 0, requestId, expect.any(Object));
    });
    it('allows immutable receipt recovery after a closed run, feature OFF and another match busy', async () => {
        const f = await fixture(), run = await f.open(), requestId = randomUUID();
        f.registry.close('Alice', run.runId);
        const receipt = { contextId: run.hintContextId, revision: 0, receiptId: randomUUID(), deliveryState: 'paid_retrievable' };
        f.readReceipt.mockResolvedValue(receipt); f.setEnabled(false); f.setBusy(true);
        const response = await f.get(`/crown-hints/receipts/${run.hintContextId}/0/${requestId}`);
        expect(response.status).toBe(200); expect(await response.json()).toEqual(receipt);
        expect(f.readReceipt).toHaveBeenCalledWith('Alice', run.hintContextId, 0, requestId, expect.any(Object));
        expect((await f.post(`/crown-hints/runs/${run.runId}/hints`, { requestId, revision: 0 })).status).toBe(503);
        expect(f.requestHint).not.toHaveBeenCalled();
    });
    it('recovers durable contexts without a surviving run registry, including normalized UUID aliases', async () => {
        const f = await fixture(), contextId = randomUUID(), requestId = randomUUID();
        const receipt = { contextId, revision: 12, receiptId: randomUUID(), deliveryState: 'paid_retrievable' };
        f.readReceipt.mockResolvedValue(receipt); f.setEnabled(false); f.setBusy(true);
        const lookup = vi.spyOn(f.registry, 'read');
        const response = await f.get(`/crown-hints/receipts/${contextId.toUpperCase()}/12/${requestId.toUpperCase()}`);
        expect(response.status).toBe(200); expect(await response.json()).toEqual(receipt);
        expect(f.readReceipt).toHaveBeenCalledWith('Alice', contextId, 12, requestId, expect.any(Object));
        expect(lookup).not.toHaveBeenCalled();
        expect((await f.get(`/crown-hints/receipts/client-board/12/${requestId}`)).status).toBe(400);
    });
    it('feature OFF stops all new mutations before authentication and hint callbacks', async () => {
        const f = await fixture(), run = await f.open(); f.setEnabled(false);
        const verify = vi.spyOn(f.auth, 'verifySession');
        for (const path of ['/crown-hints/runs', `/crown-hints/runs/${run.runId}/moves`,
            `/crown-hints/runs/${run.runId}/close`, `/crown-hints/runs/${run.runId}/hints`]) {
            expect((await f.post(path, {}, 'invalid')).status).toBe(503);
        }
        expect(verify).not.toHaveBeenCalled(); expect(f.requestHint).not.toHaveBeenCalled();
        expect((await f.get(`/crown-hints/runs/${run.runId}`)).status).toBe(200);
    });
    it('validates hint IDs and route revisions and never accepts board/clock/identity fields', async () => {
        const f = await fixture(), run = await f.open(), path = `/crown-hints/runs/${run.runId}/hints`, requestId = randomUUID();
        for (const body of [{ requestId, revision: 0, userId: 'Bob' }, { requestId, revision: 0, stateHash: run.stateHash },
            { requestId, revision: 0, whiteMs: 600000 }, { requestId, revision: '0' }, { requestId: 'local', revision: 0 }]) {
            expect((await f.post(path, body)).status).toBe(400);
        }
        for (const revision of ['-1', '1e3', '0x0', '00', '1.0']) {
            expect((await f.get(`/crown-hints/receipts/${run.hintContextId}/${revision}/${requestId}`)).status).toBe(400);
        }
        expect(f.requestHint).not.toHaveBeenCalled(); expect(f.readReceipt).not.toHaveBeenCalled();
    });
    it('rejects explicit close/move while a hint purchase is pending without freezing the snapshot clock', async () => {
        const f = await fixture(), run = await f.open(), path = `/crown-hints/runs/${run.runId}`;
        const current = f.registry.hintSnapshot('Alice', run.runId, 0);
        const release = f.registry.acquireHint('Alice', run.runId, 0, current.stateHash);
        expect((await f.post(path + '/close', {})).status).toBe(409);
        expect((await f.post(path + '/moves', { operationId: randomUUID(), revision: 0, actor: 'human',
            move: getAllConcreteMoves(run.state, { playable: true })[0] })).status).toBe(409);
        expect((await (await f.get(path)).json()).whiteMs).toBeLessThanOrEqual(current.whiteMs);
        release(); release(); expect(f.registry.isBusy('Alice')).toBe(false);
        expect((await f.post(path + '/close', {})).status).toBe(200);
    });
    it('aborts work on HTTP disconnect and keeps the account write gate until the callback settles', async () => {
        const f = await fixture(), run = await f.open();
        let started!: () => void, cancelled!: () => void, completed!: () => void;
        const entered = new Promise<void>(resolve => { started = resolve; });
        const aborted = new Promise<void>(resolve => { cancelled = resolve; });
        const done = new Promise<void>(resolve => { completed = resolve; });
        f.requestHint.mockImplementation(async (_u, _id, _rev, _req, context) => {
            started(); await new Promise<void>(resolve => context.signal.addEventListener('abort', () => { cancelled(); resolve(); }, { once: true }));
            try { await context.check(); return null; } finally { completed(); }
        });
        const controller = new AbortController();
        const pending = f.post(`/crown-hints/runs/${run.runId}/hints`, { requestId: randomUUID(), revision: 0 }, f.alice, { signal: controller.signal });
        await entered; expect(() => f.accountGate.reserve('Alice', false)).toThrow('ACCOUNT_BUSY');
        controller.abort(); await expect(pending).rejects.toThrow(); await aborted; await done;
        await new Promise<void>(resolve => setImmediate(resolve));
        expect(() => f.accountGate.reserve('Alice', false)).not.toThrow(); f.accountGate.release('Alice');
    });
    it('preserves an unresolved purchase recovery code with HTTP 503', async () => {
        const f = await fixture(), run = await f.open();
        f.requestHint.mockRejectedValue(new CrownHintError('HINT_RECOVERY_PENDING'));
        const response = await f.post(`/crown-hints/runs/${run.runId}/hints`, { requestId: randomUUID(), revision: 0 });
        expect(response.status).toBe(503); expect(await response.json()).toEqual({ code: 'HINT_RECOVERY_PENDING' });
    });
    it('rejects non-JSON, oversized and malformed payloads without leaking upstream details', async () => {
        const f = await fixture(), run = await f.open(), path = `/crown-hints/runs/${run.runId}/hints`;
        expect((await f.post(path, {}, f.alice, { headers: { Authorization: `Bearer ${f.alice}`, 'Content-Type': 'text/plain' } })).status).toBe(415);
        expect((await f.post(path, { extra: 'x'.repeat(3000) })).status).toBe(413);
        expect((await f.post(path, {}, f.alice, { body: '{' })).status).toBe(400);
        f.requestHint.mockRejectedValue(new Error('secret-provider-detail'));
        const response = await f.post(path, { requestId: randomUUID(), revision: 0 });
        expect(response.status).toBe(503); expect(await response.json()).toEqual({ code: 'CROWN_UNAVAILABLE' });
    });
});
