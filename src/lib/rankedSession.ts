import {clientReleaseHeaders} from './clientRelease';
export const RANKED_SESSION_EVENT = 'qg-ranked-session-change';
const STORAGE_KEY = 'qg_ranked_session_v1';
let generation = 0;
let revoked = false;

export type RankedSession = Readonly<{ token: string; userId: string; expiresAt: number }>;
export const gameServerUrl = () => process.env.NEXT_PUBLIC_SERVER_URL || 'https://q-chess.onrender.com';

export function parseRankedSession(value: unknown, now = Date.now()): RankedSession | null {
    if (!value || typeof value !== 'object') return null;
    const candidate = value as Record<string, unknown>;
    if (typeof candidate.token !== 'string' || candidate.token.length < 16 || candidate.token.length > 16384 ||
        typeof candidate.userId !== 'string' || !candidate.userId || candidate.userId.length > 128 ||
        candidate.userId.startsWith('GUEST-') || typeof candidate.expiresAt !== 'number' ||
        !Number.isFinite(candidate.expiresAt) || candidate.expiresAt <= now) return null;
    return { token: candidate.token, userId: candidate.userId, expiresAt: candidate.expiresAt };
}

export function readRankedSession(userId: string): RankedSession | null {
    if (typeof window === 'undefined' || revoked) return null;
    try {
        const proof = parseRankedSession(JSON.parse(sessionStorage.getItem(STORAGE_KEY) || 'null'));
        return proof?.userId === userId ? proof : null;
    } catch { return null; }
}

export function clearRankedSession(): void {
    generation++;
    revoked = true;
    if (typeof window === 'undefined') return;
    let token:string|undefined;
    try { token=parseRankedSession(JSON.parse(sessionStorage.getItem(STORAGE_KEY)||'null'))?.token; } catch { /* No readable proof. */ }
    try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* Access is revoked in this tab regardless. */ }
    window.dispatchEvent(new Event(RANKED_SESSION_EVENT));
    if(token){
        try {
            const endpoint=new URL('/auth/ranked-session/revoke',gameServerUrl());
            if(endpoint.protocol==='https:'||['localhost','127.0.0.1','[::1]'].includes(endpoint.hostname)){
                void fetch(endpoint,{method:'POST',headers:{Authorization:`Bearer ${token}`},credentials:'omit',cache:'no-store',redirect:'error',keepalive:true}).catch(()=>{});
            }
        } catch { /* Local logout is complete even when the server is unavailable. */ }
    }
}

/** Credentials are sent once over HTTPS and never written to browser storage. */
export async function requestRankedSession(username: string, password: string, signal?: AbortSignal): Promise<RankedSession> {
    const attempt = ++generation;
    const endpoint = new URL('/auth/ranked-session', gameServerUrl());
    if (endpoint.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname)) {
        throw new Error('Ranked login requires a secure connection');
    }
    const response = await fetch(endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json',...clientReleaseHeaders() },
        body: JSON.stringify({ username, password }), signal,
        credentials: 'omit', cache: 'no-store', redirect: 'error',
    });
    if (!response.ok) throw new Error('Ranked login failed');
    const proof = parseRankedSession(await response.json());
    if (!proof || proof.userId !== username || signal?.aborted || attempt !== generation) {
        throw new Error('Ranked login could not be verified');
    }
    // A blocked sessionStorage must not report successful authorization.
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(proof));
    revoked = false;
    window.dispatchEvent(new Event(RANKED_SESSION_EVENT));
    return proof;
}
