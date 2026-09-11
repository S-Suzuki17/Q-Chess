import { describe, expect, it, vi } from 'vitest';
import { graphicsQuality, observeGraphicsContext } from './boardGraphics';

describe('mobile graphics recovery', () => {
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
