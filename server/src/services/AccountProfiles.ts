import type { SupabaseClient } from '@supabase/supabase-js';
import { permittedAccountName } from './AccountNamePolicy';

export const ACCOUNT_PROFILE_COLUMNS = 'id,name,rating,rating_10s,rating_3m,rating_10m,avatar_url';
export const FRIEND_COLUMNS = 'id,user_id,friend_id,status,created_at';
export interface AccountProfile { id: string; name: string; rating: number; rating_10s: number; rating_3m: number; rating_10m: number; avatar_url?: string | null }
export interface AccountFriend { id: string; user_id: string; friend_id: string; status: 'pending' | 'accepted'; created_at: string }
export class AccountProfileError extends Error {
    constructor(public code: 'INVALID_REQUEST' | 'NOT_FOUND' | 'UNAVAILABLE' | 'ACCOUNT_DELETING' | 'TRY_LATER') { super(code); }
}
export function parseDisplayName(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const name = value.normalize('NFC').trim();
    // Preserve international names; reject control/bidi characters and invisible-only names.
    return name.length > 0 && name.length <= 15 && !/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(name) && /[\p{L}\p{N}\p{S}]/u.test(name) && permittedAccountName(name) ? name : null;
}
export const validAccountFriendId = (id: unknown): id is string => typeof id === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(id)
    && !/^(?:guest(?:[-_]|$)|anon(?:ymous)?(?:[-_]|$)|cpu(?:[-_]|$)|ai(?::|$)|supabase-)/i.test(id);
export interface AccountProfileStore {
    verifyUser(token: string): Promise<string | null>;
    blocked(userId: string): Promise<boolean>;
    profile(userId: string): Promise<AccountProfile | null>;
    ensure(userId: string, name: string, mayCreate: boolean): Promise<AccountProfile>;
    rename(userId: string, name: string): Promise<AccountProfile>;
    friends(userId: string): Promise<AccountFriend[]>;
    changeFriend(userId: string, friendId: string, action: 'request' | 'accept' | 'remove'): Promise<boolean>;
}
export function createAccountProfileStore(client: SupabaseClient, verifyUser: AccountProfileStore['verifyUser'], blocked: AccountProfileStore['blocked']): AccountProfileStore {
    const profile: AccountProfileStore['profile'] = async id => {
        const { data, error } = await client.from('profiles').select(ACCOUNT_PROFILE_COLUMNS).eq('id', id).maybeSingle();
        if (error) throw new AccountProfileError('UNAVAILABLE');
        return data;
    };
    return {
        verifyUser, blocked, profile,
        async ensure(id, name, mayCreate) {
            const existing = await profile(id); if (existing) return existing;
            // A legacy proof can never recreate a deleted/missing profile.
            if (!mayCreate) throw new AccountProfileError('NOT_FOUND');
            const { error } = await client.from('profiles').insert({ id, name, rating: 1000, rating_10s: 1000, rating_3m: 1000, rating_10m: 1000 });
            if (error && error.code !== '23505') throw new AccountProfileError('UNAVAILABLE');
            const saved = await profile(id); if (!saved) throw new AccountProfileError('UNAVAILABLE'); return saved;
        },
        async rename(id, name) {
            const { data, error } = await client.from('profiles').update({ name }).eq('id', id).select(ACCOUNT_PROFILE_COLUMNS).maybeSingle();
            if (error) throw new AccountProfileError('UNAVAILABLE');
            if (!data) throw new AccountProfileError('NOT_FOUND'); return data;
        },
        async friends(id) {
            // ID is validated before interpolation; never interpolate arbitrary input in .or().
            if (!validAccountFriendId(id)) throw new AccountProfileError('INVALID_REQUEST');
            const { data, error } = await client.from('friends').select(FRIEND_COLUMNS).or(`user_id.eq.${id},friend_id.eq.${id}`)
                .order('created_at', { ascending: false }).limit(1001);
            if (error || !Array.isArray(data) || data.length > 1000) throw new AccountProfileError('UNAVAILABLE');
            return data.filter(row => row.user_id === id || row.friend_id === id);
        },
        async changeFriend(id, peer, action) {
            if (!validAccountFriendId(id) || !validAccountFriendId(peer) || id === peer) throw new AccountProfileError('INVALID_REQUEST');
            const pair = `and(user_id.eq.${id},friend_id.eq.${peer}),and(user_id.eq.${peer},friend_id.eq.${id})`;
            if (action === 'remove') {
                const { error } = await client.from('friends').delete().or(pair);
                if (error) throw new AccountProfileError('UNAVAILABLE'); return true; // Repeat removal is harmless.
            }
            if (!await profile(peer)) throw new AccountProfileError('NOT_FOUND');
            if (action === 'accept') {
                // Only the recipient can accept; retrying an accepted request is safe.
                const { data, error } = await client.from('friends').update({ status: 'accepted' }).eq('user_id', peer).eq('friend_id', id).select('id');
                if (error) throw new AccountProfileError('UNAVAILABLE'); return !!data?.length;
            }
            const { data, error } = await client.from('friends').select('id').or(pair).limit(1);
            if (error) throw new AccountProfileError('UNAVAILABLE');
            if (data?.length) return true; // Does not auto-accept an incoming request.
            const { error: insertError } = await client.from('friends').insert({ user_id: id, friend_id: peer, status: 'pending' });
            if (insertError && insertError.code !== '23505') throw new AccountProfileError('UNAVAILABLE'); return true;
        },
    };
}
