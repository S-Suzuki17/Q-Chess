import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const CLIENT = 'ca-pub-1116866075179199';

class FakeScript extends EventTarget {
    async = false;
    src = '';
    crossOrigin = '';
}

class FakeSlot {
    isConnected = true;
    width = 320;
    initialized = false;
    hasAttribute(name: string) { return name === 'data-adsbygoogle-status' && this.initialized; }
    getBoundingClientRect() { return { width: this.width }; }
    asElement() { return this as unknown as HTMLElement; }
}

describe('AdSense lifecycle', () => {
    let scripts: FakeScript[];
    let browser: EventTarget & { adsbygoogle?: { push: ReturnType<typeof vi.fn> } };
    let resizes: { callback: () => void; disconnect: ReturnType<typeof vi.fn> }[];
    let report: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        vi.resetModules();
        scripts = [];
        browser = new EventTarget();
        resizes = [];
        vi.stubGlobal('window', browser);
        vi.stubGlobal('document', {
            createElement: (tag: string) => {
                expect(tag).toBe('script');
                return new FakeScript();
            },
            head: { appendChild: (script: FakeScript) => scripts.push(script) },
        });
        vi.stubGlobal('ResizeObserver', class {
            disconnect = vi.fn();
            constructor(callback: () => void) { resizes.push({ callback, disconnect: this.disconnect }); }
            observe() {}
        });
        report = vi.spyOn(console, 'error').mockImplementation(() => {});
    });
    afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

    async function ready() {
        const push = vi.fn();
        browser.adsbygoogle = { push };
        scripts[0].dispatchEvent(new Event('load'));
        await Promise.resolve();
        return push;
    }

    it('loads exactly one async SDK with only official attributes, even for repeat calls', async () => {
        const { loadAdSense } = await import('./adsense');
        const first = loadAdSense(CLIENT);
        expect(loadAdSense(CLIENT)).toBe(first);
        expect(scripts).toHaveLength(1);
        expect(scripts[0]).toMatchObject({
            async: true,
            crossOrigin: 'anonymous',
            src: `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${CLIENT}`,
        });
        expect(Object.keys(scripts[0]).sort()).toEqual(['async', 'crossOrigin', 'src']);
        const push = await ready();
        expect(await first).toBe(browser.adsbygoogle);
        expect(push).not.toHaveBeenCalled(); // No legacy page-level enable request.
        expect(loadAdSense(CLIENT)).toBe(first);
    });

    it('waits for the SDK, requests an actual slot once and does not mark it filled', async () => {
        const { mountAdSenseUnit } = await import('./adsense');
        const slot = new FakeSlot();
        mountAdSenseUnit(slot.asElement(), CLIENT);
        expect(browser.adsbygoogle).toBeUndefined();
        const push = await ready();
        expect(push).toHaveBeenCalledExactlyOnceWith({});
        expect(slot.initialized).toBe(false);
        resizes[0].callback();
        mountAdSenseUnit(slot.asElement(), CLIENT);
        await Promise.resolve();
        expect(push).toHaveBeenCalledOnce();
    });

    it('survives Strict Mode setup/cleanup/setup without stale or duplicate requests', async () => {
        const { mountAdSenseUnit } = await import('./adsense');
        const slot = new FakeSlot();
        const cleanup = mountAdSenseUnit(slot.asElement(), CLIENT);
        cleanup();
        mountAdSenseUnit(slot.asElement(), CLIENT);
        const push = await ready();
        expect(push).toHaveBeenCalledOnce();
        expect(scripts).toHaveLength(1);
        expect(resizes[0].disconnect).toHaveBeenCalled();
    });

    it('does not queue ads for a slot that unmounts before the SDK arrives', async () => {
        const { mountAdSenseUnit } = await import('./adsense');
        const cleanup = mountAdSenseUnit(new FakeSlot().asElement(), CLIENT);
        cleanup();
        const push = await ready();
        expect(push).not.toHaveBeenCalled();
    });

    it('allows a genuinely new slot after route navigation without reloading the SDK', async () => {
        const { mountAdSenseUnit } = await import('./adsense');
        const cleanup = mountAdSenseUnit(new FakeSlot().asElement(), CLIENT);
        const push = await ready();
        cleanup();
        mountAdSenseUnit(new FakeSlot().asElement(), CLIENT);
        await Promise.resolve();
        expect(push).toHaveBeenCalledTimes(2);
        expect(scripts).toHaveLength(1);
    });

    it('does not push another request for an SDK-managed slot', async () => {
        const { mountAdSenseUnit } = await import('./adsense');
        const slot = new FakeSlot();
        slot.initialized = true;
        mountAdSenseUnit(slot.asElement(), CLIENT);
        const push = await ready();
        expect(push).not.toHaveBeenCalled();
    });

    it('waits for nonzero width and disconnects its observer after one request', async () => {
        const { mountAdSenseUnit } = await import('./adsense');
        const slot = new FakeSlot();
        slot.width = 0;
        mountAdSenseUnit(slot.asElement(), CLIENT);
        const push = await ready();
        expect(push).not.toHaveBeenCalled();
        slot.width = 320;
        resizes[0].callback();
        resizes[0].callback();
        expect(push).toHaveBeenCalledOnce();
        expect(resizes[0].disconnect).toHaveBeenCalled();
    });

    it('never initializes a detached element', async () => {
        const { mountAdSenseUnit } = await import('./adsense');
        const slot = new FakeSlot();
        slot.isConnected = false;
        mountAdSenseUnit(slot.asElement(), CLIENT);
        const push = await ready();
        expect(push).not.toHaveBeenCalled();
    });

    it('uses and cleans up a resize fallback when ResizeObserver is unavailable', async () => {
        vi.stubGlobal('ResizeObserver', undefined);
        const { mountAdSenseUnit } = await import('./adsense');
        const slot = new FakeSlot();
        slot.width = 0;
        const cleanup = mountAdSenseUnit(slot.asElement(), CLIENT);
        const push = await ready();
        slot.width = 320;
        browser.dispatchEvent(new Event('resize'));
        browser.dispatchEvent(new Event('resize'));
        cleanup();
        expect(push).toHaveBeenCalledOnce();
    });

    it('does not mistake a blocked SDK for success or automatically retry it', async () => {
        const { loadAdSense, mountAdSenseUnit } = await import('./adsense');
        mountAdSenseUnit(new FakeSlot().asElement(), CLIENT);
        scripts[0].dispatchEvent(new Event('error'));
        expect(await loadAdSense(CLIENT)).toBeNull();
        expect(report).toHaveBeenCalledOnce();
        expect(browser.adsbygoogle).toBeUndefined();
        expect(scripts).toHaveLength(1);
        expect(resizes[0].disconnect).toHaveBeenCalled();
    });

    it('does not claim initialization when a loaded script exposes no SDK', async () => {
        const { loadAdSense } = await import('./adsense');
        const result = loadAdSense(CLIENT);
        scripts[0].dispatchEvent(new Event('load'));
        expect(await result).toBeNull();
        expect(report).toHaveBeenCalledOnce();
    });

    it('reports a genuine SDK push failure and allows a later remount to retry', async () => {
        const { mountAdSenseUnit } = await import('./adsense');
        const slot = new FakeSlot();
        mountAdSenseUnit(slot.asElement(), CLIENT);
        const push = vi.fn().mockImplementationOnce(() => { throw new Error('SDK failure'); });
        browser.adsbygoogle = { push };
        scripts[0].dispatchEvent(new Event('load'));
        await Promise.resolve();
        expect(report).toHaveBeenCalledOnce();
        mountAdSenseUnit(slot.asElement(), CLIENT);
        await Promise.resolve();
        expect(push).toHaveBeenCalledTimes(2);
    });

    it('does not load on the server or with an invalid publisher', async () => {
        const { loadAdSense } = await import('./adsense');
        expect(await loadAdSense('not-a-publisher')).toBeNull();
        vi.stubGlobal('window', undefined);
        expect(await loadAdSense(CLIENT)).toBeNull();
        expect(scripts).toHaveLength(0);
    });

    it('does not configure missing, placeholder or malformed slots', async () => {
        const { isAdSenseUnitConfigured } = await import('./adsense');
        expect(isAdSenseUnitConfigured(CLIENT, '8798363654')).toBe(true);
        for (const slot of [undefined, '', 'XXXXXXXXXX', 'abc', '<script>']) {
            expect(isAdSenseUnitConfigured(CLIENT, slot)).toBe(false);
        }
        expect(isAdSenseUnitConfigured('invalid', '8798363654')).toBe(false);
    });
});
