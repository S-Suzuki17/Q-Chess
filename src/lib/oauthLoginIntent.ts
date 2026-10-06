/** Tab-local intent only, never identity or authentication. Enables the callback
 * to supersede a saved legacy candidate only after an explicit OAuth choice. */
export const OAUTH_LOGIN_INTENT_KEY = 'qg_oauth_login_intent_v1';
const MAX_AGE = 10 * 60 * 1000;
let cancelled = false;
export function hasOAuthLoginIntent(now = Date.now()): boolean {
    if (typeof window === 'undefined' || cancelled) return false;
    try {
        const value = JSON.parse(sessionStorage.getItem(OAUTH_LOGIN_INTENT_KEY) || 'null');
        return value?.version === 1 && Number.isSafeInteger(value.createdAt) && value.createdAt <= now && now - value.createdAt < MAX_AGE;
    } catch { return false; }
}
export function beginOAuthLoginIntent(): void {
    const value = JSON.stringify({ version: 1, createdAt: Date.now() });
    sessionStorage.setItem(OAUTH_LOGIN_INTENT_KEY, value);
    if (sessionStorage.getItem(OAUTH_LOGIN_INTENT_KEY) !== value) throw new Error('Sign-in intent could not be stored');
    cancelled = false;
}
export function clearOAuthLoginIntent(): void {
    cancelled = true;
    try { sessionStorage.removeItem(OAUTH_LOGIN_INTENT_KEY); } catch { /* Never grant from intent alone. */ }
}

export type OAuthCallbackShape = Readonly<{kind:'implicit'|'pkce'|'none';failed:boolean}>;
/** Capture before the SDK consumes the URL. Retain only parameter presence,
 * never access tokens, refresh tokens, authorization codes or descriptions. */
export function captureOAuthCallback(location = typeof window !== 'undefined' ? window.location : undefined): OAuthCallbackShape {
    const query = new URLSearchParams(location?.search ?? '');
    const hash = new URLSearchParams((location?.hash ?? '').replace(/^#/,''));
    const has = (key:string) => query.has(key) || hash.has(key);
    const implicit = hash.has('access_token'), pkce = query.has('code');
    return {kind:implicit?'implicit':pkce?'pkce':'none',
        failed:has('error')||has('error_description')||has('error_code')||(implicit&&pkce)};
}

export function completedOAuthCallback(initial: OAuthCallbackShape, initializationError: unknown): boolean {
    const current = captureOAuthCallback();
    // A successful SDK initialization can merely recover an old stored session.
    // Require actual callback consumption too, including the missing-PKCE-verifier case.
    return initializationError === null && initial.kind !== 'none' && !initial.failed && current.kind === 'none' && !current.failed;
}
