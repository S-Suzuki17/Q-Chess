export const AD_AGE_GROUPS = ['under13', '13to15', '16to17', '18plus'] as const;
export type AdAgeGroup = typeof AD_AGE_GROUPS[number];
const key = 'qg.ad-audience.v1';
let sessionChoice: AdAgeGroup | null = null;
let prompt: ((finish: (choice: AdAgeGroup | null) => void) => void) | null = null;
let pending: Promise<boolean> | null = null;
let cancel: (() => void) | null = null;
const valid = (value: unknown): value is AdAgeGroup => AD_AGE_GROUPS.includes(value as AdAgeGroup);

/** Only an age range is kept on this device. It is never sent to the ad provider
 * or our server. All ranges retain child/under-age/General SDK treatment. */
export function readAdAgeGroup(): AdAgeGroup | null {
    if (sessionChoice) return sessionChoice;
    try { const value = localStorage.getItem(key); return valid(value) ? value : null; }
    catch { return null; }
}
export function registerAdAudiencePrompt(handler: NonNullable<typeof prompt>) {
    prompt = handler;
    return () => { if (prompt === handler) { prompt = null; cancel?.(); } };
}
export function ensureAdAudience(force = false): Promise<boolean> {
    if (pending) return pending;
    if (!force && readAdAgeGroup()) return Promise.resolve(true);
    if (!prompt) return Promise.resolve(false);
    const show = prompt;
    pending = new Promise<boolean>(resolve => {
        const finish = (choice: AdAgeGroup | null) => {
            cancel = null;
            if (valid(choice)) {
                sessionChoice = choice;
                try { localStorage.setItem(key, choice); } catch { /* Session-only choice. */ }
            }
            resolve(valid(choice));
        };
        cancel = () => finish(null);
        show(finish);
    }).finally(() => { pending = null; });
    return pending;
}
