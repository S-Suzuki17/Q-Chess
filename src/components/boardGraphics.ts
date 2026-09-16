export function graphicsQuality(compact: boolean) {
    return { dpr: [1, 1.75] as [number, number], shadows: !compact };
}

/** Keep visual quality intact; a still board only needs frames when its scene changes. */
export function boardFrameLoop(visible: boolean, reducedMotion: boolean): 'always' | 'demand' | 'never' {
    if (!visible) return 'never';
    return reducedMotion ? 'demand' : 'always';
}

/** Keep context recovery separate from game state and remove every listener. */
export function observeGraphicsContext(canvas: EventTarget, page: Document, isLost: () => boolean, lost: () => void, restored: () => void) {
    let recovering = false;
    const onLost = (event: Event) => { event.preventDefault(); recovering = true; lost(); };
    const onRestored = () => { recovering = false; restored(); };
    const onVisible = () => {
        if (page.visibilityState === 'visible') {
            if (isLost()) { recovering = true; lost(); }
            else if (recovering) onRestored();
        }
    };
    canvas.addEventListener('webglcontextlost', onLost);
    canvas.addEventListener('webglcontextrestored', onRestored);
    page.addEventListener('visibilitychange', onVisible);
    return () => {
        canvas.removeEventListener('webglcontextlost', onLost);
        canvas.removeEventListener('webglcontextrestored', onRestored);
        page.removeEventListener('visibilitychange', onVisible);
    };
}

export function observePageVisibility(page: Document, update: (visible: boolean) => void) {
    const read = () => update(page.visibilityState !== 'hidden');
    read();
    page.addEventListener('visibilitychange', read);
    return () => page.removeEventListener('visibilitychange', read);
}
