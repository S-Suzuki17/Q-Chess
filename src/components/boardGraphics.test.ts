import { describe, expect, it, vi } from 'vitest';
import { boardFrameLoop, graphicsQuality, observeGraphicsContext, observePageVisibility } from './boardGraphics';

describe('mobile graphics recovery', () => {
    it('renders static accessible boards on demand and keeps normal animation continuous', () => {
        expect(boardFrameLoop(true, true)).toBe('demand');
        expect(boardFrameLoop(true, false)).toBe('always');
        expect(boardFrameLoop(false, true)).toBe('never');
        expect(boardFrameLoop(false, false)).toBe('never');
    });
    it('does not flash the 2D fallback on a healthy return to the app', () => {
        const page = Object.assign(new EventTarget(), {visibilityState:'visible'});
        const restored = vi.fn();
        const dispose = observeGraphicsContext(new EventTarget(), page as unknown as Document, () => false, vi.fn(), restored);
        page.dispatchEvent(new Event('visibilitychange'));
        expect(restored).not.toHaveBeenCalled();
        dispose();
    });
    it('observes app visibility immediately and removes its listener on unmount', () => {
        const page = Object.assign(new EventTarget(), {visibilityState:'hidden'});
        const update = vi.fn();
        const dispose = observePageVisibility(page as unknown as Document, update);
        expect(update).toHaveBeenLastCalledWith(false);
        page.visibilityState = 'visible';
        page.dispatchEvent(new Event('visibilitychange'));
        expect(update).toHaveBeenLastCalledWith(true);
        dispose();
        page.dispatchEvent(new Event('visibilitychange'));
        expect(update).toHaveBeenCalledTimes(2);
    });
    it('preserves the original resolution on mobile and desktop', () => {
        expect(graphicsQuality(true)).toEqual({dpr:[1,1.75], shadows:false});
        expect(graphicsQuality(false)).toEqual({dpr:[1,1.75], shadows:true});
    });
    it('allows the browser to restore a lost context and cleans up listeners', () => {
        const canvas = new EventTarget();
        const page = Object.assign(new EventTarget(), {visibilityState:'visible'}) as unknown as Document;
        const lost = vi.fn(), restored = vi.fn();
        const dispose = observeGraphicsContext(canvas, page, () => false, lost, restored);
        const event = new Event('webglcontextlost', {cancelable:true});
        canvas.dispatchEvent(event);
        expect(event.defaultPrevented).toBe(true);
        expect(lost).toHaveBeenCalledOnce();
        canvas.dispatchEvent(new Event('webglcontextrestored'));
        expect(restored).toHaveBeenCalledOnce();
        dispose();
        canvas.dispatchEvent(new Event('webglcontextlost'));
        page.dispatchEvent(new Event('visibilitychange'));
        expect(lost).toHaveBeenCalledOnce();
        expect(restored).toHaveBeenCalledOnce();
    });
    it('checks context health after returning from another app', () => {
        const canvas = new EventTarget();
        const page = Object.assign(new EventTarget(), {visibilityState:'hidden'});
        let contextLost = true;
        const lost = vi.fn(), restored = vi.fn();
        const dispose = observeGraphicsContext(canvas, page as unknown as Document, () => contextLost, lost, restored);
        page.dispatchEvent(new Event('visibilitychange'));
        expect(lost).not.toHaveBeenCalled();
        page.visibilityState = 'visible';
        page.dispatchEvent(new Event('visibilitychange'));
        expect(lost).toHaveBeenCalledOnce();
        contextLost = false;
        page.dispatchEvent(new Event('visibilitychange'));
        expect(restored).toHaveBeenCalledOnce();
        dispose();
    });
});
