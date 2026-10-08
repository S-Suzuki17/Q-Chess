import { describe, expect, it, vi } from 'vitest';
import { createQubeMotionController, QUBE_EXPRESSION, QUBE_MOTION_DURATION, QUBE_PIVOTS, qubeMotionTracks, qubePoseAt, qubeTrackKeyframes, type QubeAnimationHandle, type QubeMotionContext, type QubeState } from './qubeMotion';

const states: QubeState[] = ['idle', 'anticipation', 'victory', 'encouragement'];
const context = (changes: Partial<QubeMotionContext> = {}): QubeMotionContext => ({ state: 'idle', visible: true, reducedMotion: false, ...changes });
function harness() {
    const handles: (QubeAnimationHandle & { play: ReturnType<typeof vi.fn>; pause: ReturnType<typeof vi.fn>; cancel: ReturnType<typeof vi.fn>; finish: (() => void) | null })[] = [];
    const animate = vi.fn(() => {
        const handle = { play: vi.fn(), pause: vi.fn(), cancel: vi.fn(), finish: null as (() => void) | null, setFinished(callback: (() => void) | null) { this.finish = callback; } };
        handles.push(handle);
        return handle;
    });
    return { handles, animate, motion: createQubeMotionController(animate) };
}

describe('QUBE authored 2D clips', () => {
    it.each(states)('%s has a bounded, non-looping articulated clip', state => {
        expect(QUBE_MOTION_DURATION[state]).toBeGreaterThan(0);
        expect(QUBE_MOTION_DURATION[state]).toBeLessThanOrEqual(3000);
        const tracks = qubeMotionTracks(state);
        expect(tracks.length).toBeGreaterThanOrEqual(4);
        expect(new Set(tracks.map(track => track.part)).size).toBe(tracks.length);
        for (const track of tracks) {
            const frames = qubeTrackKeyframes(track);
            expect(frames[0].offset).toBe(0);
            expect(frames.at(-1)?.offset).toBe(1);
            const offsets = frames.map(frame => frame.offset as number);
            expect(offsets).toEqual([...offsets].sort((a, b) => a - b));
            expect(frames.every(frame => typeof frame.transform === 'string' && !frame.transform.includes('NaN'))).toBe(true);
        }
    });
    it('maps real outcome states to distinct expressive face artwork', () => {
        expect(QUBE_EXPRESSION).toEqual({ idle: 'neutral', anticipation: 'confident', victory: 'joy', encouragement: 'encouraging' });
        expect(qubeMotionTracks('encouragement').map(track => track.part)).not.toContain('spark-left');
    });
    it('moves the complete right arm, head, torso and legs independently in victory', () => {
        const pose = qubePoseAt('victory', 900);
        for (const part of ['head', 'body', 'arm-right', 'forearm-right', 'hand-right', 'leg-left'] as const) {
            expect(pose[part]?.transform).not.toBe('matrix(1,0,0,1,0,0)');
        }
        for (const hiddenPart of ['arm-left', 'forearm-left', 'hand-left'] as const) expect(pose[hiddenPart]).toBeUndefined();
    });
    it('keeps original shoulder, elbow and wrist pivots fixed through every clip', () => {
        for (const state of states) for (let frame = 0; frame <= 60; frame++) {
            const pose = qubePoseAt(state, frame / 60 * QUBE_MOTION_DURATION[state]);
            for (const part of ['arm-left', 'arm-right', 'forearm-left', 'forearm-right', 'hand-left', 'hand-right'] as const) {
                const transform = pose[part]?.transform;
                if (!transform) continue;
                const [a, b, c, d, e, f] = transform.slice(7, -1).split(',').map(Number);
                const [x, y] = QUBE_PIVOTS[part];
                expect(a * x + c * y + e).toBeCloseTo(x, 2);
                expect(b * x + d * y + f).toBeCloseTo(y, 2);
            }
        }
    });
    it('does not add motion for invented mouth or constant sweat', () => {
        for (const state of states) {
            const parts = qubeMotionTracks(state).map(track => track.part);
            expect(parts).not.toContain('mouth');
            expect(parts).not.toContain('sweat');
        }
        expect('mouth' in QUBE_PIVOTS).toBe(false);
        expect('sweat' in QUBE_PIVOTS).toBe(false);
    });
    it('blinks both actual eyes, without continuously bobbing an image', () => {
        const pose = qubePoseAt('idle', 1800 * 0.52);
        expect(pose['eye-left']?.transform).not.toBe('matrix(1,0,0,1,0,0)');
        expect(pose['eye-right']?.transform).not.toBe('matrix(1,0,0,1,0,0)');
    });
    it.each(states)('%s settles at rest and reduced motion uses only the static expression', state => {
        const pose = qubePoseAt(state, QUBE_MOTION_DURATION[state] + 5000);
        for (const [part, value] of Object.entries(pose)) {
            expect(value.transform).toBe('matrix(1,0,0,1,0,0)');
            expect(value.opacity).toBe(part.startsWith('spark') ? 0 : 1);
        }
        expect(qubePoseAt(state, 900, true)).toEqual({});
        expect(qubePoseAt(state, -100)).toEqual(qubePoseAt(state, 0));
        expect(qubePoseAt(state, Number.NaN)).toEqual(qubePoseAt(state, 0));
    });
});

describe('QUBE motion lifecycle without a browser or GPU', () => {
    it('runs once per state and releases every finished animation without an idle loop', () => {
        const { motion, handles, animate } = harness();
        motion.update(context());
        const initialCount = animate.mock.calls.length;
        expect(initialCount).toBe(qubeMotionTracks('idle').length);
        for (const handle of handles) handle.finish?.();
        expect(motion.activeCount).toBe(0);
        expect(handles.every(handle => handle.cancel.mock.calls.length === 1)).toBe(true);
        motion.update(context());
        motion.update(context({ visible: false }));
        motion.update(context());
        expect(animate).toHaveBeenCalledTimes(initialCount);
    });
    it('does not start an offscreen/hidden clip; becoming visible starts it once', () => {
        const { motion, animate } = harness();
        motion.update(context({ visible: false, state: 'victory' }));
        expect(animate).not.toHaveBeenCalled();
        motion.update(context({ state: 'victory' }));
        expect(animate).toHaveBeenCalledTimes(qubeMotionTracks('victory').length);
    });
    it('pauses all active parts offscreen/hidden and resumes rather than restarting', () => {
        const { motion, handles, animate } = harness();
        motion.update(context());
        motion.update(context({ visible: false }));
        expect(handles.every(handle => handle.pause.mock.calls.length === 1)).toBe(true);
        motion.update(context());
        expect(handles.every(handle => handle.play.mock.calls.length === 1)).toBe(true);
        expect(animate).toHaveBeenCalledTimes(qubeMotionTracks('idle').length);
    });
    it('cancels a previous outcome when the state changes and discards stale completion callbacks', () => {
        const { motion, handles, animate } = harness();
        motion.update(context({ state: 'victory' }));
        const old = [...handles];
        motion.update(context({ state: 'encouragement' }));
        expect(old.every(handle => handle.cancel.mock.calls.length === 1 && handle.finish === null)).toBe(true);
        expect(motion.activeCount).toBe(qubeMotionTracks('encouragement').length);
        expect(animate).toHaveBeenCalledTimes(old.length + qubeMotionTracks('encouragement').length);
    });
    it('uses the latest actual state if an outcome changes while hidden', () => {
        const { motion, animate } = harness();
        motion.update(context({ visible: false, state: 'anticipation' }));
        motion.update(context({ visible: false, state: 'encouragement' }));
        expect(animate).not.toHaveBeenCalled();
        motion.update(context({ state: 'encouragement' }));
        expect(animate).toHaveBeenCalledTimes(qubeMotionTracks('encouragement').length);
    });
    it('starts no animations with reduced motion and cancels a clip when the preference changes', () => {
        const first = harness();
        first.motion.update(context({ reducedMotion: true, state: 'victory' }));
        expect(first.animate).not.toHaveBeenCalled();
        const second = harness();
        second.motion.update(context({ state: 'victory' }));
        second.motion.update(context({ state: 'victory', reducedMotion: true }));
        expect(second.motion.activeCount).toBe(0);
        expect(second.handles.every(handle => handle.cancel.mock.calls.length === 1)).toBe(true);
        second.motion.update(context({ state: 'victory' }));
        expect(second.animate).toHaveBeenCalledTimes(qubeMotionTracks('victory').length);
    });
    it('cleans up on unmount and is inert after disposal', () => {
        const { motion, handles, animate } = harness();
        motion.update(context());
        motion.dispose();
        motion.dispose();
        expect(motion.activeCount).toBe(0);
        expect(handles.every(handle => handle.cancel.mock.calls.length === 1 && handle.finish === null)).toBe(true);
        motion.update(context({ state: 'victory' }));
        expect(animate).toHaveBeenCalledTimes(qubeMotionTracks('idle').length);
    });
    it('degrades to static SVG when WAAPI is unavailable or a part is absent', () => {
        const motion = createQubeMotionController(() => null);
        expect(() => motion.update(context())).not.toThrow();
        expect(motion.activeCount).toBe(0);
    });
    it('cleans up partial animations if the browser rejects an animation', () => {
        const { handles, animate } = harness();
        let calls = 0;
        const motion = createQubeMotionController(() => { if (calls++ > 0) throw new Error('Animation not available'); return animate(); });
        expect(() => motion.update(context())).not.toThrow();
        expect(motion.activeCount).toBe(0);
        expect(handles[0].cancel).toHaveBeenCalledOnce();
        expect(handles[0].finish).toBeNull();
    });
    it('never requests an infinite or filling animation from the browser', () => {
        const driver = vi.fn(() => null);
        const motion = createQubeMotionController(driver);
        for (const state of states) motion.update(context({ state }));
        for (const [, , options] of driver.mock.calls as unknown as [string, Keyframe[], KeyframeAnimationOptions][]) {
            expect(options.iterations).toBe(1);
            expect(options.fill).toBe('none');
            expect(Number(options.duration)).toBeLessThanOrEqual(3000);
        }
    });
});
