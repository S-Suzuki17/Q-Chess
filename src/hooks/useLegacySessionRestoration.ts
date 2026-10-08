'use client';
import { useEffect, useRef, useState } from 'react';
import { circuitAccess, isSameCircuitIdentity } from '../lib/circuitAccess';
import { createLegacySessionRestoration, type LegacyRestoreState } from '../lib/legacySessionRestoration';
import { invalidateRankedSessionRestoration, RANKED_SESSION_STORAGE_KEY } from '../lib/rankedSession';

export function useLegacySessionRestoration(onVerified: (userId: string) => void, enabled = true) {
    const callback = useRef(onVerified);
    useEffect(() => { callback.current = onVerified; }, [onVerified]);
    const runner = useRef<ReturnType<typeof createLegacySessionRestoration> | null>(null);
    const [state, setState] = useState<LegacyRestoreState>('invalid');
    const [hasCandidate, setHasCandidate] = useState(false);
    useEffect(() => {
        if (!enabled) return;
        const restore = createLegacySessionRestoration({ onState: setState, onVerified: id => callback.current(id) });
        runner.current = restore; setHasCandidate(restore.hasCandidate);
        const changed = (event: StorageEvent) => {
            if (event.key === null || event.key === RANKED_SESSION_STORAGE_KEY ||
                (event.key === 'qg_last_user' && !isSameCircuitIdentity(event.oldValue, event.newValue))) {
                restore.cancel(); invalidateRankedSessionRestoration(); circuitAccess.revoke(); setState('invalid');
            }
        };
        window.addEventListener('storage', changed); void restore.retry();
        return () => { restore.cancel(); window.removeEventListener('storage', changed); };
    }, [enabled]);
    return { state, hasCandidate, retry: () => { void runner.current?.retry(); } };
}
