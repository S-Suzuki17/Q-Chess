/** An optional ad belongs to a completed run, never to starting a game.
 * Serialize result buttons and recheck the captured screen/account permission. */
export function createCircuitResultTransition(show: (key: string, userId: string) => Promise<unknown>) {
    let busy = false;
    let attemptedRun: string | null = null;
    return async (runKey: string, userId: string, permit: () => boolean, action: () => void | Promise<void>) => {
        if (busy || !runKey || !permit()) return false;
        busy = true;
        try {
            if (attemptedRun !== runKey) {
                attemptedRun = runKey;
                try { await show(runKey, userId); } catch { /* Optional ad failure never traps a result. */ }
            }
            if (!permit()) return false;
            await action();
            return true;
        } finally { busy = false; }
    };
}
