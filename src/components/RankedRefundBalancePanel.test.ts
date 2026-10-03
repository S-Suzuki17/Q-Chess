import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
const h = vi.hoisted(() => ({ cursor: 0, slots: [] as unknown[], effects: [] as Array<() => void>, cleanups: new Map<number, () => void>(), read: vi.fn(), allowed: true, revision: 1, enabled: true }));
vi.mock('react', async original => {
    const react = await original<typeof import('react')>();
    return { ...react,
        useState(initial: unknown) { const i = h.cursor++; if (!(i in h.slots)) h.slots[i] = initial; return [h.slots[i], (value: unknown) => { h.slots[i] = value; }]; },
        useEffect(effect: () => void | (() => void), deps: unknown[]) {
            const i = h.cursor++, previous = h.slots[i] as unknown[] | undefined;
            if (!previous || deps.some((value, j) => value !== previous[j])) {
                h.slots[i] = deps; h.effects.push(() => { h.cleanups.get(i)?.(); const cleanup = effect(); if (cleanup) h.cleanups.set(i, cleanup); else h.cleanups.delete(i); });
            }
        },
    };
});
vi.mock('../hooks/useCircuitAccess', () => ({ useCircuitAccess: () => ({ allowed: h.allowed, revision: h.revision }) }));
vi.mock('../lib/rankedRefundBalance', () => ({ get RANKED_REFUND_BALANCE_ENABLED() { return h.enabled; }, readRankedRefundBalance: h.read }));
import { RankedRefundBalancePanel } from './RankedRefundBalancePanel';
import { rankedRecoveryText } from '../locales/rankedRecoveryText';
import { LANGUAGES, type Language } from '../locales/dict';
let doc: EventTarget & { visibilityState: string };
const balance = { userId: 'Alice', enabled: true, freeRankedRefunds: 45, paidRankedRefunds: 73 };
function render(id = 'Alice', lang: Language = 'ja', type: 'registered' | 'guest' = 'registered') {
    h.cursor = 0;
    const node = RankedRefundBalancePanel({ user: { id, name: id, type }, lang });
    h.effects.splice(0).forEach(effect => effect()); return node ? renderToStaticMarkup(node) : '';
}
const flush = async () => { await vi.advanceTimersByTimeAsync(0); };
const unmount = () => { h.cleanups.forEach(cleanup => cleanup()); h.cleanups.clear(); };
beforeEach(() => {
    vi.useFakeTimers(); h.cursor = 0; h.slots = []; h.effects = []; h.read.mockReset(); h.allowed = true; h.revision = 1; h.enabled = true;
    h.read.mockResolvedValue(balance); doc = Object.assign(new EventTarget(), { visibilityState: 'visible' });
    vi.stubGlobal('document', doc); vi.stubGlobal('window', new EventTarget());
});
afterEach(() => { unmount(); vi.useRealTimers(); vi.unstubAllGlobals(); });

it('shows separate uncapped credits, excluding no-longer-eligible paid counts after refresh', async () => {
    render(); await flush(); let html = render();
    expect(html).toContain('無料券の返還分'); expect(html).toContain('会員券の返還分'); expect(html).toContain('>45<'); expect(html).toContain('>73<');
    expect(html).not.toMatch(/\/ 20|href=|Stripe|2\.99|checkout|portal/i);
    h.read.mockResolvedValue({ ...balance, paidRankedRefunds: 0 }); window.dispatchEvent(new Event('focus'));
    expect(render()).not.toContain('>73<'); await flush(); html = render();
    expect(html).toContain('>0<'); expect(html).not.toContain('>73<');
});
it('never displays an old account or old verification revision balance', async () => {
    render(); await flush(); expect(render()).toContain('>45<');
    h.read.mockReturnValue(new Promise(() => {})); expect(render('Bob')).not.toContain('>45<');
    h.revision++; expect(render()).not.toContain('>45<'); h.allowed = false; expect(render()).toBe('');
});
it('hides OFF/guest/unverified UI and makes no read request', () => {
    h.enabled = false; expect(render()).toBe(''); h.enabled = true; h.allowed = false; expect(render()).toBe('');
    h.allowed = true; expect(render('GUEST-Alice', 'ja', 'guest')).toBe(''); expect(h.read).not.toHaveBeenCalled();
});
it('hides server-disabled balances, but displays real failures without keeping stale counts', async () => {
    render(); await flush(); h.read.mockRejectedValue({ code: 'UNAVAILABLE' }); window.dispatchEvent(new Event('focus')); await flush();
    expect(render('Alice', 'en')).toContain('Rewards are unavailable right now.'); expect(render()).not.toContain('>45<');
    h.read.mockRejectedValue({ code: 'DISABLED' }); window.dispatchEvent(new Event('focus')); await flush(); expect(render()).toBe('');
    const calls = h.read.mock.calls.length; await vi.advanceTimersByTimeAsync(60000); expect(h.read).toHaveBeenCalledTimes(calls);
});
it('clears hidden-page balances and refreshes on resume or the visible polling interval', async () => {
    render(); await flush(); doc.visibilityState = 'hidden'; doc.dispatchEvent(new Event('visibilitychange'));
    expect(render()).not.toContain('>73<'); await vi.advanceTimersByTimeAsync(30000); expect(h.read).toHaveBeenCalledTimes(1);
    doc.visibilityState = 'visible'; doc.dispatchEvent(new Event('visibilitychange')); await flush(); expect(h.read).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(30000); expect(h.read).toHaveBeenCalledTimes(3);
});
it('aborts old requests and ignores their late responses after account switch/unmount', async () => {
    let complete!: (value: unknown) => void; h.read.mockReturnValueOnce(new Promise(resolve => { complete = resolve; }));
    render(); const signal = h.read.mock.calls[0][1] as AbortSignal;
    h.read.mockResolvedValue({ ...balance, userId: 'Bob', freeRankedRefunds: 1, paidRankedRefunds: 0 }); render('Bob'); await flush();
    expect(signal.aborted).toBe(true); complete(balance); await flush(); expect(render('Bob')).not.toContain('>45<');
    unmount(); expect((h.read.mock.calls[1][1] as AbortSignal).aborted).toBe(true);
});
it('provides every label in all 12 languages and stays a use-only surface on Android', async () => {
    render(); await flush();
    for (const { code } of LANGUAGES) {
        for (const value of Object.values(rankedRecoveryText(code))) expect(value.trim()).toBeTruthy();
        const html = render('Alice', code); expect(html).toContain('>45<'); expect(html).toContain('>73<');
        expect(html).not.toMatch(/href=|Stripe|2\.99|checkout|portal/i);
    }
    expect(new Set(LANGUAGES.map(({ code }) => rankedRecoveryText(code).recovering)).size).toBe(12);
});
