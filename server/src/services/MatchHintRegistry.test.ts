import { afterEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { GameEngine } from '../game/GameEngine';
import { createInitialBoard } from '../game/quantumChess';
import { MatchHintRegistry, crownHintAuthority } from './MatchHintRegistry';
import { CrownHintRegistry } from './CrownHintRegistry';
import { getConcreteMoveChildren } from '../quantum-engine/ai/random';
import { MatchHintService } from './MatchHintService';
import type { HintLedger } from './MatchHintTypes';
import type { MatchSession } from '../matchmaking/MatchmakingService';

function matchSource() {
    const engine = new GameEngine('private-room', 'Alice', 'Bob', createInitialBoard());
    const match: MatchSession = { matchId: 'private-room', timeControl: 600, engine, state: 'IN_GAME',
        players: { host: 'Alice', joiner: 'Bob' }, playerNames: {}, connected: { host: true, joiner: true }, createdAt: Date.now() };
    let online = true, reconnect = false, checking = false, ownership = true, currentMatchId = match.matchId;
    const matches = { getMatch: (id: string) => id === match.matchId ? match : undefined,
        getPlayerSession: (id: string) => ({ userId: id, socketId: 'socket', state: 'IN_GAME', currentMatchId }),
        awaitingReconnect: () => reconnect, authorityCheckPending: () => checking };
    const registry = new MatchHintRegistry(matches as never, () => ownership, () => online);
    return { engine, match, registry, online: (v: boolean) => { online = v; }, reconnect: (v: boolean) => { reconnect = v; },
        checking: (v: boolean) => { checking = v; }, ownership: (v: boolean) => { ownership = v; }, current: (v: string) => { currentMatchId = v; } };
}
afterEach(() => vi.useRealTimers());
describe('trusted online and Crown context binding', () => {
    it('binds context to participant and current connected match', () => {
        const x = matchSource();
        expect(x.registry.contextId('Alice', 'private-room')).toBe(x.engine.hintContextId);
        expect(() => x.registry.position('visitor', 'private-room', 0)).toThrow('NOT_A_PARTICIPANT');
        expect(() => x.registry.contextId('Alice', 'other-room')).toThrow('NOT_A_PARTICIPANT');
        x.current('another-match'); expect(() => x.registry.position('Alice', 'private-room', 0)).toThrow('RECONNECT_REQUIRED');
    });
    it('uses authoritative session mode even when private display metadata defaults to random', () => {
        const x = matchSource();
        x.engine.setMatchMetadata({ mode: 'random' });
        expect(x.registry.position('Alice', 'private-room', 0).mode).toBe('private');
        for (const mode of ['random', 'ranked'] as const) {
            x.match.mode = mode;
            x.engine.setMatchMetadata({ mode, cpu: { side: 'joiner', rating: 1000, level: 3 } });
            expect(x.registry.position('Alice', 'private-room', 0).mode).toBe(mode);
        }
    });
    it('refuses disconnected, awaiting reconnect, pending authority and expired ownership', () => {
        const x = matchSource();
        x.online(false); expect(() => x.registry.position('Alice', 'private-room', 0)).toThrow('RECONNECT_REQUIRED'); x.online(true);
        x.reconnect(true); expect(() => x.registry.position('Alice', 'private-room', 0)).toThrow('RECONNECT_REQUIRED'); x.reconnect(false);
        x.match.connected.host = false; expect(() => x.registry.position('Alice', 'private-room', 0)).toThrow('RECONNECT_REQUIRED'); x.match.connected.host = true;
        x.checking(true); expect(() => x.registry.position('Alice', 'private-room', 0)).toThrow('MATCH_AUTHORITY_UNAVAILABLE'); x.checking(false);
        x.ownership(false); expect(() => x.registry.position('Alice', 'private-room', 0)).toThrow('MATCH_AUTHORITY_UNAVAILABLE');
    });
    it('allows context lookup for a finished match, but prevents a new purchase position', () => {
        const x = matchSource(); x.match.state = 'FINISHED';
        expect(x.registry.contextId('Alice', 'private-room')).toBe(x.engine.hintContextId);
        expect(() => x.registry.position('Alice', 'private-room', 0)).toThrow('SESSION_FINISHED');
    });
    it('adapts seeded Crown state to the same purchase service without granting entry or accepting a board', async () => {
        vi.useFakeTimers(); vi.setSystemTime(100000);
        const crown = new CrownHintRegistry(), runId = randomUUID(), opening = crown.open('Alice', runId, 3, 'white');
        const authority = crownHintAuthority(crown), p = authority.position('Alice', runId, 0);
        expect(p.contextId).toBe(opening.hintContextId); expect(p.contextId).not.toBe(runId);
        expect(p.kind).toBe('crown'); expect(p.mode).toBe('crown'); expect(p.remainingMs).toBe(10000);
        let resolveBuy!: (receipt: any) => void, dispatched!: () => void;
        const started = new Promise<void>(r => { dispatched = r; });
        let intent: any;
        const ledger: HintLedger = { readClock: async () => Date.now(), readReceipt: async () => null, readExisting: async () => null,
            buy: input => { intent = input; dispatched(); return new Promise(r => { resolveBuy = r; }); } };
        const service = new MatchHintService(ledger, authority, () => true, async position => getConcreteMoveChildren(position.state, { playable: true })[0].move);
        const pending = service.requestHint('Alice', runId, 0, randomUUID(), { signal: new AbortController().signal, async check() {} });
        await started;
        expect(crown.isBusy('Alice')).toBe(true);
        expect(() => crown.close('Alice', runId)).toThrow('HINT_PURCHASE_PENDING');
        vi.setSystemTime(102000); expect(crown.read('Alice', runId).whiteMs).toBe(8000);
        resolveBuy({ receiptId: randomUUID(), contextId: p.contextId, kind: 'crown', mode: 'crown', revision: 0,
            stateHash: p.stateHash, rulesVersion: p.rulesVersion, move: intent.move, hint: intent.hint, deliveryState: 'paid_retrievable' });
        expect((await pending).contextId).toBe(p.contextId);
        expect(crown.isBusy('Alice')).toBe(false); expect(service.isBusy('Alice')).toBe(false);
    });
});
