import { describe, expect, it, vi } from 'vitest';
import { CrownHintRegistry, CrownHintError } from '../../server/src/services/CrownHintRegistry';
import { getAllConcreteMoves } from '../quantum-engine/ai/random';
import { CrownHintRunClient, type CrownRunSettings, type CrownRunSnapshot } from './crownHintRun';
import { PaidHintClient, PaidHintError, readCrownHintRecovery, type HintReceipt, type HintRequest } from './paidHints';

function storage() {
    const values = new Map<string, string>();
    return { values, getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => { values.set(key, value); } };
}
const settings = (stageId = 1): CrownRunSettings => ({ runId: crypto.randomUUID(), stageId, playerSide: 'white' });
const pendingKey = (user = 'Alice') => `qg_crown_close_v1:${encodeURIComponent(user)}`;
function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>(done => { resolve = done; });
    return { promise, resolve };
}
function fixture() {
    let now = 1_000;
    const registry = new CrownHintRegistry({ now: () => now });
    const saved = storage();
    const transport: HintRequest = async (user, path, body) => {
        try {
            if (path === '/crown-hints/runs') {
                const run = body as CrownRunSettings;
                return registry.open(user, run.runId, run.stageId, run.playerSide);
            }
            const match = /^\/crown-hints\/runs\/([^/]+)(?:\/(close|moves))?$/.exec(path);
            if (!match) throw new Error(`Unexpected endpoint: ${path}`);
            if (match[2] === 'close') return registry.close(user, match[1]);
            if (match[2] === 'moves') {
                const move = body as { revision: number; operationId: string; actor: string; move: unknown };
                return registry.advance(user, match[1], move.revision, move.operationId, move.actor, move.move);
            }
            return registry.read(user, match[1]);
        } catch (error) {
            if (error instanceof CrownHintError) throw new PaidHintError(error.code);
            throw error;
        }
    };
    const send = vi.fn(transport);
    const client = (config = settings(), user = 'Alice', request = send) => new CrownHintRunClient(user, config, request, saved);
    return { registry, saved, send, transport, client, advanceTime: (ms: number) => { now += ms; } };
}

describe('Crown abandoned-run recovery with the real client and registry', () => {
    it('closes a server-accepted open after its reply is lost and permits a fresh run immediately', async () => {
        const f = fixture(), config = settings();
        const send = vi.fn<HintRequest>(async (...args) => {
            const value = await f.transport(...args);
            if (args[1] === '/crown-hints/runs' && (args[2] as CrownRunSettings).runId === config.runId) throw new Error('open reply lost');
            return value;
        });
        const client = f.client(config, 'Alice', send), lease = client.retain();
        await expect(client.open()).rejects.toThrow('open reply lost');
        expect(f.registry.read('Alice', config.runId).status).toBe('active');
        await lease.release();
        expect(f.registry.read('Alice', config.runId)).toMatchObject({ status: 'finished', finishReason: 'closed', whiteMs: 600_000 });
        expect((await f.client().open()).status).toBe('active');
        expect(JSON.parse(f.saved.getItem(pendingKey())!)).toEqual([]);
    });

    it.each(['before', 'after'] as const)('recovers a close failure %s server acceptance after the component has gone', async phase => {
        const f = fixture(), config = settings();
        let lost = true;
        const send = vi.fn<HintRequest>(async (...args) => {
            if (lost && args[1].endsWith('/close')) {
                lost = false;
                if (phase === 'after') await f.transport(...args);
                throw new Error('close reply lost');
            }
            return f.transport(...args);
        });
        const client = f.client(config, 'Alice', send), lease = client.retain();
        await client.open();
        await expect(lease.release()).rejects.toThrow('close reply lost');
        expect(JSON.parse(f.saved.getItem(pendingKey())!)).toEqual([config]);
        const next = f.client();
        expect((await next.open()).status).toBe('active');
        expect(f.send.mock.calls.map(call => call[1])).toEqual([`/crown-hints/runs/${config.runId}/close`, '/crown-hints/runs']);
        expect(f.registry.read('Alice', config.runId).status).toBe('finished');
    });

    it('settles close-before-open ordering without leaving a late accepted open active', async () => {
        const f = fixture(), config = settings(), delayed = deferred<void>();
        let first = true;
        const send = vi.fn<HintRequest>(async (...args) => {
            if (args[1] === '/crown-hints/runs' && first) { first = false; await delayed.promise; }
            return f.transport(...args);
        });
        const client = f.client(config, 'Alice', send), lease = client.retain(), controller = new AbortController();
        const opening = client.open(controller.signal);
        const rejected = expect(opening).rejects.toMatchObject({ name: 'AbortError' });
        controller.abort();
        await lease.release();
        expect(send.mock.calls.map(call => call[1])).toEqual(['/crown-hints/runs', `/crown-hints/runs/${config.runId}/close`, '/crown-hints/runs', `/crown-hints/runs/${config.runId}/close`]);
        delayed.resolve();
        await rejected;
        expect(f.registry.read('Alice', config.runId).status).toBe('finished');
        expect((await f.client().open()).status).toBe('active');
    });

    it('reuses the same live run after a lost reply without resetting history, identity or clock', async () => {
        const f = fixture(), config = settings();
        const send = vi.fn<HintRequest>(async (...args) => { await f.transport(...args); throw new Error('lost'); });
        await expect(f.client(config, 'Alice', send).open()).rejects.toThrow('lost');
        const accepted = f.registry.read('Alice', config.runId);
        f.advanceTime(4_000);
        const reopened = await f.client(config).open();
        expect(reopened).toMatchObject({ hintContextId: accepted.hintContextId, revision: 0, history: [], whiteMs: 596_000 });
        const move = getAllConcreteMoves(reopened.state)[0];
        const moved = await f.client(config).advance(0, 'human', move);
        f.advanceTime(3_000);
        expect(await f.client(config).open()).toMatchObject({ hintContextId: accepted.hintContextId, revision: 1, history: moved.history, whiteMs: moved.whiteMs, blackMs: 597_000 });
    });

    it('does not resurrect the same run ID after the user explicitly left it', async () => {
        const f = fixture(), config = settings(), client = f.client(config), lease = client.retain();
        const first = await client.open();
        await lease.release();
        expect(await f.client(config).open()).toMatchObject({ hintContextId: first.hintContextId, status: 'finished' });
        expect((await f.client().open()).status).toBe('active');
    });

    it('ignores old cleanup after StrictMode effect replay or same-run ownership replacement', async () => {
        const f = fixture(), config = settings(), client = f.client(config), old = client.retain();
        await client.open();
        const cleanup = old.release(), replacement = client.retain();
        await cleanup;
        expect(f.registry.read('Alice', config.runId).status).toBe('active');
        const newerClient = f.client(config), newer = newerClient.retain();
        await newerClient.open();
        await replacement.release();
        await old.close();
        expect(f.send.mock.calls.filter(call => call[1].endsWith('/close'))).toHaveLength(0);
        await newer.release();
        expect(f.registry.read('Alice', config.runId).status).toBe('finished');
    });

    it('does not create or close a run when the board leaves before intro/open', async () => {
        const f = fixture(), lease = f.client().retain();
        await lease.release();
        expect(f.send).not.toHaveBeenCalled();
        expect(f.saved.values.size).toBe(0);
    });

    it('never closes the new run when old cleanup is called again', async () => {
        const f = fixture(), oldClient = f.client(), oldLease = oldClient.retain();
        await oldClient.open(); await oldLease.release();
        const current = f.client(), lease = current.retain();
        await current.open();
        await oldLease.release(); await oldLease.close();
        expect(f.registry.read('Alice', current.settings.runId).status).toBe('active');
        await lease.release();
    });

    it('separates users and refuses a wrong owner instead of closing that owner’s live run', async () => {
        const f = fixture(), alice = f.client(), lease = alice.retain();
        await alice.open();
        const bob = f.client(alice.settings, 'Bob');
        await expect(bob.read()).rejects.toThrow('SESSION_NOT_FOUND');
        expect(await bob.close()).toBeNull();
        expect(f.registry.read('Alice', alice.settings.runId).status).toBe('active');
        expect(f.saved.getItem(pendingKey('Alice'))).toBeNull();
        expect(JSON.parse(f.saved.getItem(pendingKey('Bob'))!)).toEqual([]);
        expect((await f.client(settings(), 'Bob').open()).status).toBe('active');
        await lease.release();
    });

    it('does not adopt a late response after abort and leaves cleanup retriable after auth expires', async () => {
        const f = fixture(), delayed = deferred<void>(), config = settings();
        let signedIn = true;
        const send = vi.fn<HintRequest>(async (...args) => {
            if (!signedIn) throw new PaidHintError('AUTH_REQUIRED');
            const result = await f.transport(...args);
            if (args[1] === '/crown-hints/runs') await delayed.promise;
            return result;
        });
        const client = f.client(config, 'Alice', send), lease = client.retain(), abort = new AbortController();
        const opening = client.open(abort.signal);
        const rejected = expect(opening).rejects.toMatchObject({ name: 'AbortError' });
        await Promise.resolve();
        signedIn = false; abort.abort();
        await expect(lease.release()).rejects.toThrow('AUTH_REQUIRED');
        delayed.resolve(); await rejected;
        expect(JSON.parse(f.saved.getItem(pendingKey())!)).toEqual([config]);
        expect((await f.client().open()).status).toBe('active');
        expect(f.registry.read('Alice', config.runId).status).toBe('finished');
    });

    it.each(['AUTH_REQUIRED', 'offline'])('retains cleanup when absence is followed by repeated %s failures', async code => {
        const f = fixture(), config = settings();
        const send = vi.fn<HintRequest>(async (...args) => {
            if (args[1] === '/crown-hints/runs') throw code === 'AUTH_REQUIRED' ? new PaidHintError(code) : new Error(code);
            return f.transport(...args);
        });
        await expect(f.client(config, 'Alice', send).close()).rejects.toThrow(code);
        await expect(f.client(settings(), 'Alice', send).open()).rejects.toThrow(code);
        expect(JSON.parse(f.saved.getItem(pendingKey())!)).toEqual([config]);
        expect((await f.client().open()).status).toBe('active');
    });

    it('reconciles an expired or missing process-local run before a fresh entry', async () => {
        const f = fixture(), client = f.client(settings(3)), lease = client.retain();
        await client.open(); f.advanceTime(31_000);
        const resumed = await client.read();
        expect(resumed).toMatchObject({ status: 'finished', whiteMs: 0, state: { winner: 'black' } });
        await lease.release();
        // Registry restart: only the durable abandoned intent survives.
        const stale = settings(); f.saved.setItem(pendingKey(), JSON.stringify([stale]));
        expect((await f.client().open()).status).toBe('active');
        expect(f.registry.read('Alice', stale.runId).status).toBe('finished');
    });

    it('reads elapsed server time on background return without reopening or resetting the clock', async () => {
        const f = fixture(), client = f.client(settings(3));
        const run = await client.open(); f.advanceTime(4_000);
        expect(await client.read()).toMatchObject({ hintContextId: run.hintContextId, whiteMs: 26_000, status: 'active' });
        f.advanceTime(27_000);
        expect(await client.read()).toMatchObject({ hintContextId: run.hintContextId, whiteMs: 0, status: 'finished' });
        expect(f.send.mock.calls.map(call => call[1])).toEqual(['/crown-hints/runs', `/crown-hints/runs/${run.runId}`, `/crown-hints/runs/${run.runId}`]);
    });

    it('does not dispatch a new open when unmounted while older cleanup is still pending', async () => {
        const f = fixture(), old = f.client(), oldRun = await old.open(), barrier = deferred<void>();
        f.saved.setItem(pendingKey(), JSON.stringify([old.settings]));
        const send = vi.fn<HintRequest>(async (...args) => { await barrier.promise; return f.transport(...args); });
        const next = f.client(settings(), 'Alice', send), lease = next.retain(), abort = new AbortController();
        const pending = next.open(abort.signal), rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
        abort.abort(); await lease.release(); barrier.resolve(); await rejected;
        expect(send.mock.calls.map(call => call[1])).toEqual([`/crown-hints/runs/${oldRun.runId}/close`]);
        expect(f.saved.getItem(`qg_crown_run_v1:Alice:${next.settings.runId}`)).toBeNull();
        expect((await f.client().open()).status).toBe('active');
    });

    it('does not release a purchase fence when a timed-out run is closed', async () => {
        const f = fixture(), client = f.client(settings(3)), run = await client.open(), lease = client.retain();
        const release = f.registry.acquireHint('Alice', run.runId, 0, run.stateHash);
        f.advanceTime(31_000); await lease.release();
        expect(f.registry.read('Alice', run.runId).status).toBe('finished');
        expect(f.registry.isBusy('Alice')).toBe(true);
        await expect(f.client().open()).rejects.toThrow('ACCOUNT_BUSY');
        release(); expect((await f.client().open()).status).toBe('active');
    });

    it('preserves move operation IDs and rejects stale revisions through recovery', async () => {
        const f = fixture(), client = f.client(), run = await client.open(), move = getAllConcreteMoves(run.state)[0];
        let lost = true;
        const send = vi.fn<HintRequest>(async (...args) => {
            const result = await f.transport(...args);
            if (lost && args[1].endsWith('/moves')) { lost = false; throw new Error('move reply lost'); }
            return result;
        });
        const old = f.client(client.settings, 'Alice', send);
        await expect(old.advance(0, 'human', move)).rejects.toThrow('move reply lost');
        const restored = f.client(client.settings, 'Alice', send);
        expect(await restored.advance(0, 'human', move)).toMatchObject({ revision: 1 });
        expect(send.mock.calls[0][2]).toEqual(send.mock.calls[1][2]);
        await expect(restored.advance(0, 'human', { ...move, target: { row: 3, col: 3 } })).rejects.toThrow('STALE_REVISION');
        expect(f.registry.read('Alice', run.runId).history).toHaveLength(1);
    });

    it('keeps an uncertain purchase fenced and recovers its saved receipt without another buy', async () => {
        const f = fixture(), client = f.client(), run = await client.open(), lease = client.retain();
        const context = { kind: 'crown' as const, mode: 'crown' as const, runId: run.runId, contextId: run.hintContextId, rulesVersion: 'quantum-crown-v1' as const };
        const receipt: HintReceipt = { receiptId: crypto.randomUUID(), contextId: run.hintContextId, kind: 'crown', mode: 'crown', revision: 0,
            stateHash: run.stateHash, rulesVersion: context.rulesVersion, deliveryState: 'paid_retrievable',
            hint: { fromRow: 6, fromCol: 0, toRow: 5, toCol: 0 }, move: { pieceId: 'w_17', target: { row: 5, col: 0 }, chosenType: 32 } };
        const release = f.registry.acquireHint('Alice', run.runId, 0, run.stateHash);
        const hintSend = vi.fn<HintRequest>(async (_user, _path, body) => { if (body !== undefined) throw new Error('purchase reply lost'); return receipt; });
        const hint = new PaidHintClient('Alice', context, hintSend, f.saved);
        await expect(hint.buy(0)).rejects.toThrow('purchase reply lost');
        const preserved = new Map([...f.saved.values].filter(([key]) => /qg_(paid_hint|last_crown_hint)/.test(key)));
        await expect(lease.release()).rejects.toThrow('HINT_PURCHASE_PENDING');
        await expect(f.client().open()).rejects.toThrow('HINT_PURCHASE_PENDING');
        expect(f.registry.isBusy('Alice')).toBe(true);
        expect(new Map([...f.saved.values].filter(([key]) => /qg_(paid_hint|last_crown_hint)/.test(key)))).toEqual(preserved);
        const recovery = readCrownHintRecovery('Alice', f.saved)!;
        expect(await new PaidHintClient('Alice', recovery.context, hintSend, f.saved).recover(recovery.attempt.revision)).toEqual(receipt);
        expect(hintSend.mock.calls.filter(call => call[2] !== undefined)).toHaveLength(1);
        release();
        const laterRelease = f.registry.acquireHint('Alice', run.runId, 0, run.stateHash);
        release(); // A stale owner cannot release the new receipt fence.
        await expect(f.client().open()).rejects.toThrow('HINT_PURCHASE_PENDING');
        laterRelease();
        expect((await f.client().open()).status).toBe('active');
        expect(new Map([...f.saved.values].filter(([key]) => /qg_(paid_hint|last_crown_hint)/.test(key)))).toEqual(preserved);
    });

    it.each(['malformed', 'unwritable'] as const)('fails closed when the cleanup queue is %s', async mode => {
        const f = fixture();
        if (mode === 'malformed') f.saved.setItem(pendingKey(), 'broken');
        const store = mode === 'unwritable' ? { getItem: () => null, setItem: () => {} } : f.saved;
        await expect(new CrownHintRunClient('Alice', settings(), f.send, store).open()).rejects.toThrow('REQUEST_STORAGE_UNAVAILABLE');
        expect(f.send).not.toHaveBeenCalled();
    });

    it('retains pending cleanup on an invalid terminal acknowledgement', async () => {
        const f = fixture(), client = f.client(), run = await client.open();
        const invalid = f.client(client.settings, 'Alice', vi.fn<HintRequest>(async () => run));
        await expect(invalid.close()).rejects.toThrow('HINT_RESPONSE_INVALID');
        expect(JSON.parse(f.saved.getItem(pendingKey())!)).toEqual([client.settings]);
        expect((await f.client().open()).status).toBe('active');
    });
});
