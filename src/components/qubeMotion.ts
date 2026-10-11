/** Bounded, deterministic 2D rig tracks. No RAF, timer, GPU, or gameplay state. */
export type QubeState = 'idle' | 'anticipation' | 'victory' | 'encouragement';
export type QubeExpression = 'neutral' | 'confident' | 'joy' | 'encouraging';
export type QubePart = 'head' | 'body' | 'arm-left' | 'arm-right' | 'forearm-left' | 'forearm-right' | 'hand-left' | 'hand-right' | 'leg-left' | 'leg-right' | 'eye-left' | 'eye-right' | 'lid-left' | 'lid-right' | 'shadow' | 'spark-left' | 'spark-right';
type Pose = { x: number; y: number; rotation: number; scaleX: number; scaleY: number; opacity: number };
type Stop = { at: number; pose: Partial<Pose> };
export type QubeTrack = { part: QubePart; stops: readonly Stop[] };
export const QUBE_MOTION_DURATION: Readonly<Record<QubeState, number>> = { idle: 1800, anticipation: 2200, victory: 3000, encouragement: 2600 };
export const QUBE_EXPRESSION: Readonly<Record<QubeState, QubeExpression>> = { idle: 'neutral', anticipation: 'confident', victory: 'joy', encouragement: 'encouraging' };

// Rig coordinates match the original artwork's 300 × 310 viewBox.
export const QUBE_PIVOTS: Readonly<Record<QubePart, readonly [number, number]>> = {
    head: [137, 213], body: [137, 281],
    'arm-left': [93, 216], 'arm-right': [188, 221],
    'forearm-left': [85, 244], 'forearm-right': [204, 256],
    'hand-left': [84, 258], 'hand-right': [209, 273],
    'leg-left': [102, 270], 'leg-right': [150, 275],
    'eye-left': [91, 165], 'eye-right': [160, 161],
    'lid-left': [91, 166], 'lid-right': [160, 162],
    shadow: [134, 293], 'spark-left': [35, 99], 'spark-right': [244, 104],
};
const REST: Pose = { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, opacity: 1 };
const stop = (at: number, pose: Partial<Pose> = {}): Stop => ({ at, pose });
const track = (part: QubePart, ...stops: Stop[]): QubeTrack => ({ part, stops });
const blink = (part: 'eye-left' | 'eye-right', at: number): QubeTrack => track(part, stop(0), stop(at), stop(at + 0.035, { scaleY: 0.08 }), stop(at + 0.08), stop(1));
const lid = (part: 'lid-left' | 'lid-right', at: number): QubeTrack => track(part, stop(0), stop(at), stop(at + 0.035, { scaleY: 0.12, y: -1 }), stop(at + 0.08), stop(1));
const spark = (part: 'spark-left' | 'spark-right', delay: number): QubeTrack => track(part,
    stop(0, { scaleX: 0.3, scaleY: 0.3, opacity: 0 }), stop(delay, { scaleX: 0.3, scaleY: 0.3, opacity: 0 }),
    stop(delay + 0.08, { scaleX: 1, scaleY: 1, opacity: 1 }), stop(delay + 0.3, { y: -8, rotation: 16, opacity: 0.7 }),
    stop(delay + 0.4, { y: -13, rotation: 24, scaleX: 0.7, scaleY: 0.7, opacity: 0 }), stop(1, { opacity: 0 }));

const TRACKS: Readonly<Record<QubeState, readonly QubeTrack[]>> = {
    idle: [
        track('body', stop(0), stop(0.4, { scaleX: 1.015, scaleY: 1.025 }), stop(1)),
        track('head', stop(0), stop(0.4, { y: -1.5, rotation: -1.5 }), stop(1)),
        blink('eye-left', 0.48), blink('eye-right', 0.49), lid('lid-left', 0.48), lid('lid-right', 0.49),
        track('hand-right', stop(0), stop(0.45, { rotation: -5 }), stop(1)),
    ],
    anticipation: [
        track('body', stop(0), stop(0.28, { rotation: -2.5, scaleY: 1.015 }), stop(0.76, { rotation: -2.5, scaleY: 1.015 }), stop(1)),
        track('head', stop(0), stop(0.25, { rotation: -4, x: -2, y: -2 }), stop(0.64, { rotation: -3, x: -2, y: -2 }), stop(1)),
        track('arm-right', stop(0), stop(0.25, { rotation: -34 }), stop(0.7, { rotation: -34 }), stop(1)),
        track('forearm-right', stop(0), stop(0.3, { rotation: -46 }), stop(0.7, { rotation: -40 }), stop(1)),
        track('hand-right', stop(0), stop(0.35, { rotation: -12 }), stop(0.52, { rotation: 8 }), stop(0.7, { rotation: -12 }), stop(1)),
        blink('eye-left', 0.64), blink('eye-right', 0.64), lid('lid-left', 0.64), lid('lid-right', 0.64),
    ],
    victory: [
        track('body', stop(0), stop(0.1, { scaleX: 1.035, scaleY: 0.95, y: 3 }), stop(0.24, { scaleX: 0.99, scaleY: 1.04, y: -3 }), stop(0.4), stop(0.64, { scaleY: 1.02, y: -1 }), stop(1)),
        track('head', stop(0), stop(0.1, { y: 2, rotation: -5 }), stop(0.26, { y: -5, rotation: 7 }), stop(0.5, { y: -1, rotation: -6 }), stop(0.72, { rotation: 4 }), stop(1)),
        track('arm-right', stop(0), stop(0.24, { rotation: -118 }), stop(0.74, { rotation: -105 }), stop(1)),
        track('forearm-right', stop(0), stop(0.26, { rotation: -24 }), stop(0.4, { rotation: 14 }), stop(0.53, { rotation: -24 }), stop(0.67, { rotation: 14 }), stop(1)),
        track('hand-right', stop(0), stop(0.27, { rotation: 14 }), stop(0.45, { rotation: -18 }), stop(0.63, { rotation: 14 }), stop(1)),
        track('leg-left', stop(0), stop(0.26, { rotation: 8, y: -2 }), stop(0.5), stop(1)),
        track('leg-right', stop(0), stop(0.26), stop(0.5, { rotation: -8, y: -2 }), stop(0.75), stop(1)),
        spark('spark-left', 0.2), spark('spark-right', 0.31),
    ],
    encouragement: [
        track('head', stop(0), stop(0.2, { rotation: 6, y: 2 }), stop(0.38, { rotation: 6, y: -1 }), stop(0.52, { rotation: 6, y: 2 }), stop(0.72, { rotation: 3 }), stop(1)),
        track('body', stop(0), stop(0.25, { rotation: 2 }), stop(0.7, { rotation: 2 }), stop(1)),
        track('arm-right', stop(0), stop(0.22, { rotation: -96 }), stop(0.73, { rotation: -90 }), stop(1)),
        track('forearm-right', stop(0), stop(0.24, { rotation: -18 }), stop(0.4, { rotation: 12 }), stop(0.54, { rotation: -18 }), stop(0.69, { rotation: 12 }), stop(1)),
        track('hand-right', stop(0), stop(0.27, { rotation: -14 }), stop(0.4, { rotation: 20 }), stop(0.53, { rotation: -14 }), stop(0.66, { rotation: 20 }), stop(1)),
        track('hand-left', stop(0), stop(0.35, { rotation: 8 }), stop(0.75, { rotation: 8 }), stop(1)),
        blink('eye-left', 0.69), blink('eye-right', 0.69), lid('lid-left', 0.69), lid('lid-right', 0.69),
    ],
};

export function qubeMotionTracks(state: QubeState): readonly QubeTrack[] { return TRACKS[state]; }
function fullPose(pose: Partial<Pose>): Pose { return { ...REST, ...pose }; }

/** A matrix works in both WAAPI CSS and offline SVG previews with identical pivots. */
function matrix(part: QubePart, pose: Pose): string {
    const [px, py] = QUBE_PIVOTS[part];
    const radians = pose.rotation * Math.PI / 180;
    const a = Math.cos(radians) * pose.scaleX, b = Math.sin(radians) * pose.scaleX;
    const c = -Math.sin(radians) * pose.scaleY, d = Math.cos(radians) * pose.scaleY;
    const e = px + pose.x - a * px - c * py, f = py + pose.y - b * px - d * py;
    return `matrix(${[a, b, c, d, e, f].map(value => Number(value.toFixed(5))).join(',')})`;
}
/** Matching transform functions retain joint rotation during browser interpolation. */
function cssTransform(part: QubePart, pose: Pose): string {
    const [x, y] = QUBE_PIVOTS[part];
    return `translate(${pose.x}px,${pose.y}px) translate(${x}px,${y}px) rotate(${pose.rotation}deg) scale(${pose.scaleX},${pose.scaleY}) translate(${-x}px,${-y}px)`;
}
export function qubeTrackKeyframes(value: QubeTrack): Keyframe[] {
    return value.stops.map(({ at, pose }) => ({ offset: at, transform: cssTransform(value.part, fullPose(pose)), opacity: fullPose(pose).opacity, easing: 'cubic-bezier(0.4,0,0.2,1)' }));
}
function ease(progress: number): number {
    if (progress <= 0 || progress >= 1) return progress;
    // Invert the exact CSS easing's x curve; then evaluate its y curve.
    let low = 0, high = 1;
    for (let i = 0; i < 18; i++) {
        const t = (low + high) / 2;
        const x = 3 * (1 - t) * (1 - t) * t * 0.4 + 3 * (1 - t) * t * t * 0.2 + t * t * t;
        if (x < progress) low = t; else high = t;
    }
    const t = (low + high) / 2;
    return 3 * (1 - t) * t * t + t * t * t;
}

export type QubeSample = Partial<Record<QubePart, { transform: string; opacity: number }>>;
/** Deterministic reference poses for art review/tests, never a runtime animation loop. */
export function qubePoseAt(state: QubeState, timeMs: number, reducedMotion = false): QubeSample {
    if (reducedMotion) return {};
    const progress = Math.min(1, Math.max(0, Number.isFinite(timeMs) ? timeMs / QUBE_MOTION_DURATION[state] : 0));
    const result: QubeSample = {};
    for (const value of TRACKS[state]) {
        let before = value.stops[0], after = value.stops[value.stops.length - 1];
        for (let i = 1; i < value.stops.length; i++) {
            if (progress <= value.stops[i].at) { before = value.stops[i - 1]; after = value.stops[i]; break; }
        }
        const proportion = ease(after.at === before.at ? 1 : (progress - before.at) / (after.at - before.at));
        const left = fullPose(before.pose), right = fullPose(after.pose);
        const pose = { ...REST };
        for (const key of Object.keys(REST) as (keyof Pose)[]) pose[key] = left[key] + (right[key] - left[key]) * proportion;
        result[value.part] = { transform: matrix(value.part, pose), opacity: pose.opacity };
    }
    return result;
}

export interface QubeAnimationHandle {
    play(): void;
    pause(): void;
    cancel(): void;
    setFinished(callback: (() => void) | null): void;
}
export type QubeAnimationDriver = (part: QubePart, frames: Keyframe[], options: KeyframeAnimationOptions) => QubeAnimationHandle | null;
export type QubeMotionContext = { state: QubeState; visible: boolean; reducedMotion: boolean };

/** Inject the browser boundary so lifecycle guarantees are testable without a GPU/DOM. */
export function createQubeMotionController(animate: QubeAnimationDriver) {
    const active = new Set<QubeAnimationHandle>();
    let previous: QubeMotionContext | undefined;
    let playedState: QubeState | undefined;
    let disposed = false;
    function cancel() {
        for (const handle of active) { handle.setFinished(null); handle.cancel(); }
        active.clear();
    }
    return {
        update(context: QubeMotionContext) {
            if (disposed) return;
            if (previous?.state !== context.state) { cancel(); playedState = undefined; }
            if (context.reducedMotion) { cancel(); playedState = context.state; }
            else if (!context.visible) { for (const handle of active) handle.pause(); }
            else if (playedState !== context.state) {
                playedState = context.state;
                try {
                    for (const value of TRACKS[context.state]) {
                        const handle = animate(value.part, qubeTrackKeyframes(value), { duration: QUBE_MOTION_DURATION[context.state], iterations: 1, fill: 'none', easing: 'linear' });
                        if (!handle) continue;
                        active.add(handle);
                        handle.setFinished(() => { active.delete(handle); handle.setFinished(null); handle.cancel(); });
                    }
                } catch { cancel(); /* Animation support is optional; static SVG remains intact. */ }
            } else if (previous && !previous.visible) { for (const handle of active) handle.play(); }
            previous = { ...context };
        },
        dispose() { disposed = true; cancel(); },
        get activeCount() { return active.size; },
    };
}
