import { beforeEach, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactNode } from 'react';
import type { MatchPreparation } from '../hooks/useMatchPreparation';
import type { RatingSettlement } from '../lib/rankedProtocol';
const h = vi.hoisted(() => ({ cursor: 0, game: null as unknown, receipt: null as RatingSettlement | null, cancelled: null as string | null, reason: null as MatchPreparation | null, startFailure: null as unknown, socket: null as unknown }));
vi.mock('../hooks/useSharedMatchChoice',()=>({useSharedMatchChoice:()=>({offer:null,pending:false,error:false,choose:()=>{},cancel:()=>{}})}));
vi.mock('react', async original => {
    const react = await original<typeof import('react')>();
    const hooks = {
        useState(initial: unknown) { const i = h.cursor++; return [i === 0 ? h.game : i === 1 ? h.startFailure : i === 3 ? h.receipt : i === 5 ? h.cancelled : typeof initial === 'function' ? initial() : initial, vi.fn()]; },
        useEffect: () => {}, useLayoutEffect: () => {}, useMemo: (factory: () => unknown) => factory(), useCallback: (callback: unknown) => callback, useRef: (initial: unknown) => ({ current: initial }),
    };
    return { ...react, ...hooks, default: { ...react, ...hooks } };
});
vi.mock('../hooks/useMatchPreparation', () => ({ useMatchPreparation: () => h.reason }));
vi.mock('../hooks/useBoardPreferences', () => ({ useBoardPreferences: () => ({ victoryEffect: '', is2DView: true }) }));
vi.mock('../lib/SocketContext', () => ({ useSocket: () => ({ socket: h.socket, isConnected: true, connectionError: null }) }));
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
vi.mock('./MatchLayout', () => ({ MatchLayout: ({ children }: { children: ReactNode }) => children }));
import OnlineGameBoard from './OnlineGameBoard';
import { MatchLayout } from './MatchLayout';
import { rankedRecoveryText } from '../locales/rankedRecoveryText';
import { serviceText } from '../locales/serviceText';
import { dict } from '../locales/dict';
const render = () => { h.cursor = 0; return OnlineGameBoard({ lang: 'ja', user: { id: 'Alice', name: 'Alice', type: 'registered' }, roomId: 'match-a', matchMode: 'ranked', onlineRole: 'white' }); };
const game = { matchId: 'match-a', pieces: [], board: [], turn: 0, players: { host: 'Alice', joiner: 'Bob' }, clock: { white: 600000, black: 600000 }, gameOver: null };
beforeEach(() => { h.cursor = 0; h.game = null; h.receipt = null; h.cancelled = null; h.reason = null; h.startFailure = null; h.socket = null; });
it('shows reason-specific accessible status before start and over an existing frozen board', () => {
    for (const reason of ['admitting', 'recovering', 'unavailable', 'checking'] as const) {
        h.reason = reason;
        for (const snapshot of [null, game]) {
            h.game = snapshot; const node = render(); const html = renderToStaticMarkup(node);
            expect(node.type).not.toBe(MatchLayout); expect(html).toContain('role="status"'); expect(html).toContain(rankedRecoveryText('ja')[reason]);
        }
    }
    h.reason = null; h.game = game; expect(render().type).toBe(MatchLayout);
});
it('shows recovered settlement and an exit without requiring an engine snapshot', () => {
    h.receipt = { matchId: 'match-a', userId: 'Alice', before: 1000, after: 1004, delta: 4, timeControl: 600 };
    for (const snapshot of [null, game]) {
        h.game = snapshot; const html = renderToStaticMarkup(render());
        expect(html).toContain(rankedRecoveryText('ja').settled); expect(html).toContain('1000'); expect(html).toContain('1004'); expect(html).toContain('<button');
    }
    h.cancelled = 'match-a'; expect(renderToStaticMarkup(render())).toContain(rankedRecoveryText('ja').settled);
});
it('shows cancellation instead of leaving the user in recovery, and ignores another match receipt', () => {
    h.reason = 'recovering'; h.cancelled = 'match-a';
    expect(renderToStaticMarkup(render())).toContain('対局を中止しました');
    h.cancelled = null; h.receipt = { matchId: 'other', userId: 'Alice', before: 1000, after: 1004, delta: 4, timeControl: 600 };
    expect(renderToStaticMarkup(render())).toContain(rankedRecoveryText('ja').recovering);
});
it('does not invent a recovered result before the room ID or a receipt exists', () => {
    h.cursor = 0;
    const html = renderToStaticMarkup(OnlineGameBoard({ lang: 'ja' }));
    expect(html).not.toContain(rankedRecoveryText('ja').settled);
    expect(html).toContain('サーバーと対局データを同期中');
});

it('shows an initial room-scoped admission error with explicit same-room retry', () => {
    const socket = { id: 'fixture-socket' }; h.socket = socket;
    h.startFailure = { roomId: 'match-a', socket, code: 'AUTH_UNAVAILABLE' };
    const html = renderToStaticMarkup(render());
    expect(html).toContain('data-match-start-error="AUTH_UNAVAILABLE"');
    expect(html).toContain('data-match-start-retry');
    expect(html).toContain('対局を開始できませんでした');
    expect(html).not.toContain('サーバーと対局データを同期中');
    h.game = game; expect(render().type).toBe(MatchLayout);
});
it('ignores an old room or socket error and does not expose arbitrary failure payloads', () => {
    const socket = { id: 'current-socket' }; h.socket = socket;
    for (const failure of [
        { roomId: 'other', socket, code: 'AUTH_UNAVAILABLE' },
        { roomId: 'match-a', socket: { id: 'old-socket' }, code: 'AUTH_UNAVAILABLE' },
    ]) {
        h.startFailure = failure;
        expect(renderToStaticMarkup(render())).not.toContain('data-match-start-error');
    }
    h.startFailure = { roomId: 'match-a', socket, code: 'private_account_id_or_token' };
    const html = renderToStaticMarkup(render());
    expect(html).toContain('data-match-start-error="QUEUE_FAILED"');
    expect(html).not.toContain('private_account_id_or_token');
});
it('shows the update requirement with an exit instead of retrying an incompatible room request', () => {
    const socket = { id: 'fixture-socket' }; h.socket = socket;
    h.startFailure = { roomId: 'match-a', socket, code: 'UPDATE_REQUIRED' };
    for (const lang of ['ja', 'en'] as const) {
        h.cursor = 0;
        const html = renderToStaticMarkup(OnlineGameBoard({ lang, user: { id: 'Alice', name: 'Alice', type: 'registered' }, roomId: 'match-a', matchMode: 'private', onlineRole: 'white' }));
        expect(html).toContain('data-match-start-error="UPDATE_REQUIRED"');
        expect(html).toContain(serviceText(lang, 'update'));
        expect(html).not.toContain('data-match-start-retry');
        expect(html).toContain(dict[lang].home);
        expect(html).toContain('<button');
    }
});
it('prioritizes a definitive cancellation over an earlier admission error', () => {
    const socket = { id: 'fixture-socket' }; h.socket = socket;
    h.startFailure = { roomId: 'match-a', socket, code: 'AUTH_UNAVAILABLE' }; h.cancelled = 'match-a';
    const html = renderToStaticMarkup(render());
    expect(html).toContain('対局を中止しました'); expect(html).not.toContain('data-match-start-retry');
});
