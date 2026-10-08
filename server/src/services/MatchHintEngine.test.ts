import { afterEach, describe, expect, it, vi } from 'vitest';
import { GameEngine, type Piece } from '../game/GameEngine';
import { createInitialBoard } from '../game/quantumChess';
import { onlineHintAdvice, onlineHintHash, onlineHintState } from './MatchHintPosition';
import { searchOnlineHintPosition } from './OnlineHintSearchWorker';
import { searchCpuPracticeMove } from './CpuPracticeSearch';
import { qubeSearchProfile } from '../quantum-engine/ai/searchProfiles';

const engine = (seconds = 600, room = 'small-private-room') => new GameEngine(room, 'Alice', 'Bob', createInitialBoard(), seconds);
const resign = (version = 0) => ({ actionId: 'resign', version, playerId: 'Alice', action: { type: 'RESIGN' as const, payload: {} } });
afterEach(() => vi.useRealTimers());
describe('authoritative online hint position', () => {
    it('uses a distinct UUID even when a private room name is reused', () => {
        const a = engine(), b = engine();
        expect(a.hintContextId).toMatch(/^[0-9a-f-]{36}$/);
        expect(b.hintContextId).not.toBe(a.hintContextId);
        expect(a.getPublicState('Alice').hintContextId).toBe(a.hintContextId);
    });
    it('rejects spectators, opposite turn, stale revision, preparing and terminal positions', () => {
        const a = engine();
        expect(() => a.hintPosition('spectator', 0)).toThrow('NOT_A_PARTICIPANT');
        expect(() => a.hintPosition('Bob', 0)).toThrow('NOT_YOUR_TURN');
        expect(() => a.hintPosition('Alice', 3)).toThrow('STALE_REVISION');
        const preparing = new GameEngine('room', 'Alice', 'Bob', createInitialBoard(), 600, undefined, 0, true);
        expect(() => preparing.hintPosition('Alice', 0)).toThrow('MATCH_PREPARING');
        a.processAction(resign());
        expect(() => a.hintPosition('Alice', 1)).toThrow('SESSION_FINISHED');
    });
    it('projects public candidates only; hidden fields cannot alter worker input or hash', () => {
        const a = engine(), p = a.hintPosition('Alice', 0);
        const altered = { ...p.online!, pieces: p.online!.pieces.map(piece => ({ ...piece, trueType: 'King', privateSeed: 'hidden' })) };
        expect(onlineHintState(altered, 0)).toEqual(p.state);
        expect(onlineHintHash(altered, 0)).toBe(p.stateHash);
        expect(JSON.stringify(onlineHintState(altered, 0))).not.toContain('trueType');
        expect(p.state.pieces.every(piece => /^[wb]_[1-9][0-9]?$/.test(piece.id))).toBe(true);
        a.setPlayerName('host', 'new label');
        expect(a.hintPosition('Alice', 0).stateHash).toBe(p.stateHash);
    });
    it('preserves public optional flags without publishing internal extra fields', () => {
        const initial = createInitialBoard();
        const source = initial.pieces.map(p => ({ ...p, trueType: 'K', privateSeed: 'hidden' }));
        const a = new GameEngine('projection', 'Alice', 'Bob', { board: initial.board, pieces: source });
        expect(a.getPublicState('Alice').pieces).toStrictEqual(initial.pieces);
        expect(a.getPublicState('Bob').pieces).toStrictEqual(initial.pieces);
        expect(a.getPublicState('Alice').pieces[0]).not.toHaveProperty('promoted');
        const explicit = initial.pieces.map(p => ({ ...p, promoted: false, hasMoved: false }));
        const b = new GameEngine('explicit-flags', 'Alice', 'Bob', { board: initial.board, pieces: explicit });
        expect(b.getPublicState('Alice').pieces).toStrictEqual(explicit);
        expect(JSON.stringify(a.hintPosition('Alice', 0))).not.toContain('privateSeed');
    });
    it('retains ranked/random/private mode including CPU fallback', () => {
        const a = engine();
        expect(a.hintPosition('Alice', 0).mode).toBe('private');
        for (const mode of ['ranked', 'random'] as const) {
            a.setMatchMetadata({ mode, cpu: { side: 'joiner', rating: 1000, level: 3 } });
            expect(a.hintPosition('Alice', 0).mode).toBe(mode);
        }
    });
    it('keeps a separate mutation fence; real clocks and natural timeout continue', () => {
        vi.useFakeTimers(); vi.setSystemTime(100000);
        const a = engine(10), position = a.hintPosition('Alice', 0), release = position.acquire();
        expect(a.processAction(resign()).message).toBe('HINT_PURCHASE_PENDING');
        vi.advanceTimersByTime(2500);
        expect(a.getPublicState('Alice').clock!.white).toBe(7500);
        vi.advanceTimersByTime(7500); expect(a.checkTimeout()).toBe(true);
        expect(a.getPublicState('Alice').gameOverReason).toBe('timeout');
        release(); release();
    });
    it('does not extend an owner lease, suppress natural abandonment, or let an old release remove a new fence', () => {
        vi.useFakeTimers(); vi.setSystemTime(100000);
        const a = engine(); a.setAuthority({ canAdvance: () => Date.now() < 101000, safeUntil: () => 101000 });
        expect(a.hintPosition('Alice', 0).validUntilMs).toBe(101000);
        const release1 = a.hintPosition('Alice', 0).acquire(); release1();
        const release2 = a.hintPosition('Alice', 0).acquire(); release1();
        expect(a.processAction(resign()).message).toBe('HINT_PURCHASE_PENDING');
        expect(a.forfeit('Bob')).toBe(true); expect(a.getPublicState('Alice').gameOverReason).toBe('abandonment');
        release2();
        const b = engine(); b.setAuthority({ canAdvance: () => false, safeUntil: () => 100000 });
        expect(() => b.hintPosition('Alice', 0)).toThrow('MATCH_AUTHORITY_UNAVAILABLE');
    });
    it('independently validates the strongest search root with native online rules', () => {
        const p = engine().hintPosition('Alice', 0), budget = qubeSearchProfile(80);
        expect(budget.maxDepth).toBe(16); expect(budget.quiescenceDepth).toBe(4);
        const move = searchOnlineHintPosition(p.state, budget, p.online!);
        expect(move).not.toBeNull(); expect(p.validateMove(move!)).toMatchObject({ toRow: move!.target.row, toCol: move!.target.col });
    });
    it('uses an actual cancellable worker and returns a native-playable hint', async () => {
        const p = engine().hintPosition('Alice', 0);
        const move = await searchCpuPracticeMove(p.state, 5, new AbortController().signal, true, 'balanced', 120, p.online);
        expect(move).not.toBeNull(); expect(() => p.validateMove(move!)).not.toThrow();
    }, 8000);
    it('rejects canonical decline-promotion roots that online UI cannot play', () => {
        const pieces: Piece[] = [
            { id: 0, team: 0, x: 3, y: 6, possibilities: ['P', 'R'], captured: false, hasMoved: true },
            { id: 1, team: 0, x: 0, y: 0, possibilities: ['K'], captured: false },
            { id: 2, team: 1, x: 7, y: 7, possibilities: ['K'], captured: false },
        ];
        const board = Array<number | null>(64).fill(null); for (const p of pieces) board[p.y * 8 + p.x] = p.id;
        const online = { board, pieces, turn: 0 }, state = onlineHintState(online, 0);
        expect(() => onlineHintAdvice(online, state, { pieceId: 'w_1', target: { row: 0, col: 3 }, chosenType: 8 })).toThrow('NO_LEGAL_HINT');
        const advice = onlineHintAdvice(online, state, { pieceId: 'w_1', target: { row: 0, col: 3 }, chosenType: 1, promotionTarget: 16 });
        expect(advice.promotionTarget).toBe(16); expect(advice.declinePromotion).toBeUndefined();
    });
});
