'use client';

import { supabase } from './supabaseClient';
import { PieceType } from '../config/gameConfig';

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
    mode: 'cpu' | 'private' | 'random' | 'ranked';
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

export async function saveGameRecord(record: GameRecord): Promise<string | null> {
    const { data, error } = await supabase
        .from('game_records')
        .insert({
            white_player: record.white_player,
            black_player: record.black_player,
            white_id: record.white_id,
            black_id: record.black_id,
            winner: record.winner,
            mode: record.mode,
            cpu_level: record.cpu_level,
            time_control: record.time_control,
            moves: record.moves,
            total_moves: record.total_moves,
        })
        .select('id')
        .single();

    if (error) {
        console.error('Failed to save game record:', error);
        return null;
    }
    return data?.id ?? null;
}

export async function getGameRecords(limit: number = 20, userId?: string): Promise<GameRecord[]> {
    let query = supabase
        .from('game_records')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

    if (userId) {
        query = query.or(`white_id.eq.${userId},black_id.eq.${userId}`);
    }

    const { data, error } = await query;

    if (error) {
        console.error('Failed to fetch game records:', error);
        return [];
    }
    return data ?? [];
}

export async function getGameRecord(id: string): Promise<GameRecord | null> {
    const { data, error } = await supabase
        .from('game_records')
        .select('*')
        .eq('id', id)
        .single();

    if (error) {
        console.error('Failed to fetch game record:', error);
        return null;
    }
    return data;
}

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

export async function getUserStats(userId: string): Promise<UserStats> {
    const stats: UserStats = {
        totalGames: 0, wins: 0, losses: 0, draws: 0,
        whiteGames: 0, whiteWins: 0, blackGames: 0, blackWins: 0
    };

    // Get all games where user is white or black
    const { data: whiteData, error: whiteError } = await supabase
        .from('game_records')
        .select('winner')
        .eq('white_id', userId);

    const { data: blackData, error: blackError } = await supabase
        .from('game_records')
        .select('winner')
        .eq('black_id', userId);

    if (!whiteError && whiteData) {
        stats.whiteGames = whiteData.length;
        whiteData.forEach(game => {
            if (game.winner === 'white_wins') {
                stats.wins++;
                stats.whiteWins++;
            } else if (game.winner === 'black_wins') {
                stats.losses++;
            } else if (game.winner === 'draw') {
                stats.draws++;
            }
        });
    }

    if (!blackError && blackData) {
        stats.blackGames = blackData.length;
        blackData.forEach(game => {
            if (game.winner === 'black_wins') {
                stats.wins++;
                stats.blackWins++;
            } else if (game.winner === 'white_wins') {
                stats.losses++;
            } else if (game.winner === 'draw') {
                stats.draws++;
            }
        });
    }

    stats.totalGames = stats.whiteGames + stats.blackGames;
    return stats;
}

export async function getTopProfiles(timeControl?: string): Promise<Profile[]> {
    const ratingColumn = timeControl === '10s' ? 'rating_10s' 
                       : timeControl === '3m' ? 'rating_3m' 
                       : 'rating_10m';
    const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .not('id', 'like', 'GUEST-%').not('id', 'like', 'anon_%')
        .order(ratingColumn, { ascending: false })
        .limit(10);
    
    if (error) {
        console.error('Failed to fetch top profiles:', error);
        return [];
    }
    return data ?? [];
}

export async function ensureProfile(id: string, name: string): Promise<Profile | null> {
    const { data: existing } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', id)
        .single();
        
    if (existing) return existing;
    
    const { data, error } = await supabase
        .from('profiles')
        .insert({ id, name, rating: 2000, rating_10s: 2000, rating_3m: 2000, rating_10m: 2000 })
        .select()
        .single();
        
    if (error) {
        console.error('Failed to create profile:', error);
        return null;
    }
    return data;
}

// ─── Friend System ───

export async function sendFriendRequest(userId: string, friendId: string): Promise<boolean> {
    const { error } = await supabase
        .from('friends')
        .insert({ user_id: userId, friend_id: friendId, status: 'pending' });
    if (error) {
        console.error('Error sending friend request:', error);
        return false;
    }
    return true;
}

export async function acceptFriendRequest(userId: string, friendId: string): Promise<boolean> {
    const { error } = await supabase
        .from('friends')
        .update({ status: 'accepted' })
        .match({ user_id: friendId, friend_id: userId, status: 'pending' });
    
    // Also create the reverse relationship for easy querying
    if (!error) {
        await supabase.from('friends').insert({ user_id: userId, friend_id: friendId, status: 'accepted' });
        return true;
    }
    return false;
}

export async function removeFriend(userId: string, friendId: string): Promise<boolean> {
    const { error } = await supabase
        .from('friends')
        .delete()
        .or(`and(user_id.eq.${userId},friend_id.eq.${friendId}),and(user_id.eq.${friendId},friend_id.eq.${userId})`);
    return !error;
}

export async function getFriends(userId: string): Promise<Friend[]> {
    const { data, error } = await supabase
        .from('friends')
        .select('*')
        .or(`user_id.eq.${userId},friend_id.eq.${userId}`);
    if (error) {
        console.error('Error fetching friends:', error);
        return [];
    }
    return data || [];
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
