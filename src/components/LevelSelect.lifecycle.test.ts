import { beforeEach, expect, it, vi } from 'vitest';
import { isValidElement, type ReactNode } from 'react';

// A deterministic render/commit boundary: discarded renders never run layout effects.
const h = vi.hoisted(() => ({ cursor: 0, slots: [] as any[], pending: new Map<number, { effect: () => void | (() => void); deps: unknown[] }>() }));
vi.mock('react', async original => {
    const react = await original<typeof import('react')>();
    const memo = (factory: () => unknown, deps: unknown[]) => {
        const i = h.cursor++, previous = h.slots[i];
        if (!previous || deps.some((value, j) => !Object.is(value, previous.deps[j]))) h.slots[i] = { deps, value: factory() };
        return h.slots[i].value;
    };
    const hooks = {
        useState(initial: unknown) {
            const i = h.cursor++;
            if (!h.slots[i]) {
                const cell = { value: typeof initial === 'function' ? initial() : initial, set: (_value: unknown) => {} };
                cell.set = value => { cell.value = typeof value === 'function' ? value(cell.value) : value; };
                h.slots[i] = cell;
            }
            return [h.slots[i].value, h.slots[i].set];
        },
        useRef(initial: unknown) { const i = h.cursor++; return h.slots[i] ??= { current: initial }; },
        useMemo: memo,
        useCallback: (callback: unknown, deps: unknown[]) => memo(() => callback, deps),
        useEffect: () => { h.cursor++; },
        useLayoutEffect(effect: () => void | (() => void), deps: unknown[]) {
            const i = h.cursor++, previous = h.slots[i];
            if (!previous || deps.some((value, j) => !Object.is(value, previous.deps[j]))) h.pending.set(i, { effect, deps });
        },
    };
    return { ...react, ...hooks, default: { ...react, ...hooks } };
});
vi.mock('next/dynamic', () => ({ default: () => () => null }));
vi.mock('../hooks/useCampaignProgress', () => ({ useCampaignProgress: () => ({ progress: { stars: {}, stageStars: [], ascensions: [], avatar: 'standard' } }) }));
vi.mock('../hooks/useCircuitAccess', () => ({ useCircuitAccess: () => ({ allowed: true }) }));
vi.mock('../hooks/useMatchmaking', () => ({ useMatchmaking: () => ({}) }));
vi.mock('../hooks/useRealtimeRefresh', () => ({ useRealtimeRefresh: () => {} }));
vi.mock('../hooks/useAndroidBack', () => ({ useAndroidBackHandler: () => {} }));
vi.mock('../lib/SocketContext', () => ({ useSocket: () => ({ queueStats: {}, isAuthenticated: true }) }));
vi.mock('../lib/supabaseClient', () => ({ supabase: {} }));
vi.mock('../lib/SoundService', () => ({ soundManager: {} }));
vi.mock('./AccountAvatar', () => ({ AccountAvatar: () => null }));
vi.mock('./AccountIconEditor', () => ({ AccountIconEditor: () => null }));
vi.mock('./AccountDeletionPanel', () => ({ AccountDeletionPanel: () => null }));
vi.mock('./AccountSecurityPanel', () => ({ AccountSecurityPanel: () => null }));
vi.mock('./AccountRecoveryPanel', () => ({ AccountRecoveryPanel: () => null }));
vi.mock('./AdBanner', () => ({ AdBanner: () => null }));
vi.mock('./RankedLoginDialog', () => ({ RankedLoginDialog: () => null }));
vi.mock('./FriendsMenu', () => ({ FriendsMenu: () => null }));
vi.mock('./SettingsDialog', () => ({ SettingsDialog: () => null }));
vi.mock('./LiveMatchesMenu', () => ({ LiveMatchesMenu: () => null }));
vi.mock('./QubeTeacher', () => ({ QubeTeacher: () => null }));
vi.mock('./CrownHintRecovery', () => ({ LatestMatchHintRecovery: () => null }));
vi.mock('./InteractiveTutorial', () => ({ InteractiveTutorial: () => null }));
vi.mock('./LobbyShowcase', () => ({ LobbyShowcase: () => null }));
vi.mock('./LobbyBrandMark', () => ({ LobbyBrandMark: () => null, LobbyChessArtwork: () => null }));
vi.mock('./LobbyTicketSummary', () => ({ LobbyTicketSummary: () => null }));

import { LevelSelect } from './LevelSelect';
import { AccountIconEditor } from './AccountIconEditor';

function descendants(node: ReactNode): any[] {
    if (Array.isArray(node)) return node.flatMap(descendants);
    if (!isValidElement<{ children?: ReactNode }>(node)) return [];
    return [node, ...descendants(node.props.children)];
}
const updated = vi.fn();
function render(id = 'Alice') {
    h.cursor = 0; h.pending.clear();
    return LevelSelect({ lang: 'en', user: { id, name: id, type: 'registered' }, settingsPanel: 'account', onBack: () => {}, onSelect: () => {}, onProfileUpdated: updated });
}
function commit() {
    for (const [i, next] of h.pending) { h.slots[i]?.cleanup?.(); h.slots[i] = { deps: next.deps, cleanup: next.effect() }; }
    h.pending.clear();
}
function editorCompletion(id = 'Alice') {
    let tree = render(id); commit();
    descendants(tree).find(node => node.props.className === 'account-icon-change').props.onClick();
    tree = render(id); commit();
    return descendants(tree).find(node => node.type === AccountIconEditor).props.onSaved as (url: string) => void;
}
beforeEach(() => { h.slots.forEach(slot => slot?.cleanup?.()); h.slots = []; h.pending.clear(); h.cursor = 0; updated.mockClear(); });

it('accepts completion for the committed account', () => {
    editorCompletion()('/avatars/a.webp');
    expect(updated).toHaveBeenCalledWith({ id: 'Alice', avatar_url: '/avatars/a.webp' });
});
it('rejects a prior account completion after switching accounts', () => {
    const completeAlice = editorCompletion();
    render('Bob'); commit();
    completeAlice('/avatars/a.webp');
    expect(updated).not.toHaveBeenCalled();
});
it('does not invalidate the committed account during an abandoned alternate render', () => {
    const completeAlice = editorCompletion();
    render('Bob'); // Concurrent work is discarded before commit.
    h.pending.clear();
    completeAlice('/avatars/a.webp');
    expect(updated).toHaveBeenCalledWith({ id: 'Alice', avatar_url: '/avatars/a.webp' });
});
it('rejects a late completion after unmount', () => {
    const complete = editorCompletion();
    h.slots.forEach(slot => slot?.cleanup?.());
    complete('/avatars/a.webp');
    expect(updated).not.toHaveBeenCalled();
});
