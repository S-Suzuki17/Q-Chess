'use client';

import { supabase } from './supabaseClient';
import { gameServerUrl, readRankedSession } from './rankedSession';
import type { GameRecord, UserStats } from './gameRecordService';

export const HISTORY_LIMIT = 10;
export class HistoryError extends Error {
    constructor(public readonly code: 'AUTH_REQUIRED' | 'UNAVAILABLE') { super(code); }
}
const registeredId = (id?: string): id is string => !!id && !/^(guest([-_]|$)|anon(ymous)?([-_]|$)|cpu([-_]|$)|ai(:|$)|supabase-)/i.test(id);

async function requestHistory(path: string, userId: string, body?: unknown): Promise<Record<string, unknown>> {
    if (!registeredId(userId)) throw new HistoryError('AUTH_REQUIRED');
    let token = readRankedSession(userId)?.token;
    if (!token) {
        const { data, error } = await supabase.auth.getSession();
        const session = data.session;
        if (!error && session?.user.id === userId && !session.user.is_anonymous &&
            (!session.expires_at || session.expires_at * 1000 > Date.now())) token = session.access_token;
    }
    if (!token) throw new HistoryError('AUTH_REQUIRED');
    const endpoint = new URL(path, gameServerUrl());
    if (endpoint.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname)) {
        throw new HistoryError('UNAVAILABLE');
    }
    try {
        const response = await fetch(endpoint, {
            method: body === undefined ? 'GET' : 'POST',
            headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
            ...(body === undefined ? {} : { body: JSON.stringify(body) }),
            credentials: 'omit', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(15000),
        });
        if (response.status === 401 || response.status === 403) throw new HistoryError('AUTH_REQUIRED');
        if (!response.ok) throw new HistoryError('UNAVAILABLE');
        const value: unknown = await response.json();
        if (!value || typeof value !== 'object' || Array.isArray(value)) throw new HistoryError('UNAVAILABLE');
        return value as Record<string, unknown>;
    } catch (error) {
        if (error instanceof HistoryError) throw error;
        // Never include bearer tokens, upstream payloads, or account IDs in logs.
        throw new HistoryError('UNAVAILABLE');
    }
}

export async function readPrivateRecords(limit = HISTORY_LIMIT, userId?: string): Promise<GameRecord[]> {
    // There is intentionally no global-history fallback, even for missing IDs.
    if (!registeredId(userId)) return [];
    const bounded = Math.max(0, Math.min(HISTORY_LIMIT, Number.isFinite(limit) ? Math.floor(limit) : HISTORY_LIMIT));
    if (!bounded) return [];
    const data = await requestHistory(`/game-records?limit=${bounded}`, userId);
    if (!Array.isArray(data.records)) throw new HistoryError('UNAVAILABLE');
    return (data.records as GameRecord[]).filter(record => record &&
        (record.white_id === userId || record.black_id === userId)).slice(0, bounded);
}

export async function readPrivateRecord(id: string, userId?: string): Promise<GameRecord | null> {
    if (!registeredId(userId) || !/^[0-9a-f-]{36}$/i.test(id)) return null;
    // Use the same bounded query, so old shared rows cannot bypass the user's ten.
    return (await readPrivateRecords(HISTORY_LIMIT, userId)).find(record => record.id === id) ?? null;
}

export async function savePrivateRecord(record: GameRecord, userId?: string): Promise<string | null> {
    const owner = userId ?? (registeredId(record.white_id) ? record.white_id : record.black_id);
    if (!registeredId(owner) || !['cpu', 'private'].includes(record.mode)) return null;
    const white = record.white_id === owner, black = record.black_id === owner;
    if (white === black) return null;
    try {
        const data = await requestHistory('/game-records', owner, {
            ...record, id: record.id ?? crypto.randomUUID(),
            white_id: white ? owner : record.mode === 'cpu' ? 'ai' : null,
            black_id: black ? owner : record.mode === 'cpu' ? 'ai' : null,
        });
        return typeof data.id === 'string' ? data.id : null;
    } catch { return null; }
}

export async function readPrivateStats(userId: string): Promise<UserStats> {
    const data = await requestHistory('/game-stats', userId);
    const stats = data.stats as UserStats | undefined;
    const keys: (keyof UserStats)[] = ['totalGames', 'wins', 'losses', 'draws', 'whiteGames', 'whiteWins', 'blackGames', 'blackWins'];
    if (!stats || keys.some(key => !Number.isSafeInteger(stats[key]) || stats[key] < 0)) throw new HistoryError('UNAVAILABLE');
    return stats;
}
