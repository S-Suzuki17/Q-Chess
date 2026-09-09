'use client';

import { useEffect, useRef, useState } from 'react';
import { isValidHintMove, type HintMove } from '../components/boardPresentation';

/** Position-keyed, abortable advice: a late worker reply must not annotate a new position. */
export function useMoveHint(positionKey: string) {
    const controller = useRef<AbortController | null>(null);
    const [result, setResult] = useState<{ key: string; move: HintMove } | null>(null);
    const [pendingKey, setPendingKey] = useState<string | null>(null);
    const [failedKey, setFailedKey] = useState<string | null>(null);
    useEffect(() => () => { controller.current?.abort(); controller.current = null; }, [positionKey]);

    async function request(search: (signal: AbortSignal) => Promise<HintMove | null>) {
        controller.current?.abort();
        const active = new AbortController();
        controller.current = active;
        setPendingKey(positionKey);
        setResult(null);
        setFailedKey(null);
        try {
            const move = await search(active.signal);
            if (active.signal.aborted) return;
            if (isValidHintMove(move)) setResult({ key: positionKey, move });
            else setFailedKey(positionKey);
        } catch {
            if (!active.signal.aborted) setFailedKey(positionKey);
        } finally {
            if (!active.signal.aborted) { setPendingKey(null); controller.current = null; }
        }
    }
    function clear() {
        controller.current?.abort();
        controller.current = null;
        setResult(null); setPendingKey(null); setFailedKey(null);
    }
    return { hintMove: result?.key === positionKey ? result.move : null,
        pending: pendingKey === positionKey, failed: failedKey === positionKey, request, clear };
}
