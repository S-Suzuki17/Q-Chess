import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VictoryCelebration } from './VictoryCelebration';
import type { VictoryCinematic } from './checkmate/cinematic';

type Effect = () => void | (() => void);
const ownership = vi.hoisted(() => ({
    refs: [] as { current: unknown }[],
    effects: [] as Effect[],
    createCinematic: vi.fn<typeof import('./checkmate/cinematic').createVictoryCinematic>(),
    renderFrame: vi.fn<typeof import('./victoryScene').renderVictoryFrame>(),
}));

// This is an effect-ownership harness, not a browser DOM or React reconciliation
// test. SSR executes the real component tree; only ref/effect scheduling is replaced
// so we can attach explicit platform doubles and run the component's actual closure.
vi.mock('react', async importOriginal => {
    const actual = await importOriginal<typeof import('react')>();
    return {
        ...actual,
        useRef: (initial: unknown) => {
            const ref = { current: initial };
            ownership.refs.push(ref);
            return ref;
        },
        useEffect: (effect: Effect) => { ownership.effects.push(effect); },
    };
});
vi.mock('./victoryScene', async importOriginal => ({
    ...await importOriginal<typeof import('./victoryScene')>(),
    renderVictoryFrame: ownership.renderFrame,
}));
vi.mock('./checkmate/cinematic', () => ({ createVictoryCinematic: ownership.createCinematic }));

// Native EventTarget dispatch remains real, including preventDefault and listener
// removal. Track registrations to make resource ownership assertions explicit.
class ObservedTarget extends EventTarget {
    readonly listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();
    readonly addEventListener = vi.fn((type: string, listener: EventListenerOrEventListenerObject | null,
        options?: boolean | AddEventListenerOptions) => {
        super.addEventListener(type, listener, options);
        if (listener) {
            const listeners = this.listeners.get(type) ?? new Set();
            listeners.add(listener);
            this.listeners.set(type, listeners);
        }
    });
    readonly removeEventListener = vi.fn((type: string, listener: EventListenerOrEventListenerObject | null,
        options?: boolean | EventListenerOptions) => {
        super.removeEventListener(type, listener, options);
        if (listener) this.listeners.get(type)?.delete(listener);
    });
    listenerCount(type: string) { return this.listeners.get(type)?.size ?? 0; }
}

function platform() {
    const document = Object.assign(new ObservedTarget(), { hidden: false });
    const motion = Object.assign(new ObservedTarget(), { matches: false });
    const context = { setTransform: vi.fn() };
    const surface = {
        width: 0, height: 0,
        getContext: vi.fn(() => context),
        getBoundingClientRect: () => ({ left: 10, top: 20, width: 480, height: 320 }),
    };
    const cinematicSurface = new ObservedTarget();
    const letters = Array.from({ length: 9 }, () => ({ style: {
        transform: '', opacity: '', filter: '', setProperty: vi.fn(),
    } }));
    const host = {
        clientWidth: 480, clientHeight: 320, dataset: {} as Record<string, string>,
        querySelectorAll: (selector: string) => selector === '[data-letter]' ? letters : [],
    };
    const observers: ResizeObserverDouble[] = [];
    class ResizeObserverDouble {
        readonly observe = vi.fn();
        readonly disconnect = vi.fn();
        constructor(readonly callback: () => void) { observers.push(this); }
    }
    const audio: AudioDouble[] = [];
    class AudioDouble extends ObservedTarget {
        volume = 1;
        readonly play = vi.fn(() => Promise.resolve());
        readonly pause = vi.fn();
        constructor(readonly src: string) { super(); audio.push(this); }
    }
    const clock = { now: 0, next: 0, frames: new Map<number, FrameRequestCallback>() };
    const request = vi.fn((callback: FrameRequestCallback) => {
        const id = ++clock.next;
        clock.frames.set(id, callback);
        return id;
    });
    const cancel = vi.fn((id: number) => { clock.frames.delete(id); });
    vi.stubGlobal('window', { devicePixelRatio: 3, matchMedia: vi.fn(() => motion) });
    vi.stubGlobal('document', document);
    vi.stubGlobal('ResizeObserver', ResizeObserverDouble);
    vi.stubGlobal('Audio', AudioDouble);
    vi.stubGlobal('requestAnimationFrame', request);
    vi.stubGlobal('cancelAnimationFrame', cancel);
    vi.spyOn(performance, 'now').mockImplementation(() => clock.now);

    return {
        document, motion, host, surface, cinematicSurface, context, letters, observers, audio, clock, request, cancel,
        frame(timestamp: number) {
            expect(clock.frames.size).toBe(1);
            const [id, callback] = [...clock.frames][0];
            clock.frames.delete(id);
            clock.now = timestamp;
            callback(timestamp);
        },
        visibility(hidden: boolean, timestamp = clock.now) {
            clock.now = timestamp;
            document.hidden = hidden;
            document.dispatchEvent(new Event('visibilitychange'));
        },
        reduced(matches: boolean) {
            motion.matches = matches;
            motion.dispatchEvent(new Event('change'));
        },
    };
}

describe('VictoryCelebration effect ownership (no browser DOM)', () => {
    let rig: ReturnType<typeof platform>;
    let renderer: { [K in keyof VictoryCinematic]: ReturnType<typeof vi.fn<VictoryCinematic[K]>> };
    let cleanup: (() => void) | undefined;

    beforeEach(() => {
        ownership.refs.length = 0;
        ownership.effects.length = 0;
        ownership.createCinematic.mockReset();
        ownership.renderFrame.mockReset();
        renderer = { resize: vi.fn(), draw: vi.fn(), dispose: vi.fn() };
        ownership.createCinematic.mockReturnValue(renderer);
        rig = platform();
    });
    afterEach(async () => {
        cleanup?.();
        cleanup = undefined;
        // Drain the real dynamic import before restoring globals or starting the
        // next test, so late callbacks cannot leak across cases.
        await vi.dynamicImportSettled();
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    function mount() {
        const html = renderToStaticMarkup(React.createElement(VictoryCelebration, {
            effect: 'champion-effect-003', preview: true,
        }));
        expect(html).toContain('data-victory-layer="cinematic"');
        expect(ownership.refs).toHaveLength(3);
        expect(ownership.effects).toHaveLength(1);
        [rig.host, rig.surface, rig.cinematicSurface].forEach((node, index) => {
            ownership.refs[index].current = node;
        });
        const dispose = ownership.effects[0]();
        if (!dispose) throw new Error('The shot did not register its ownership cleanup');
        let mounted = true;
        cleanup = () => {
            if (!mounted) return;
            mounted = false;
            dispose();
        };
    }

    async function ready() {
        await vi.dynamicImportSettled();
        expect(ownership.createCinematic).toHaveBeenCalledOnce();
        expect(rig.host.dataset.cinematic).toBe('ready');
    }

    function expectDetached() {
        expect(rig.clock.frames.size).toBe(0);
        expect(rig.document.listenerCount('visibilitychange')).toBe(0);
        expect(rig.motion.listenerCount('change')).toBe(0);
        expect(rig.cinematicSurface.listenerCount('webglcontextlost')).toBe(0);
        expect(rig.observers[0].disconnect).toHaveBeenCalledOnce();
        for (const audio of rig.audio) {
            expect(audio.listenerCount('ended')).toBe(0);
            expect(audio.listenerCount('error')).toBe(0);
        }
    }

    it('does not allocate a cinematic when its pending dynamic import resolves after cleanup', async () => {
        mount();
        expect(ownership.createCinematic).not.toHaveBeenCalled();
        const renders = ownership.renderFrame.mock.calls.length;
        cleanup!();
        // Retain refs deliberately: this also models Strict Mode effect cleanup
        // with retained DOM and verifies the disposed guard, not a null-ref guard.
        await vi.dynamicImportSettled();
        expect(ownership.createCinematic).not.toHaveBeenCalled();
        expect(renderer.dispose).not.toHaveBeenCalled();
        expect(ownership.renderFrame).toHaveBeenCalledTimes(renders);
        expect(rig.host.dataset.cinematic).toBeUndefined();
        expectDetached();
    });

    it('unmounts a ready shot with one renderer disposal and no live RAF, sound, observer or listeners', async () => {
        mount();
        await ready();
        expect(renderer.resize).toHaveBeenCalledWith(480, 320, 3);
        expect(rig.context.setTransform).toHaveBeenCalledWith(2, 0, 0, 2, 0, 0);
        expect(rig.observers[0].observe).toHaveBeenCalledWith(rig.host);
        expect(rig.audio[0].src).toBe('/assets/victory-cinematic/crown-reveal.mp3');
        expect(rig.audio[0].play).toHaveBeenCalledOnce();
        expect(rig.document.listenerCount('visibilitychange')).toBe(2); // playback and real SoundService
        expect(rig.motion.listenerCount('change')).toBe(1);
        expect(rig.cinematicSurface.listenerCount('webglcontextlost')).toBe(1);
        const [id, staleFrame] = [...rig.clock.frames][0];
        cleanup!();
        expect(renderer.dispose).toHaveBeenCalledOnce();
        expect(rig.audio[0].pause).toHaveBeenCalledOnce();
        expect(rig.cancel).toHaveBeenCalledWith(id);
        expectDetached();
        const renders = ownership.renderFrame.mock.calls.length;
        staleFrame(1000);
        rig.visibility(false);
        rig.reduced(true);
        rig.cinematicSurface.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
        expect(ownership.renderFrame).toHaveBeenCalledTimes(renders);
        expect(renderer.dispose).toHaveBeenCalledOnce();
        expect(rig.clock.frames.size).toBe(0);
    });

    it('handles WebGL context loss without throwing and continues through the Canvas fallback', async () => {
        mount();
        await ready();
        rig.frame(250);
        const loss = new Event('webglcontextlost', { cancelable: true });
        expect(() => rig.cinematicSurface.dispatchEvent(loss)).not.toThrow();
        expect(loss.defaultPrevented).toBe(true);
        expect(rig.host.dataset.cinematic).toBe('fallback');
        expect(renderer.dispose).toHaveBeenCalledOnce();
        const gpuDraws = renderer.draw.mock.calls.length;
        rig.frame(500);
        expect(renderer.draw).toHaveBeenCalledTimes(gpuDraws);
        expect(ownership.renderFrame.mock.lastCall?.[4]).toBe(.5);
        expect(ownership.renderFrame.mock.lastCall?.[9]).toBe(false);
        expect(rig.host.dataset.finished).toBe('false');
        cleanup!();
        expect(renderer.dispose).toHaveBeenCalledOnce();
        expectDetached();
    });

    it('contains a GPU draw failure and relinquishes the failed renderer exactly once', async () => {
        mount();
        await ready();
        renderer.draw.mockImplementationOnce(() => { throw new Error('Injected driver draw failure'); });
        expect(() => rig.frame(100)).not.toThrow();
        expect(rig.host.dataset.cinematic).toBe('fallback');
        expect(renderer.dispose).toHaveBeenCalledOnce();
        expect(ownership.renderFrame.mock.lastCall?.[9]).toBe(false);
        const gpuDraws = renderer.draw.mock.calls.length;
        rig.frame(200);
        expect(renderer.draw).toHaveBeenCalledTimes(gpuDraws);
        cleanup!();
        expect(renderer.dispose).toHaveBeenCalledOnce();
        expectDetached();
    });

    it('settles at static time 3 when reduced motion is enabled mid-shot, stopping sound and the clock', async () => {
        mount();
        await ready();
        rig.frame(600);
        const [id, staleFrame] = [...rig.clock.frames][0];
        rig.reduced(true);
        expect(rig.cancel).toHaveBeenCalledWith(id);
        expect(renderer.dispose).toHaveBeenCalledOnce();
        expect(rig.audio[0].pause).toHaveBeenCalledOnce();
        expect(rig.host.dataset).toMatchObject({ cinematic: 'static', reducedMotion: 'true', finished: 'true', time: '3' });
        expect(ownership.renderFrame.mock.lastCall?.[4]).toBe(3);
        expect(ownership.renderFrame.mock.lastCall?.[8]).toBe(true);
        expect(ownership.renderFrame.mock.lastCall?.[9]).toBe(false);
        expect(rig.letters.every(letter => letter.style.opacity === '1')).toBe(true);
        expect(rig.document.listenerCount('visibilitychange')).toBe(0);
        const renders = ownership.renderFrame.mock.calls.length;
        staleFrame(1200);
        rig.reduced(false);
        rig.visibility(false);
        expect(ownership.renderFrame).toHaveBeenCalledTimes(renders);
        expect(rig.clock.frames.size).toBe(0);
        expect(ownership.createCinematic).toHaveBeenCalledOnce();
        cleanup!();
        expect(renderer.dispose).toHaveBeenCalledOnce();
        expect(rig.audio[0].pause).toHaveBeenCalledOnce();
        expectDetached();
    });

    it('pauses on visibility loss, excludes hidden elapsed time, and removes visibility ownership at completion', async () => {
        mount();
        await ready();
        rig.frame(100);
        const [id] = [...rig.clock.frames][0];
        rig.visibility(true);
        expect(rig.cancel).toHaveBeenCalledWith(id);
        expect(rig.clock.frames.size).toBe(0);
        expect(rig.audio[0].pause).toHaveBeenCalledOnce();
        const renders = ownership.renderFrame.mock.calls.length;
        rig.visibility(true, 10000);
        expect(ownership.renderFrame).toHaveBeenCalledTimes(renders);
        rig.visibility(false, 10000);
        rig.frame(10100);
        expect(Number(rig.host.dataset.time)).toBeCloseTo(.2);
        expect(ownership.createCinematic).toHaveBeenCalledOnce();
        expect(rig.audio).toHaveLength(1);
        rig.frame(13100);
        expect(rig.host.dataset).toMatchObject({ finished: 'true', time: '3' });
        expect(rig.clock.frames.size).toBe(0);
        expect(rig.document.listenerCount('visibilitychange')).toBe(0);
        const requests = rig.request.mock.calls.length;
        rig.visibility(true);
        rig.visibility(false);
        expect(rig.request).toHaveBeenCalledTimes(requests);
        cleanup!();
        expect(renderer.dispose).toHaveBeenCalledOnce();
        expectDetached();
    });

    it('defers GPU and RAF allocation while initially hidden, then cancels a newly pending import on unmount', async () => {
        rig.document.hidden = true;
        mount();
        await vi.dynamicImportSettled();
        expect(ownership.createCinematic).not.toHaveBeenCalled();
        expect(rig.request).not.toHaveBeenCalled();
        expect(rig.audio).toHaveLength(0);
        expect(rig.document.listenerCount('visibilitychange')).toBe(1);
        rig.visibility(false, 5000);
        expect(rig.clock.frames.size).toBe(1);
        cleanup!();
        await vi.dynamicImportSettled();
        expect(ownership.createCinematic).not.toHaveBeenCalled();
        expectDetached();
    });

    it('keeps the fallback clock and cleanup usable when cinematic construction throws', async () => {
        ownership.createCinematic.mockImplementationOnce(() => { throw new Error('Injected unavailable WebGL'); });
        mount();
        await vi.dynamicImportSettled();
        expect(rig.host.dataset.cinematic).toBe('fallback');
        expect(() => rig.frame(100)).not.toThrow();
        expect(ownership.renderFrame.mock.lastCall?.[4]).toBe(.1);
        expect(ownership.renderFrame.mock.lastCall?.[9]).toBe(false);
        expect(renderer.dispose).not.toHaveBeenCalled();
        cleanup!();
        expect(rig.audio[0].pause).toHaveBeenCalledOnce();
        expectDetached();
    });
});
