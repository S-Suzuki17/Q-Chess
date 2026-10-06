import type { User } from '../types/game';
import { circuitAccess, type createCircuitAccessStore } from './circuitAccess';
import { acceptVerifiedRankedSession, gameServerUrl, rankedMonotonicNow, rankedSessionRevision,
    readRankedSessionCandidate, type RankedSession } from './rankedSession';

export type LegacyRestoreState = 'checking' | 'valid' | 'invalid' | 'unavailable';
type AccessStore = ReturnType<typeof createCircuitAccessStore>;
const sameCandidate = (a: RankedSession | null, b: RankedSession) =>
    a?.token === b.token && a.userId === b.userId && a.expiresAt === b.expiresAt;

/** Cached appearance never determines identity. */
export function restoredLegacyUser(userId: string, cached: unknown): User {
    const profile = cached && typeof cached === 'object' ? cached as Record<string, unknown> : null;
    const matches = profile?.id === userId;
    return { id: userId, type: 'registered',
        name: matches && typeof profile.name === 'string' && profile.name.length <= 128 ? profile.name : userId,
        ...(matches && typeof profile.avatar_url === 'string' && profile.avatar_url.length <= 2048 ? { avatar_url: profile.avatar_url } : {}),
    };
}

/** One reload attempt; explicit retry only after a temporary outage. */
export function createLegacySessionRestoration(options: {
    onState: (state: LegacyRestoreState) => void; onVerified: (userId: string) => void; access?: AccessStore;
}) {
    const access = options.access ?? circuitAccess;
    const candidate = readRankedSessionCandidate();
    const generation = rankedSessionRevision();
    let cancelled = false, running = false, committing = false, retryable = true;
    let controller: AbortController | undefined;
    let attempt = access.getSnapshot().revision;
    let unsubscribe: (() => void) | undefined;
    const current = () => !cancelled && candidate !== null && generation === rankedSessionRevision() &&
        access.getSnapshot().revision === attempt && sameCandidate(readRankedSessionCandidate(), candidate);
    const cancel = () => { cancelled = true; controller?.abort(); unsubscribe?.(); };
    if (candidate) {
        attempt = access.beginAuthentication();
        unsubscribe = access.subscribe(() => {
            if (!committing && access.getSnapshot().revision !== attempt) { cancel(); options.onState('invalid'); }
        });
    }
    const retry = async () => {
        if (running || cancelled || !retryable) return;
        if (!current() || !candidate) { options.onState('invalid'); return; }
        running = true; controller = new AbortController(); options.onState('checking');
        const started = rankedMonotonicNow();
        let timeout: ReturnType<typeof setTimeout> | undefined;
        let removeAbortListener: (() => void) | undefined;
        try {
            const endpoint = new URL('/auth/ranked-session/status', gameServerUrl());
            if (endpoint.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname)) throw new Error('Unavailable');
            const request = async () => {
                const response = await fetch(endpoint, { method: 'GET', headers: { Authorization: `Bearer ${candidate.token}` },
                    signal: controller!.signal, credentials: 'omit', cache: 'no-store', redirect: 'error' });
                return { response, payload: response.ok ? await response.json() as unknown : null };
            };
            const aborted = new Promise<never>((_, reject) => {
                const stop = () => reject(new Error('Cancelled'));
                controller!.signal.addEventListener('abort', stop, {once:true});
                removeAbortListener = () => controller!.signal.removeEventListener('abort', stop);
            });
            const { response, payload } = await Promise.race([request(), aborted, new Promise<never>((_, reject) => {
                timeout = setTimeout(() => { controller?.abort(); reject(new Error('Unavailable')); }, 15000);
            })]);
            if (!current()) return;
            if (response.status === 401) { retryable = false; options.onState('invalid'); return; }
            if (!response.ok) { options.onState('unavailable'); return; }
            const verified = payload && typeof payload === 'object' ? payload as Record<string, unknown> : null;
            if (!verified || Object.keys(verified).sort().join(',') !== 'expiresAt,serverNow,userId' ||
                verified.userId !== candidate.userId || verified.expiresAt !== candidate.expiresAt ||
                typeof verified.serverNow !== 'number' || !acceptVerifiedRankedSession(candidate, verified.serverNow, started)) {
                retryable = false; options.onState('invalid'); return;
            }
            committing = true;
            const granted = access.grant(restoredLegacyUser(candidate.userId, null), attempt);
            committing = false;
            if (!granted) return;
            cancel(); options.onState('valid'); options.onVerified(candidate.userId);
        } catch { if (current()) options.onState('unavailable'); }
        finally { clearTimeout(timeout); removeAbortListener?.(); running = false; }
    };
    return { retry, cancel, hasCandidate: !!candidate };
}

/** A match cache is navigational state only, usable after matching identity verification. */
export function restoredOnlineMatch(userId: string, cachedUser: unknown, value: unknown, now = Date.now()) {
    const cached = cachedUser && typeof cachedUser === 'object' ? cachedUser as Record<string, unknown> : null;
    const match = value && typeof value === 'object' ? value as Record<string, unknown> : null;
    if (cached?.id !== userId || !match || (match.userId !== undefined && match.userId !== userId) ||
        typeof match.roomId !== 'string' || !match.roomId || match.roomId.length > 256 ||
        !['white','black','spectator'].includes(match.role as string) ||
        !['random','private','ranked'].includes(match.matchMode as string) ||
        typeof match.timestamp !== 'number' || !Number.isFinite(match.timestamp) || match.timestamp > now || now - match.timestamp >= 15*60*1000) return null;
    return { roomId: match.roomId, role: match.role as 'white'|'black'|'spectator',
        matchMode: match.matchMode as 'random'|'private'|'ranked',
        ...(typeof match.opponentId === 'string' ? {opponentId: match.opponentId} : {}),
        tc: (['10s','3m','10m'].includes(match.tc as string) ? match.tc : '10m') as '10s'|'3m'|'10m' };
}
