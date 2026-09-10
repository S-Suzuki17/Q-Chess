export function graphicsQuality(compact: boolean) {
    return { dpr: compact ? 1 : 1.5, shadows: !compact };
}

/** Keep context recovery separate from game state and remove every listener. */
export function observeGraphicsContext(canvas: EventTarget, page: Document, isLost: () => boolean, lost: () => void, restored: () => void) {
    const onLost = (event: Event) => { event.preventDefault(); lost(); };
    const onRestored = () => restored();
    const onVisible = () => {
        if (page.visibilityState === 'visible') {
            if (isLost()) lost(); else restored();
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
