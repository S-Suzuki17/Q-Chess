import { beforeEach, expect, it, vi } from 'vitest';
import type { MatchStats } from '../lib/playGameStats';
import type { MatchHintContext } from '../lib/paidHints';

const h = vi.hoisted(() => ({ stateIndex: 0, memoIndex: 0, memos: [] as { deps: unknown[]; value: unknown }[], game: null as any, stats: null as MatchStats | null, context: null as MatchHintContext | null }));
vi.mock('react', async original => {
    const react = await original<typeof import('react')>();
    const hooks = {
        useState(initial: unknown) { return [h.stateIndex++ === 0 ? h.game : typeof initial === 'function' ? initial() : initial, vi.fn()]; },
        useEffect: () => {}, useLayoutEffect: () => {}, useRef: (initial: unknown) => ({ current: initial }),
        useCallback: (callback: unknown) => callback,
        useMemo(factory: () => unknown, deps: unknown[]) {
            const i = h.memoIndex++, previous = h.memos[i];
            if (!previous || deps.some((value, j) => !Object.is(value, previous.deps[j]))) h.memos[i] = { deps, value: factory() };
            return h.memos[i].value;
        },
    };
    return { ...react, ...hooks, default: { ...react, ...hooks } };
});
vi.mock('../hooks/usePlayGameStatsMatch', () => ({ usePlayGameStatsMatch: (stats: MatchStats | null) => { h.stats = stats; } }));
vi.mock('../hooks/useTicketHint', () => ({ useTicketHint: (input: { context: MatchHintContext | null }) => { h.context = input.context; return { pending: false, hintMove: null }; } }));
vi.mock('../hooks/useMatchPreparation', () => ({ useMatchPreparation: () => null }));
vi.mock('../hooks/useSharedMatchChoice', () => ({ useSharedMatchChoice: () => ({ offer: null, pending: false, error: false }) }));
vi.mock('../hooks/useBoardPreferences', () => ({ useBoardPreferences: () => ({ victoryEffect: '', is2DView: true }) }));
vi.mock('../hooks/useAndroidBack', () => ({ useAndroidBackHandler: () => {} }));
vi.mock('../lib/SocketContext', () => ({ useSocket: () => ({ socket: null, isConnected: true, connectionError: null }) }));
vi.mock('../lib/supabaseClient', () => ({ supabase: {} }));
vi.mock('../lib/SoundService', () => ({ soundManager: {} }));
vi.mock('../lib/engagementMetrics', () => ({ recordMatchStarted: vi.fn(), recordMatchCompleted: vi.fn() }));
vi.mock('../lib/onlineMovement', () => ({ filterPossibilities: () => [], onlineKingInCheck: () => false }));
vi.mock('./Board3D', () => ({ Board3D: () => null }));
vi.mock('./Board2D', () => ({ Board2D: () => null }));
vi.mock('./QuantumPieceUI', () => ({ QuantumPieceUI: () => null }));
vi.mock('./MatchIntro', () => ({ MatchIntro: () => null }));
vi.mock('./MatchResultDialog', () => ({ MatchResultDialog: () => null }));
vi.mock('./RankedLoginDialog', () => ({ RankedLoginDialog: () => null }));
vi.mock('./MatchLayout', () => ({ MatchLayout: () => null }));
import OnlineGameBoard from './OnlineGameBoard';

const firstContext = '00000000-0000-4000-8000-000000000001';
function render(mode: 'ranked' | 'random' | 'private' = 'ranked', room = 'room-a', side: 'white' | 'black' = 'white') {
    h.stateIndex = 0; h.memoIndex = 0;
    OnlineGameBoard({ lang: 'en', user: { id: side === 'white' ? 'Alice' : 'Bob', name: 'Player', type: 'registered' }, roomId: room, onlineRole: side, matchMode: mode });
    return h.context;
}
beforeEach(() => {
    h.memos = []; h.context = null; h.stats = null;
    h.game = { matchId: 'room-a', pieces: [], board: [], turn: 0, players: { host: 'Alice', joiner: 'Bob' }, clock: { white: 600000, black: 600000 }, version: 0, gameOver: null, hintContextId: firstContext, mode: 'ranked' };
});
it('keeps a purchased-hint context stable across clock and position snapshots', () => {
    const context = render();
    expect(context?.contextId).toBe(firstContext);
    h.game = { ...h.game, clock: { white: 599000, black: 600000 }, receivedAt: 1000 };
    expect(render()).toBe(context);
    h.game = { ...h.game, version: 1, turn: 1, board: [...h.game.board], pieces: [...h.game.pieces] };
    expect(render()).toBe(context);
});
it('changes the purchase boundary when the authoritative context or room changes', () => {
    const original = render();
    h.game = { ...h.game, hintContextId: '00000000-0000-4000-8000-000000000002' };
    const replaced = render();
    expect(replaced).not.toBe(original);
    expect(replaced?.contextId).toBe(h.game.hintContextId);
    expect(render('ranked', 'room-b')?.matchId).toBe('room-b');
});
it('retains the original private purchase mode despite legacy random display metadata', () => {
    h.game = { ...h.game, mode: 'random' };
    const context = render('private');
    expect(context?.mode).toBe('private');
    expect(render('random')).not.toBe(context);
    expect(h.context?.mode).toBe('random');
});
it('does not expose a paid context without a valid authoritative identifier', () => {
    render();
    for (const hintContextId of [undefined, null, '', 'invalid-context']) {
        h.game = { ...h.game, hintContextId };
        expect(render()).toBeNull();
    }
});

it('reports the server clock for a private joiner whose initial screen falls back to ten minutes', () => {
    h.game = { ...h.game, moveCount: 4, gameOver: 'BLACK', gameOverReason: 'timeout', clock: { timeControl: 180000 } };
    render('private', 'room-a', 'black');
    expect(h.stats).toMatchObject({ mode: 'private', result: 'win', timeControl: '3m', checkmate: false, playerMoves: 2 });
    h.game = { ...h.game, clock: { timeControl: 30000 } };
    render('private', 'room-a', 'black');
    expect(h.stats).toMatchObject({ timeControl: '10s' });
});
