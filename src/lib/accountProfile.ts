'use client';
import {sessionOwnsAccount} from './googleAccountIdentity';
import { supabase } from './supabaseClient';
import { gameServerUrl, readRankedSession } from './rankedSession';
import type { Friend, Profile } from './gameRecordService';

export class AccountProfileError extends Error {
    constructor(public readonly code: 'AUTH_REQUIRED' | 'INVALID_REQUEST' | 'CONFLICT' | 'UNAVAILABLE') { super(code); }
}

type AccountRead = { userId: string; controller: AbortController; users: number; result: Promise<Record<string, unknown>> };
const pendingReads = new Map<string, AccountRead>();
function forgetAccountReads(userId: string) {
    for (const [key, entry] of pendingReads) if (entry.userId === userId) pendingReads.delete(key);
}
/** Share only overlapping reads with the exact same bearer and endpoint. No completed result is cached. */
function shareAccountRead(key: string, userId: string, load: (signal: AbortSignal) => Promise<Record<string, unknown>>, signal?: AbortSignal) {
    signal?.throwIfAborted();
    let entry = pendingReads.get(key);
    if (!entry) {
        const controller = new AbortController();
        const created: AccountRead = { userId, controller, users: 0, result: load(controller.signal).finally(() => {
            if (pendingReads.get(key) === created) pendingReads.delete(key);
        }) };
        entry = created;
        // Bound retained keys even if many unrelated screens are loading.
        if (pendingReads.size < 64) pendingReads.set(key, entry);
    }
    const read = entry;
    read.users++;
    return new Promise<Record<string, unknown>>((resolve, reject) => {
        let finished = false;
        const detach = () => {
            if (finished) return false;
            finished = true;
            signal?.removeEventListener('abort', abort);
            if (--read.users === 0) {
                if (pendingReads.get(key) === read) pendingReads.delete(key);
                read.controller.abort();
            }
            return true;
        };
        const abort = () => { if (detach()) reject(signal?.reason); };
        signal?.addEventListener('abort', abort, { once: true });
        read.result.then(value => {
            if (detach()) {
                // Consumers must not be able to mutate another screen's response.
                try { resolve(structuredClone(value)); } catch (error) { reject(error); }
            }
        }, error => { if (detach()) reject(error); });
        if (signal?.aborted) abort();
    });
}

export async function requestAccountProfile(path: string, userId: string, body?: unknown, signal?: AbortSignal,
    confirmation?:{token:string;proof:string}): Promise<Record<string, unknown>> {
    if (!userId || /^(?:guest(?:[-_]|$)|anon(?:ymous)?(?:[-_]|$)|cpu(?:[-_]|$)|ai(?::|$)|supabase-)/i.test(userId)) throw new AccountProfileError('AUTH_REQUIRED');
    try {
        signal?.throwIfAborted();
        let token = readRankedSession(userId)?.token;
        if (!token) {
            const { data, error } = await supabase.auth.getSession();
            const session = data.session;
            if (!error && sessionOwnsAccount(session,userId) && !session.user.is_anonymous &&
                (!session.expires_at || session.expires_at * 1000 > Date.now())) token = session.access_token;
        }
        signal?.throwIfAborted();
        if (!token) throw new AccountProfileError('AUTH_REQUIRED');
        const endpoint = new URL(path, gameServerUrl());
        if (endpoint.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname)) throw new AccountProfileError('UNAVAILABLE');
        const load = async (requestSignal?: AbortSignal) => {
            const response = await fetch(endpoint, {
                method: body === undefined ? 'GET' : 'POST',
                headers: { Authorization: `Bearer ${confirmation?.token??token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
                    ...(confirmation?{'X-QG-Confirmation':confirmation.proof}:{}) },
                ...(body === undefined ? {} : { body: JSON.stringify(body) }),
                credentials: 'omit', redirect: 'error', cache: 'no-store', signal: requestSignal ? AbortSignal.any([requestSignal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000),
            });
            if (response.status === 401 || response.status === 403) throw new AccountProfileError('AUTH_REQUIRED');
            if (response.status === 400) throw new AccountProfileError('INVALID_REQUEST');
            if (!response.ok) throw new AccountProfileError('UNAVAILABLE');
            const value = await response.json();
            if (!value || typeof value !== 'object' || Array.isArray(value) || value.userId !== userId) throw new AccountProfileError('UNAVAILABLE');
            requestSignal?.throwIfAborted();
            return value as Record<string, unknown>;
        };
        if (body === undefined && !confirmation) {
            return await shareAccountRead(JSON.stringify([userId, token, endpoint.href]), userId, load, signal);
        }
        // A read begun before/during a write must not satisfy a subsequent refresh.
        forgetAccountReads(userId);
        try { return await load(signal); } finally { forgetAccountReads(userId); }
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
