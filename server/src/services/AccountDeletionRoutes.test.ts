import { afterEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import { RankedAuth } from './RankedAuth';
import { AccountWriteGate, deletionTicketHash, type AccountDeletionStore, type DeletionJob } from './AccountDeletion';
import { accountRequestGuard, createAccountDeletionRouter } from './AccountDeletionRoutes';
import { createProfileAvatarRouter } from './ProfileAvatarRoutes';

const servers: Server[] = [];
const ticket = 'delete_' + 'a'.repeat(64), hash = deletionTicketHash(ticket)!;
afterEach(async () => {
    await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => {
        server.closeAllConnections(); server.close(() => resolve());
    })));
});
async function fixture() {
    const jobs = new Map<string, DeletionJob>();
    const store = {
        verifyUser: vi.fn(async (): Promise<string | null> => null), ready: vi.fn(async () => true),
        blocked: vi.fn(async (id: string) => [...jobs.values()].some(job => job.user_id === id && job.phase !== 'completed')),
        begin: vi.fn(async (id: string, key: string, authId: string | null) => { jobs.set(key, { ticket_hash: key, user_id: id, auth_user_id: authId, phase: 'pending' }); }),
        job: vi.fn(async (key: string) => jobs.get(key) ?? null),
        removePhotoBatch: vi.fn(async (_key: string) => true),
        eraseData: vi.fn(async (key: string) => { jobs.get(key)!.phase = 'data_deleted'; }),
        eraseAuth: vi.fn(async (_id: string) => {}),
        finish: vi.fn(async (key: string) => { Object.assign(jobs.get(key)!, { phase: 'completed', user_id: null, auth_user_id: null }); }),
    } satisfies AccountDeletionStore;
    const auth = new RankedAuth(async () => true), gate = new AccountWriteGate();
    const busy = vi.fn(() => false), disconnect = vi.fn();
    const avatars = { verifyUser: store.verifyUser, setIcon: vi.fn(async () => '/avatars/circuit-01.svg'), setPhoto: vi.fn(async () => '') };
    const app = express();
    app.use(createAccountDeletionRouter(auth, store, gate, busy, disconnect));
    app.use(accountRequestGuard(auth, store, gate));
    app.use(createProfileAvatarRouter(auth, avatars, gate));
    const server = await new Promise<Server>(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
    servers.push(server);
    const address = server.address(); if (!address || typeof address === 'string') throw new Error('Missing local address');
    const base = 'http://127.0.0.1:' + address.port;
    const alice = (await auth.issueLegacySession('Alice', 'local-fixture'))!.token;
    const second = (await auth.issueLegacySession('Alice', 'local-fixture'))!.token;
    const bob = (await auth.issueLegacySession('Bob', 'local-fixture'))!.token;
    const send = (path: string, token: string | null = alice, body: unknown = { confirmation: 'DELETE', ticket }, signal?: AbortSignal) => fetch(base + path, {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
        body: JSON.stringify(body), signal,
    });
    return { store, auth, gate, busy, disconnect, jobs, avatars, base, alice, second, bob, send };
}
describe('self-service deletion on an isolated HTTP server', () => {
    it('capability inspection never initiates deletion', async () => {
        const f = await fixture();
        const response = await fetch(f.base + '/account/deletion/capabilities');
        expect(await response.json()).toEqual({ available: true });
        expect(response.headers.get('cache-control')).toBe('no-store');
        expect(f.store.begin).not.toHaveBeenCalled();
        f.store.ready.mockResolvedValue(false);
        expect((await f.send('/account/deletion')).status).toBe(503);
        expect(f.store.begin).not.toHaveBeenCalled();
    });
    it('rejects raw IDs, guest tokens, owner overrides and malformed confirmation', async () => {
        const f = await fixture();
        for (const token of [null, 'Alice', 'GUEST-forged', 'fake.jwt.token']) expect((await f.send('/account/deletion', token)).status).toBe(401);
        for (const body of [{ confirmation: 'yes', ticket }, { confirmation: 'DELETE', ticket, userId: 'Bob' }, { confirmation: 'DELETE', ticket: 'short' }, []]) {
            expect((await f.send('/account/deletion', f.alice, body)).status).toBe(400);
        }
        expect((await f.send('/account/deletion?userId=Bob')).status).toBe(400);
        expect(f.store.begin).not.toHaveBeenCalled();
    });
    it('deletes the authenticated owner only and revokes all their proofs', async () => {
        const f = await fixture();
        expect((await f.send('/account/deletion')).status).toBe(202);
        expect(f.store.begin).toHaveBeenCalledWith('Alice', hash, null);
        expect(f.auth.verifySession(f.alice)).toBeNull(); expect(f.auth.verifySession(f.second)).toBeNull();
        expect(f.auth.verifySession(f.bob)?.userId).toBe('Bob'); expect(f.disconnect).toHaveBeenCalledWith('Alice');
        const done = await f.send('/account/deletion/complete', ticket, { confirmation: 'DELETE' });
        expect(done.status).toBe(200); expect(await done.json()).toEqual({ phase: 'completed' });
        expect(f.gate.blocked('Alice')).toBe(false); expect(f.store.eraseAuth).not.toHaveBeenCalled();
        expect((await f.send('/account/deletion/complete', ticket, { confirmation: 'DELETE' })).status).toBe(200);
        expect(f.store.eraseData).toHaveBeenCalledOnce(); expect(f.store.finish).toHaveBeenCalledOnce();
    });
    it('requires an unguessable deletion ticket, not another user proof, for continuation', async () => {
        const f = await fixture(); await f.send('/account/deletion');
        for (const token of [null, f.bob, 'delete_' + 'b'.repeat(64)]) {
            expect((await f.send('/account/deletion/complete', token, { confirmation: 'DELETE' })).status).toBe(401);
        }
        expect(f.store.eraseData).not.toHaveBeenCalled();
    });
    it('keeps games and uploads safe by rejecting deletion while busy', async () => {
        const f = await fixture(); f.busy.mockReturnValue(true);
        expect((await f.send('/account/deletion')).status).toBe(409);
        f.busy.mockReturnValue(false); const release = f.gate.enter('Alice')!;
        expect((await f.send('/account/deletion')).status).toBe(409); release();
        expect(f.store.begin).not.toHaveBeenCalled(); expect(f.auth.verifySession(f.alice)).not.toBeNull();
    });
    it.each([true, false])('handles an uncertain begin response without reopening a committed intent (%s)', async committed => {
        const f = await fixture();
        f.store.begin.mockImplementation(async (id, key, authId) => {
            if (committed) f.jobs.set(key, { ticket_hash: key, user_id: id, auth_user_id: authId, phase: 'pending' });
            throw new Error('private upstream detail');
        });
        const response = await f.send('/account/deletion'); expect(response.status).toBe(503);
        expect(await response.text()).not.toContain('private'); expect(f.gate.blocked('Alice')).toBe(committed);
        if (committed) expect((await f.send('/account/deletion/complete', ticket, { confirmation: 'DELETE' })).status).toBe(200);
    });
    it('keeps the barrier closed when both begin and its outcome check time out', async () => {
        const f = await fixture(); f.store.begin.mockRejectedValue(new Error('timeout')); f.store.blocked.mockRejectedValue(new Error('timeout'));
        expect((await f.send('/account/deletion')).status).toBe(503);
        expect(f.gate.blocked('Alice')).toBe(true); expect(f.auth.verifySession(f.alice)).toBeNull();
    });
    it('retries Storage and Auth failures without reporting premature completion', async () => {
        const f = await fixture(); const id = '00000000-0000-4000-8000-000000000001';
        f.store.verifyUser.mockResolvedValue(id);
        expect((await f.send('/account/deletion', 'verified.jwt.token')).status).toBe(202);
        f.store.removePhotoBatch.mockRejectedValueOnce(new Error('storage down'));
        expect((await f.send('/account/deletion/complete', ticket, { confirmation: 'DELETE' })).status).toBe(503);
        expect(f.store.eraseData).not.toHaveBeenCalled();
        f.store.removePhotoBatch.mockResolvedValueOnce(false);
        expect((await f.send('/account/deletion/complete', ticket, { confirmation: 'DELETE' })).status).toBe(202);
        f.store.eraseAuth.mockRejectedValueOnce(new Error('auth down'));
        expect((await f.send('/account/deletion/complete', ticket, { confirmation: 'DELETE' })).status).toBe(503);
        expect(f.store.finish).not.toHaveBeenCalled(); expect(f.gate.blocked(id)).toBe(true);
        expect((await f.send('/account/deletion/complete', ticket, { confirmation: 'DELETE' })).status).toBe(200);
        expect(f.store.eraseData).toHaveBeenCalledOnce(); expect(f.store.eraseAuth).toHaveBeenLastCalledWith(id);
    });
    it('retains the avatar write lease after a client abort until the actual save settles', async () => {
        const f = await fixture(); let settle!: () => void;
        f.avatars.setIcon.mockImplementation(() => new Promise(resolve => { settle = () => resolve('/avatars/circuit-01.svg'); }));
        const abort = new AbortController();
        const upload = f.send('/profile/avatar/icon', f.alice, { iconId: 'circuit-01' }, abort.signal).catch(() => null);
        await vi.waitFor(() => expect(f.avatars.setIcon).toHaveBeenCalledOnce());
        abort.abort(); await upload;
        try { expect((await f.send('/account/deletion')).status).toBe(409); }
        finally { settle(); }
        await vi.waitFor(() => { f.gate.reserve('Alice', false); });
        f.gate.release('Alice');
        expect((await f.send('/account/deletion')).status).toBe(202);
    });
    it('rejects account writes while a durable deletion is pending', async () => {
        const f = await fixture(); f.jobs.set(hash, { ticket_hash: hash, user_id: 'Alice', auth_user_id: null, phase: 'pending' });
        expect((await f.send('/profile/avatar/icon', f.alice, { iconId: 'circuit-01' })).status).toBe(423);
        expect(f.avatars.setIcon).not.toHaveBeenCalled();
        expect((await f.send('/profile/avatar/icon', f.bob, { iconId: 'circuit-01' })).status).toBe(200);
    });
});
