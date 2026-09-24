'use client';
import { supabase } from './supabaseClient';
import { gameServerUrl, readRankedSession } from './rankedSession';
import type { Friend, Profile } from './gameRecordService';

export class AccountProfileError extends Error {
    constructor(public readonly code: 'AUTH_REQUIRED' | 'INVALID_REQUEST' | 'UNAVAILABLE') { super(code); }
}
export async function requestAccountProfile(path: string, userId: string, body?: unknown): Promise<Record<string, unknown>> {
    if (!userId || /^(?:guest(?:[-_]|$)|anon(?:ymous)?(?:[-_]|$)|cpu(?:[-_]|$)|ai(?::|$)|supabase-)/i.test(userId)) throw new AccountProfileError('AUTH_REQUIRED');
    try {
        let token = readRankedSession(userId)?.token;
        if (!token) {
            const { data, error } = await supabase.auth.getSession();
            const session = data.session;
            if (!error && session?.user.id === userId && !session.user.is_anonymous &&
                (!session.expires_at || session.expires_at * 1000 > Date.now())) token = session.access_token;
        }
        if (!token) throw new AccountProfileError('AUTH_REQUIRED');
        const endpoint = new URL(path, gameServerUrl());
        if (endpoint.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname)) throw new AccountProfileError('UNAVAILABLE');
        const response = await fetch(endpoint, {
            method: body === undefined ? 'GET' : 'POST',
            headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
            ...(body === undefined ? {} : { body: JSON.stringify(body) }),
            credentials: 'omit', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(15000),
        });
        if (response.status === 401 || response.status === 403) throw new AccountProfileError('AUTH_REQUIRED');
        if (response.status === 400) throw new AccountProfileError('INVALID_REQUEST');
        if (!response.ok) throw new AccountProfileError('UNAVAILABLE');
        const value = await response.json();
        if (!value || typeof value !== 'object' || Array.isArray(value) || value.userId !== userId) throw new AccountProfileError('UNAVAILABLE');
        return value;
    } catch (error) {
        if (error instanceof AccountProfileError) throw error;
        // Never fall back to an unauthenticated table write or log credentials.
        throw new AccountProfileError('UNAVAILABLE');
    }
}
function ownProfile(value: Record<string, unknown>, id: string): Profile {
    const profile = value.profile as Profile | undefined;
    if (!profile || profile.id !== id || typeof profile.name !== 'string') throw new AccountProfileError('UNAVAILABLE');
    return profile;
}
export async function ensureOwnProfile(id: string, name: string): Promise<Profile> {
    return ownProfile(await requestAccountProfile('/account/profile/ensure', id, { name }), id);
}
export async function renameOwnProfile(id: string, name: string): Promise<Profile> {
    return ownProfile(await requestAccountProfile('/account/profile/name', id, { name }), id);
}
export async function readOwnFriends(id: string): Promise<Friend[]> {
    const value = await requestAccountProfile('/account/friends', id);
    if (!Array.isArray(value.friends)) throw new AccountProfileError('UNAVAILABLE');
    return value.friends.filter((row: Friend) => row && (row.user_id === id || row.friend_id === id) && ['pending', 'accepted'].includes(row.status));
}
export async function changeOwnFriend(id: string, friendId: string, action: 'request' | 'accept' | 'remove'): Promise<boolean> {
    return (await requestAccountProfile('/account/friends', id, { friendId, action })).changed === true;
}
