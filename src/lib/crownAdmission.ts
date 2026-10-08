'use client';
import { crownAdmissionEnabled, crownRankKey } from '../config/crownAdmission';
import { supabase } from './supabaseClient';
import { gameServerUrl, readRankedSession } from './rankedSession';

export type CrownAuthorization =
    | { state: 'reward_required'; userId: string; rankKey: string }
    | { state: 'authorized'; userId: string; rankKey: string; authorizationId: string;
        source: 'verified_ad' | 'subscription' | 'legacy_campaign'; reused: boolean };
export function parseCrownAuthorization(value: unknown, userId: string, rankKey: string): CrownAuthorization {
    const row = value as CrownAuthorization;
    if (!row || row.userId !== userId || row.rankKey !== rankKey) throw new Error('CROWN_UNAVAILABLE');
    if (row.state === 'reward_required') return { state: row.state, userId, rankKey };
    if (row.state !== 'authorized' || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(row.authorizationId)
        || !['verified_ad','subscription','legacy_campaign'].includes(row.source) || typeof row.reused !== 'boolean') {
        throw new Error('CROWN_UNAVAILABLE');
    }
    return { state: row.state, userId, rankKey, authorizationId: row.authorizationId, source: row.source, reused: row.reused };
}
/** The server derives the stable rank key; clients cannot supply one or adViewed.
 * Retrying the same stage retrieves its committed authorization after a lost reply. */
export async function authorizeCrownStage(userId: string, stageId: number, signal?: AbortSignal): Promise<CrownAuthorization> {
    if (!crownAdmissionEnabled()) throw new Error('FEATURE_DISABLED');
    const rankKey = crownRankKey(stageId);
    if (!rankKey) throw new Error('INVALID_REQUEST');
    signal?.throwIfAborted();
    let token = readRankedSession(userId)?.token;
    if (!token) {
        const { data, error } = await supabase.auth.getSession();
        const session = data.session;
        if (!error && session?.user.id === userId && !session.user.is_anonymous &&
            (!session.expires_at || session.expires_at * 1000 > Date.now())) token = session.access_token;
    }
    if (!token) throw new Error('AUTH_REQUIRED');
    signal?.throwIfAborted();
    const endpoint = new URL('/crown/first-attempt', gameServerUrl());
    if (endpoint.protocol !== 'https:' && !['localhost','127.0.0.1','[::1]'].includes(endpoint.hostname)) throw new Error('CROWN_UNAVAILABLE');
    const response = await fetch(endpoint, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ stageId }), credentials: 'omit', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer',
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000) });
    signal?.throwIfAborted();
    if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? 'AUTH_REQUIRED' : 'CROWN_UNAVAILABLE');
    const value: unknown = await response.json();
    signal?.throwIfAborted();
    return parseCrownAuthorization(value, userId, rankKey);
}
