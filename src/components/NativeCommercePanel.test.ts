import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Children, isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const h = vi.hoisted(() => ({
    cursor: 0, slots: [] as unknown[], effects: [] as Array<() => void>,
    cleanups: new Map<number, () => void>(), userId: 'alice', allowed: true, revision: 1,
    enabled: true, read: vi.fn(), prices: vi.fn(), buy: vi.fn(), restore: vi.fn(), accept: vi.fn(), manage: vi.fn(),
}));
vi.mock('react', async original => ({
    ...await original<typeof import('react')>(),
    useState(initial: unknown) {
        const i = h.cursor++;
        if (!(i in h.slots)) h.slots[i] = initial;
        return [h.slots[i], (value: unknown) => { h.slots[i] = typeof value === 'function' ? value(h.slots[i]) : value; }];
    },
    useRef(initial: unknown) {
        const i = h.cursor++;
        if (!(i in h.slots)) h.slots[i] = { current: initial };
        return h.slots[i];
    },
    useEffect(effect: () => void | (() => void), deps: unknown[]) {
        const i = h.cursor++, previous = h.slots[i] as unknown[] | undefined;
        if (!previous || deps.some((value, n) => value !== previous[n])) {
            h.slots[i] = deps;
            h.effects.push(() => {
                h.cleanups.get(i)?.();
                const cleanup = effect();
                if (cleanup) h.cleanups.set(i, cleanup); else h.cleanups.delete(i);
            });
        }
    },
}));
vi.mock('../hooks/useCircuitAccess', () => ({ useCircuitAccess: () => ({ allowed: h.allowed, revision: h.revision }) }));
vi.mock('../lib/circuitAccess', () => ({ circuitAccess: { permit: (user: { id: string }) => () => h.allowed && h.userId === user.id } }));
vi.mock('../lib/currentAccountTerms', () => ({ acceptCurrentAccountTerms: h.accept }));
vi.mock('../lib/nativeCommerce', () => ({ nativeCommerceEnabled: () => h.enabled,
    nativeCommercePrices: h.prices, readNativeCommerce: h.read, buyNativeCommerce: h.buy,
    restoreNativeCommerce: h.restore, manageNativeCommerce: h.manage,
}));
vi.mock('./TermsDocument', () => ({ TermsDocument: () => null }));
import { NativeCommercePanel } from './NativeCommercePanel';
import { LANGUAGES, type Language } from '../locales/dict';
import { nativeRewardText } from '../locales/nativeRewardText';
import { playCommerceText } from '../locales/playCommerceText';
import { DAILY_LOGIN_REWARD_CHANGED_EVENT } from '../lib/dailyLoginRewards';
import type { NativeCommerceStatus } from '../lib/nativeCommerce';

const price = { sku: 'hints_13', price: '¥1,500', currency: 'JPY', priceMicros: '1500000000', period: '' };
const balance = (userId = 'alice', count = 0): NativeCommerceStatus => ({ userId, ready: true, enabled: true,
    active: false, subscriptionBlocked: false, sku: null, periodEnd: null, cancelAtPeriodEnd: false,
    test: true, purchasedHintTickets: count, subscriptionHintTickets: 0, deliveryPending: false });
const flush = async () => { await vi.advanceTimersByTimeAsync(0); };
const nodes = (node: ReactNode): ReactElement<any>[] => Children.toArray(node).flatMap(child => {
    if (!isValidElement(child)) return [];
    const element = child as ReactElement<{ children?: ReactNode }>;
    return [element, ...nodes(element.props.children)];
});
function render(lang: Language = 'ja') {
    h.cursor = 0;
    const tree = NativeCommercePanel({ user: { id: h.userId, name: h.userId, type: 'registered' }, lang });
    h.effects.splice(0).forEach(effect => effect());
    return tree;
}
const button = (tree: ReactNode, label: string) => {
    const found = nodes(tree).find(node => node.type === 'button' && node.props.children === label);
    if (!found) throw new Error('Button not found: ' + label);
    return found;
};
async function ready() { render(); await flush(); return render(); }
async function purchase(kind: 'buy' | 'restore') {
    let tree = render();
    if (kind === 'buy') {
        nodes(tree).find(node => node.type === 'input' && node.props.type === 'radio')!.props.onChange();
        tree = render();
        nodes(tree).find(node => node.type === 'input' && node.props.type === 'checkbox')!.props.onChange({ target: { checked: true } });
        tree = render();
    }
    button(tree, playCommerceText('ja', kind)).props.onClick();
    await flush();
}
beforeEach(() => {
    vi.stubGlobal('window',new EventTarget());
    vi.useFakeTimers(); h.cursor = 0; h.slots = []; h.effects = []; h.cleanups.clear();
    h.userId = 'alice'; h.allowed = true; h.revision = 1; h.enabled = true;
    for (const mock of [h.read, h.prices, h.buy, h.restore, h.accept, h.manage]) mock.mockReset();
    h.read.mockImplementation(async (id: string) => balance(id)); h.prices.mockResolvedValue([price]);
    h.buy.mockResolvedValue('done'); h.restore.mockResolvedValue('done'); h.accept.mockResolvedValue(undefined);
});
afterEach(() => { h.cleanups.forEach(cleanup => cleanup()); h.cleanups.clear(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('purchase outcome and balance refresh remain separate', () => {
    it('refreshes the visible balance after foreground recovery without launching another transaction', async () => {
        await ready(); h.restore.mockResolvedValue('pending'); await purchase('restore');
        h.read.mockResolvedValueOnce(balance('alice',13));
        window.dispatchEvent(new CustomEvent(DAILY_LOGIN_REWARD_CHANGED_EVENT,{detail:{userId:'alice'}}));
        await flush(); const html=renderToStaticMarkup(render());
        expect(html).toContain('>13<'); expect(h.restore).toHaveBeenCalledTimes(1); expect(h.buy).not.toHaveBeenCalled();
    });
    it('ignores another account recovery and preserves a pending outcome if recovery balance refresh fails', async () => {
        await ready(); h.restore.mockResolvedValue('pending'); await purchase('restore'); const count=h.read.mock.calls.length;
        window.dispatchEvent(new CustomEvent(DAILY_LOGIN_REWARD_CHANGED_EVENT,{detail:{userId:'bob'}}));await flush();expect(h.read).toHaveBeenCalledTimes(count);
        h.read.mockRejectedValueOnce(new Error('offline'));
        window.dispatchEvent(new CustomEvent(DAILY_LOGIN_REWARD_CHANGED_EVENT,{detail:{userId:'alice'}}));await flush();
        const html=renderToStaticMarkup(render());expect(html).toContain(playCommerceText('ja','pending'));expect(html).toContain(nativeRewardText('ja').balanceError);
    });
    it.each([
        ['buy', 'done'], ['buy', 'pending'], ['restore', 'done'], ['restore', 'pending'],
    ] as const)('%s preserves %s through a failed refresh; retry only reads the balance', async (kind, outcome) => {
        await ready(); (kind === 'buy' ? h.buy : h.restore).mockResolvedValue(outcome);
        h.read.mockRejectedValueOnce(new Error('offline'));
        await purchase(kind);
        let tree = render(), html = renderToStaticMarkup(tree);
        expect(html).toContain(playCommerceText('ja', outcome));
        expect(html).toContain(nativeRewardText('ja').balanceError);
        expect(html).not.toContain(playCommerceText('ja', 'failure'));
        expect(nodes(tree).some(node => node.type === 'button' && node.props.children === playCommerceText('ja', 'buy'))).toBe(false);
        h.read.mockResolvedValueOnce(balance('alice', 13));
        const retry = button(tree, nativeRewardText('ja').refresh);
        retry.props.onClick(); retry.props.onClick();
        expect(button(render(), nativeRewardText('ja').refresh).props.disabled).toBe(true);
        await flush(); tree = render(); html = renderToStaticMarkup(tree);
        expect(html).toContain(playCommerceText('ja', outcome)); expect(html).toContain('>13<');
        expect(html).not.toContain(nativeRewardText('ja').balanceError);
        expect(h.read).toHaveBeenCalledTimes(3);
        expect(kind === 'buy' ? h.buy : h.restore).toHaveBeenCalledTimes(1);
        expect(kind === 'buy' ? h.restore : h.buy).not.toHaveBeenCalled();
        expect(h.prices).toHaveBeenCalledTimes(1);
    });
    it.each(['buy', 'restore'] as const)('keeps an actual %s failure distinct from balance failure', async kind => {
        await ready(); (kind === 'buy' ? h.buy : h.restore).mockRejectedValue(new Error('provider failure'));
        await purchase(kind); const html = renderToStaticMarkup(render());
        expect(html).toContain(playCommerceText('ja', 'failure'));
        expect(html).not.toContain(nativeRewardText('ja').balanceError);
        expect(h.read).toHaveBeenCalledTimes(1);
    });
    it('preserves the outcome and retry action when the balance retry also fails', async () => {
        await ready(); h.read.mockRejectedValue(new Error('offline')); await purchase('buy');
        button(render(), nativeRewardText('ja').refresh).props.onClick(); await flush();
        const tree = render(), html = renderToStaticMarkup(tree);
        expect(html).toContain(playCommerceText('ja', 'done')); expect(html).toContain(nativeRewardText('ja').balanceError);
        expect(button(tree, nativeRewardText('ja').refresh).props.disabled).toBe(false);
        expect(h.buy).toHaveBeenCalledTimes(1);
    });
    it.each(['resolve', 'reject'] as const)('ignores a balance retry that finishes after account switch: %s', async completion => {
        await ready(); h.read.mockRejectedValueOnce(new Error('offline')); await purchase('buy');
        let resolve!: (value: NativeCommerceStatus) => void, reject!: (reason: Error) => void;
        h.read.mockReturnValueOnce(new Promise<NativeCommerceStatus>((yes, no) => { resolve = yes; reject = no; }));
        button(render(), nativeRewardText('ja').refresh).props.onClick();
        h.userId = 'bob'; h.read.mockResolvedValue(balance('bob', 31)); render(); await flush(); render();
        if (completion === 'resolve') resolve(balance('alice', 999)); else reject(new Error('old account offline'));
        await flush(); const html = renderToStaticMarkup(render());
        expect(html).toContain('>31<'); expect(html).not.toContain('>999<');
        expect(html).not.toContain(playCommerceText('ja', 'done')); expect(html).not.toContain(nativeRewardText('ja').balanceError);
        expect(h.buy).toHaveBeenCalledTimes(1); expect(h.restore).not.toHaveBeenCalled();
    });
    it('ignores a purchase result after the account changes', async () => {
        await ready(); let finish!: (value: string) => void;
        h.buy.mockReturnValueOnce(new Promise<string>(resolve => { finish = resolve; }));
        await purchase('buy'); h.userId = 'bob'; render(); await flush();
        finish('done'); await flush(); const html = renderToStaticMarkup(render());
        expect(html).not.toContain(playCommerceText('ja', 'done'));
        expect(h.read.mock.calls.map(call => call[0])).toEqual(['alice', 'bob']);
    });
    it('keeps cancellation separate even when its balance refresh fails', async () => {
        await ready(); h.buy.mockResolvedValue('cancelled'); h.read.mockRejectedValueOnce(new Error('offline'));
        await purchase('buy'); const html = renderToStaticMarkup(render());
        expect(html).not.toContain(playCommerceText('ja', 'done')); expect(html).not.toContain(playCommerceText('ja', 'failure'));
        expect(html).toContain(nativeRewardText('ja').balanceError);
    });
    it('preserves platform/account gates and exposes the retry labels in all 12 languages', async () => {
        h.enabled = false; expect(render()).toBeNull(); expect(h.read).not.toHaveBeenCalled();
        h.enabled = true; h.allowed = false; h.revision++; expect(render()).toBeNull(); expect(h.read).not.toHaveBeenCalled();
        h.allowed = true; h.revision++; await ready(); h.read.mockRejectedValueOnce(new Error('offline')); await purchase('buy');
        for (const { code } of LANGUAGES) {
            const tree = render(code), html = renderToStaticMarkup(tree), copy = nativeRewardText(code);
            expect(copy.refresh.trim()).toBeTruthy(); expect(copy.balanceError.trim()).toBeTruthy();
            expect(html).toContain(copy.balanceError); expect(button(tree, copy.refresh).props.type).toBe('button');
        }
    });
});
