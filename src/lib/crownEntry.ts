import type { CrownAuthorization } from './crownAdmission';

type Dependencies = {
    enabled(): boolean;
    authorize(userId: string, stageId: number, signal: AbortSignal): Promise<CrownAuthorization>;
    legacyPaid(userId: string, signal: AbortSignal): Promise<boolean>;
    legacyInterstitial(key: string): Promise<unknown>;
};
type EntryResult = { state: 'ready'; canActivate(): boolean } | { state: 'busy' | 'cancelled' | 'reward_required' | 'unavailable' };
/** One pending entry per mounted Campaign. The captured permission predates all
 * asynchronous work, including membership lookup. Stale UI never activates, but
 * a legitimately committed server authorization remains reusable on a new entry. */
export function createCrownEntryController(dependencies: Dependencies) {
    let revision = 0;
    let pending: AbortController | null = null;
    return {
        get pending() { return pending !== null; },
        cancel() { revision++; pending?.abort(); pending = null; },
        async start(userId: string, stageId: number, permit: () => boolean): Promise<EntryResult> {
            if (pending) return { state: 'busy' };
            if (!permit()) return { state: 'cancelled' };
            const attempt = ++revision, controller = new AbortController();
            pending = controller;
            const current = () => revision === attempt && !controller.signal.aborted && permit();
            try {
                if (dependencies.enabled()) {
                    const result = await dependencies.authorize(userId, stageId, controller.signal);
                    if (!current()) return { state: 'cancelled' };
                    if (result.userId !== userId) return { state: 'unavailable' };
                    if (result.state === 'reward_required') return { state: 'reward_required' };
                } else {
                    // Existing public behavior while both release gates are closed.
                    // Interstitial completion is never treated as verified reward evidence.
                    let paid = false;
                    try { paid = await dependencies.legacyPaid(userId, controller.signal); } catch { /* Existing fallback. */ }
                    if (!current()) return { state: 'cancelled' };
                    if (!paid) await dependencies.legacyInterstitial(`circuit-display:${crypto.randomUUID()}`);
                }
                return current() ? { state: 'ready', canActivate: current } : { state: 'cancelled' };
            } catch { return { state: current() ? 'unavailable' : 'cancelled' }; }
            finally { if (pending === controller) pending = null; }
        },
    };
}
