import {clientReleaseHeaders} from './clientRelease';
export const RANKED_SESSION_EVENT = 'qg-ranked-session-change';
export const RANKED_SESSION_STORAGE_KEY = 'qg_ranked_session_v1';
const STORAGE_KEY = RANKED_SESSION_STORAGE_KEY;
const STORAGE_LOCATIONS = ['session', 'local'] as const;
type StorageLocation = typeof STORAGE_LOCATIONS[number];
let generation = 0;
let revoked = false;
// A blocked storage removal must not make a server-revoked proof usable in this tab.
const revokedTokens = new Set<string>();
const MAX_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;
// Never persisted: reload must verify with the server again.
let verifiedClock: { token: string; expiresAt: number; deadline: number; observed: number; wallDeadline: number; observedWall: number } | null = null;
export const rankedSessionRevision = () => generation;
export const rankedMonotonicNow = () => performance.now();

export type RankedSession = Readonly<{ token: string; userId: string; expiresAt: number }>;
export const gameServerUrl = () => process.env.NEXT_PUBLIC_SERVER_URL || 'https://q-chess.onrender.com';

/** Structural candidate only, never proof of login. Deliberately clock-independent. */
export function parseRankedSessionCandidate(value: unknown): RankedSession | null {
    if (!value || typeof value !== 'object') return null;
    const candidate = value as Record<string, unknown>;
    if (typeof candidate.token !== 'string' || candidate.token.length < 16 || candidate.token.length > 16384 ||
        typeof candidate.userId !== 'string' || !candidate.userId || candidate.userId.length > 128 ||
        candidate.userId !== candidate.userId.trim() || /[\u0000-\u001f\u007f]/.test(candidate.userId) ||
        /^(?:guest(?:[-_]|$)|anon(?:ymous)?(?:[-_]|$)|cpu(?:[-_]|$)|ai(?::|$)|supabase-)/i.test(candidate.userId) ||
        typeof candidate.expiresAt !== 'number' || !Number.isSafeInteger(candidate.expiresAt) || candidate.expiresAt <= 0) return null;
    return { token: candidate.token, userId: candidate.userId, expiresAt: candidate.expiresAt };
}

export function parseRankedSession(value: unknown, now = Date.now()): RankedSession | null {
    const candidate = parseRankedSessionCandidate(value);
    return candidate && candidate.expiresAt > now ? candidate : null;
}

export function rankedSessionRemainingMs(proof: RankedSession): number {
    if (verifiedClock?.token === proof.token && verifiedClock.expiresAt === proof.expiresAt) {
        const now = rankedMonotonicNow(), wallNow = Date.now();
        if (!Number.isFinite(now) || !Number.isFinite(wallNow) || now < verifiedClock.observed || wallNow < verifiedClock.observedWall) {
            verifiedClock.deadline = 0; return 0;
        }
        verifiedClock.observed = now; verifiedClock.observedWall = wallNow;
        // Wall elapsed also covers platforms whose monotonic clock pauses during sleep.
        return Math.max(0, Math.min(verifiedClock.deadline - now, verifiedClock.wallDeadline - wallNow));
    }
    return Math.max(0, proof.expiresAt - Date.now());
}

/** Conservative UI timer: subtract ALL transit/processing time. Server authorization
 * remains authoritative for every privileged request. Never extend stored expiry. */
export function acceptVerifiedRankedSession(proof: RankedSession, serverNow: number, started: number): boolean {
    const remaining = proof.expiresAt - serverNow;
    const now = rankedMonotonicNow();
    if (!Number.isSafeInteger(serverNow) || serverNow <= 0 || remaining <= 0 || remaining > MAX_LIFETIME_MS ||
        !Number.isFinite(started) || started < 0 || !Number.isFinite(now) || started > now || started + remaining <= now) return false;
    const wallNow = Date.now();
    verifiedClock = { token: proof.token, expiresAt: proof.expiresAt, deadline: started + remaining, observed: now,
        wallDeadline: wallNow + started + remaining - now, observedWall: wallNow };
    return true;
}

/** One deterministic reload candidate. Never silently fall back to another account. */
export function readRankedSessionCandidate(userId?: string): RankedSession | null {
    if (typeof window === 'undefined' || revoked) return null;
    for (const location of STORAGE_LOCATIONS) {
        const candidate = readStoredSession(location);
        if (candidate && (userId === undefined || candidate.userId === userId)) return revokedTokens.has(candidate.token) ? null : candidate;
    }
    return null;
}

export function readRankedSession(userId: string): RankedSession | null {
    if (typeof window === 'undefined' || revoked) return null;
    for (const location of STORAGE_LOCATIONS) {
        const proof = readStoredSession(location);
        if (proof?.userId === userId && !revokedTokens.has(proof.token) && rankedSessionRemainingMs(proof) > 0) return proof;
    }
    return null;
}

/** Cross-tab invalidation cancels work without revoking a different tab's token. */
export function invalidateRankedSessionRestoration(): void { generation++; verifiedClock = null; }

function browserStorage(location: StorageLocation): Storage {
    return location === 'local' ? localStorage : sessionStorage;
}

function readStoredSession(location: StorageLocation): RankedSession | null {
    try {
        return parseRankedSessionCandidate(JSON.parse(browserStorage(location).getItem(STORAGE_KEY) || 'null'));
    } catch { return null; }
}

function invalidateStoredSessions(issuedToken?: string): void {
    invalidateRankedSessionRestoration();
    revoked = true;
    if (typeof window === 'undefined') return;
    const tokens = new Set<string>(issuedToken ? [issuedToken] : []);
    for (const location of STORAGE_LOCATIONS) {
        const proof = readStoredSession(location);
        if (proof) tokens.add(proof.token);
        // A failure in one store must not prevent cleanup of the other.
        try { browserStorage(location).removeItem(STORAGE_KEY); } catch { /* Revoked in this tab regardless. */ }
    }
    window.dispatchEvent(new Event(RANKED_SESSION_EVENT));
    for (const token of tokens) {
        try {
            const endpoint=new URL('/auth/ranked-session/revoke',gameServerUrl());
            if(endpoint.protocol==='https:'||['localhost','127.0.0.1','[::1]'].includes(endpoint.hostname)){
                void fetch(endpoint,{method:'POST',headers:{Authorization:`Bearer ${token}`},credentials:'omit',cache:'no-store',redirect:'error',keepalive:true}).catch(()=>{});
            }
        } catch { /* Local logout is complete even when the server is unavailable. */ }
    }
}

export function clearRankedSession(): void {
    invalidateStoredSessions();
}

/** A server notice owns only the saved proof used by that socket, never logout.
 * A newer login attempt does not protect the old proof from revocation, but
 * its generation must remain intact so that a pending fresh proof can still win.
 * The server already revoked this token; do not revoke other saved/device tokens. */
export function forgetRevokedRankedSession(proof: RankedSession, expectedRevision: number): boolean {
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0 || expectedRevision > generation) return false;
    const candidate = readRankedSessionCandidate();
    if (candidate?.token !== proof.token || candidate.userId !== proof.userId || candidate.expiresAt !== proof.expiresAt) return false;
    if (expectedRevision === generation) generation++;
    revokedTokens.add(proof.token);
    if (verifiedClock?.token === proof.token) verifiedClock = null;
    for (const location of STORAGE_LOCATIONS) {
        if (readStoredSession(location)?.token !== proof.token) continue;
        try { browserStorage(location).removeItem(STORAGE_KEY); } catch { /* Rejected in this tab regardless. */ }
    }
    window.dispatchEvent(new Event(RANKED_SESSION_EVENT));
    return true;
}

/** Credentials are sent once over HTTPS and never written to browser storage. */
export async function requestRankedSession(username: string, password: string, keepLoggedIn: boolean, signal?: AbortSignal): Promise<RankedSession> {
    const attempt = ++generation;
    const endpoint = new URL('/auth/ranked-session', gameServerUrl());
    if (endpoint.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname)) {
        throw new Error('Ranked login requires a secure connection');
    }
    const started = rankedMonotonicNow();
    const response = await fetch(endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json',...clientReleaseHeaders() },
        body: JSON.stringify({ username, password, keepLoggedIn }), signal,
        credentials: 'omit', cache: 'no-store', redirect: 'error',
    });
    if (!response.ok) throw new Error('Ranked login failed');
    const payload: unknown = await response.json();
    const proof = parseRankedSessionCandidate(payload);
    const serverNow = (payload as {serverNow?: unknown} | null)?.serverNow;
    if (!proof || revokedTokens.has(proof.token) || proof.userId !== username || signal?.aborted || attempt !== generation ||
        (serverNow === undefined ? !parseRankedSession(proof) :
            typeof serverNow !== 'number' || !acceptVerifiedRankedSession(proof, serverNow, started))) {
        throw new Error('Ranked login could not be verified');
    }
    // A successful explicit choice owns exactly one store. Clear the opposite
    // store first, especially an old persistent token when persistence is OFF.
    // Do not fall back to a different lifetime if storage access is blocked.
    try {
        browserStorage(keepLoggedIn ? 'session' : 'local').removeItem(STORAGE_KEY);
        browserStorage(keepLoggedIn ? 'local' : 'session').setItem(STORAGE_KEY, JSON.stringify(proof));
    } catch {
        invalidateStoredSessions(proof.token);
        throw new Error('Ranked login could not be stored');
    }
    revoked = false;
    window.dispatchEvent(new Event(RANKED_SESSION_EVENT));
    return proof;
}
