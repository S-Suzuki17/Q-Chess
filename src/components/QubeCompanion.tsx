'use client';

import { useEffect, useRef, type CSSProperties } from 'react';
import { QubeArtwork } from './qubeArtwork';
import { createQubeMotionController, QUBE_EXPRESSION, type QubeState } from './qubeMotion';
import './qube-companion.css';

export type { QubeState } from './qubeMotion';
export type QubeCompanionProps = {
    /** Derived by the caller from the real UI or match outcome. */
    state?: QubeState;
    size?: number;
    compact?: boolean;
    reducedMotion?: boolean;
    paused?: boolean;
    label?: string;
    decorative?: boolean;
    className?: string;
};

/** One articulated 2D guide per hero/result, never a canvas or a collection-item loop. */
export function QubeCompanion({ state = 'idle', size, compact = false, reducedMotion = false, paused = false, label = 'QUBE', decorative = false, className = '' }: QubeCompanionProps) {
    const root = useRef<HTMLSpanElement>(null);
    const context = useRef({ state, reducedMotion, paused });
    const sync = useRef<(() => void) | null>(null);

    useEffect(() => {
        const element = root.current;
        if (!element) return;
        const motionQuery = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
        // Until the observer has measured the element, keep it completely still.
        let inView = typeof IntersectionObserver === 'undefined';
        const motion = createQubeMotionController((part, frames, options) => {
            const target = element.querySelector<SVGElement>(`[data-qube-part="${part}"]`);
            if (!target || typeof target.animate !== 'function') return null;
            const animation = target.animate(frames, options);
            return { play: () => animation.play(), pause: () => animation.pause(), cancel: () => animation.cancel(), setFinished: callback => { animation.onfinish = callback; } };
        });
        const update = () => motion.update({ state: context.current.state, visible: inView && !document.hidden && !context.current.paused, reducedMotion: context.current.reducedMotion || Boolean(motionQuery?.matches) });
        sync.current = update;
        const observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(entries => {
            const entry = entries.find(value => value.target === element);
            if (entry) { inView = entry.isIntersecting; update(); }
        }, { threshold: 0.05 });
        observer?.observe(element);
        document.addEventListener('visibilitychange', update);
        motionQuery?.addEventListener?.('change', update);
        update();
        return () => {
            observer?.disconnect();
            document.removeEventListener('visibilitychange', update);
            motionQuery?.removeEventListener?.('change', update);
            motion.dispose();
            sync.current = null;
        };
    }, []);

    useEffect(() => {
        context.current = { state, reducedMotion, paused };
        sync.current?.();
    }, [state, reducedMotion, paused]);

    const style = size === undefined || !Number.isFinite(size) ? undefined : { '--qube-size': `${Math.min(160, Math.max(48, size))}px` } as CSSProperties;
    return <span ref={root} className={`qube-companion ${className}`.trim()} style={style} data-qube-state={state} data-qube-compact={compact} data-qube-reduced-motion={reducedMotion || undefined} role={decorative ? undefined : 'img'} aria-label={decorative ? undefined : label} aria-hidden={decorative || undefined}>
        <QubeArtwork expression={QUBE_EXPRESSION[state]} sweat={false} aria-hidden="true" focusable="false" />
    </span>;
}
