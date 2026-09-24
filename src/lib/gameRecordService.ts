'use client';

import { supabase } from './supabaseClient';
import { PieceType } from '../config/gameConfig';
import { ensureOwnProfile, readOwnFriends, changeOwnFriend } from './accountProfile';

export const PUBLIC_PROFILE_COLUMNS = 'id,name,rating,created_at,rating_10s,rating_3m,rating_10m,avatar_url';

export interface MoveRecord {
    turn: number;
    player: 'white' | 'black';
    tokenId: string;
    from: [number, number];
    to: [number, number];
    possibleTypes: PieceType[];
    capturedTokenId?: string;
    promotedTo?: PieceType;
}

export interface Friend {
    id: string;
    user_id: string;
    friend_id: string;
    status: 'pending' | 'accepted';
    created_at: string;
}

export interface ActiveMatch {
    room_id: string;
    white_id: string | null;
    black_id: string | null;
    status: 'playing' | 'finished';
    started_at: string;
}

export interface GameRecord {
    id?: string;
    created_at?: string;
    white_player: string;
    black_player: string;
    white_id?: string;
    black_id?: string;
    winner: string | null;
    mode: 'cpu' | 'private' | 'random' | 'ranked' | 'ranked_cpu';
    cpu_level?: number;
    time_control?: string;
    moves: MoveRecord[];
    total_moves: number;
}

export interface Profile {
    id: string;
    name: string;
    rating: number;
    rating_10s: number;
    rating_3m: number;
    rating_10m: number;
    avatar_url?: string;
}

export { savePrivateRecord as saveGameRecord, readPrivateRecords as getGameRecords, readPrivateRecord as getGameRecord } from './privateHistory';

export interface UserStats {
    totalGames: number;
    wins: number;
    losses: number;
    draws: number;
    whiteGames: number;
    whiteWins: number;
    blackGames: number;
    blackWins: number;
}

export { readPrivateStats as getUserStats } from './privateHistory';

export async function getTopProfiles(timeControl?: string): Promise<Profile[]> {
    const ratingColumn = timeControl === '10s' ? 'rating_10s' 
                       : timeControl === '3m' ? 'rating_3m' 
                       : 'rating_10m';
    const { data, error } = await supabase
        .from('profiles')
        .select(PUBLIC_PROFILE_COLUMNS)
        .not('id', 'like', 'GUEST-%').not('id', 'like', 'anon_%')
        .order(ratingColumn, { ascending: false })
        .limit(10);
    
    if (error) {
        console.error('Failed to fetch top profiles:', error);
        return [];
    }
    return data ?? [];
}

export async function getProfile(id: string): Promise<Profile | null> {
    const { data, error } = await supabase.from('profiles')
        .select(PUBLIC_PROFILE_COLUMNS).eq('id', id).maybeSingle();
    if (error) {
        console.error('Failed to fetch profile:', error);
        return null;
    }
    return data;
}

export async function ensureProfile(id: string, name: string): Promise<Profile | null> {
    const { data: existing, error: readError } = await supabase
        .from('profiles')
        .select(PUBLIC_PROFILE_COLUMNS)
        .eq('id', id)
        .maybeSingle();
        
    // A failed request is not evidence that the profile does not exist.
    if (readError) {
        console.error('Failed to fetch profile:', readError);
        return null;
    }
    if (existing) return existing;
    
    try { return await ensureOwnProfile(id, name); }
    catch { return null; }
}

// ─── Friend System ───

export async function sendFriendRequest(userId: string, friendId: string): Promise<boolean> {
    if(!/^[a-zA-Z0-9_-]{1,128}$/.test(userId)||!/^[a-zA-Z0-9_-]{1,128}$/.test(friendId)||userId===friendId) return false;
    return changeOwnFriend(userId, friendId, 'request');
}

export async function acceptFriendRequest(userId: string, friendId: string): Promise<boolean> {
    return changeOwnFriend(userId, friendId, 'accept');
}

export async function removeFriend(userId: string, friendId: string): Promise<boolean> {
    if(!/^[a-zA-Z0-9_-]{1,128}$/.test(userId)||!/^[a-zA-Z0-9_-]{1,128}$/.test(friendId)) return false;
    return changeOwnFriend(userId, friendId, 'remove');
}

export async function getFriends(userId: string): Promise<Friend[]> {
    if(!/^[a-zA-Z0-9_-]{1,128}$/.test(userId)) throw new Error('Invalid friend directory identity');
    return readOwnFriends(userId);
}

// ─── Active Matches (Spectator) ───

export async function registerActiveMatch(roomId: string, whiteId: string | null, blackId: string | null): Promise<void> {
    await supabase.from('active_matches').upsert({
        room_id: roomId,
        white_id: whiteId,
        black_id: blackId,
        status: 'playing',
        started_at: new Date().toISOString()
    });
}

export async function finishActiveMatch(roomId: string): Promise<void> {
    await supabase.from('active_matches')
        .update({ status: 'finished' })
        .eq('room_id', roomId);
}

export async function getActiveMatches(): Promise<ActiveMatch[]> {
    const { data, error } = await supabase
        .from('active_matches')
        .select('*')
        .eq('status', 'playing')
        .order('started_at', { ascending: false });
    if (error) {
        console.error('Error fetching active matches:', error);
        return [];
    }
    return data || [];
}
