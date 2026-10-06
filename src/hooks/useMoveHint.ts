'use client';

import { useEffect, useRef, useState } from 'react';
import { isValidHintMove, type HintMove } from '../components/boardPresentation';

/** Position-keyed, abortable advice: a late worker reply must not annotate a new position. */
export function useMoveHint(positionKey: string) {
    const controller = useRef<AbortController | null>(null);
    const [result, setResult] = useState<{ key: string; move: HintMove } | null>(null);
    // A reused position key must not revive a request aborted by effect cleanup.
    // Keep its signal in state so cleanup can invalidate pending without a setState on unmount.
    const [pendingRequest, setPendingRequest] = useState<{ key: string; signal: AbortSignal } | null>(null);
    const [failedKey, setFailedKey] = useState<string | null>(null);
    useEffect(() => () => { controller.current?.abort(); controller.current = null; }, [positionKey]);

    async function request(search: (signal: AbortSignal) => Promise<HintMove | null>, onDelivered?:()=>void) {
        controller.current?.abort();
        const active = new AbortController();
        controller.current = active;
        const isActive = () => controller.current === active && !active.signal.aborted;
        setPendingRequest({ key: positionKey, signal: active.signal });
        setResult(null);
        setFailedKey(null);
        try {
            const move = await search(active.signal);
            if (!isActive()) return;
            if (isValidHintMove(move)) { setResult({ key: positionKey, move }); onDelivered?.(); }
            else setFailedKey(positionKey);
        } catch {
            if (isActive()) setFailedKey(positionKey);
        } finally {
            if (isActive()) { setPendingRequest(null); controller.current = null; }
        }
    }
    function clear() {
        controller.current?.abort();
        controller.current = null;
        setResult(null); setPendingRequest(null); setFailedKey(null);
    }
    return { hintMove: result?.key === positionKey ? result.move : null,
        pending: pendingRequest?.key === positionKey && !pendingRequest.signal.aborted, failed: failedKey === positionKey, request, clear };
}
