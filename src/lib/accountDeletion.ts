'use client';
import { supabase } from './supabaseClient';
import { gameServerUrl, readRankedSession } from './rankedSession';

export class AccountDeletionError extends Error {
    constructor(public code: 'AUTH_REQUIRED' | 'ACCOUNT_BUSY' | 'UNAVAILABLE') { super(code); }
}
const KEY = 'qg_account_deletion_v1';
const validTicket = (value: unknown): value is string => typeof value === 'string' && /^delete_[a-f0-9]{64}$/.test(value);
function endpoint(path: string) {
    const url = new URL(path, gameServerUrl());
    if (url.protocol !== 'https:' && !['127.0.0.1','localhost','[::1]'].includes(url.hostname)) throw new AccountDeletionError('UNAVAILABLE');
    return url;
}
async function request(path: string, token?: string, body?: unknown) {
    try {
        const response = await fetch(endpoint(path), {
            method: body ? 'POST' : 'GET', credentials: 'omit', cache: 'no-store', redirect: 'error',
            headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
            ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(30000),
        });
        if (response.status === 401) throw new AccountDeletionError('AUTH_REQUIRED');
        if (response.status === 409) throw new AccountDeletionError('ACCOUNT_BUSY');
        if (!response.ok) throw new AccountDeletionError('UNAVAILABLE');
        return await response.json() as { available?: boolean; phase?: string };
    } catch (error) { if (error instanceof AccountDeletionError) throw error; throw new AccountDeletionError('UNAVAILABLE'); }
}
export async function accountDeletionAvailable(): Promise<boolean> {
    try { return (await request('/account/deletion/capabilities')).available === true; } catch { return false; }
}
function ticketFor(userId: string): string {
    let saved: { userId?: string; ticket?: string } = {};
    try {
        const parsed: unknown = JSON.parse(sessionStorage.getItem(KEY) ?? '{}');
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) saved = parsed;
    } catch { /* A new ticket can replace an unreadable one. */ }
    if (saved.userId === userId && validTicket(saved.ticket)) return saved.ticket;
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    const ticket = 'delete_' + [...bytes].map(value => value.toString(16).padStart(2,'0')).join('');
    // Save before sending anything destructive. A blocked store must abort.
    sessionStorage.setItem(KEY, JSON.stringify({ userId, ticket })); return ticket;
}
async function authToken(userId: string): Promise<string> {
    const proof = readRankedSession(userId); if (proof) return proof.token;
    const { data, error } = await supabase.auth.getSession();
    if (!error && data.session?.user.id === userId && !data.session.user.is_anonymous) return data.session.access_token;
    throw new AccountDeletionError('AUTH_REQUIRED');
}

/** Called only after the user types DELETE and confirms. No automatic deletion on load. */
export async function deleteOwnAccount(userId: string): Promise<void> {
    if (!userId || /^(?:guest(?:[-_]|$)|anon(?:ymous)?(?:[-_]|$)|cpu(?:[-_]|$)|ai(?::|$)|supabase-)/i.test(userId)) throw new AccountDeletionError('AUTH_REQUIRED');
    const ticket = ticketFor(userId);
    let phase: string | undefined;
    try { phase = (await request('/account/deletion/complete', ticket, { confirmation: 'DELETE' })).phase; }
    catch (error) {
        if (!(error instanceof AccountDeletionError) || error.code !== 'AUTH_REQUIRED') throw error;
        await request('/account/deletion', await authToken(userId), { confirmation: 'DELETE', ticket });
        phase = 'pending';
    }
    for (let attempt = 0; phase === 'pending' && attempt < 30; attempt++) {
        phase = (await request('/account/deletion/complete', ticket, { confirmation: 'DELETE' })).phase;
        if (phase === 'pending') await new Promise(resolve => setTimeout(resolve, 250));
    }
    if (phase !== 'completed') throw new AccountDeletionError('UNAVAILABLE');
}

/** App-owned keys only. Never clear the entire origin or another app's storage. */
export function clearDeletedAccountDeviceData(): boolean {
    let cleared = true;
    for (const name of ['localStorage','sessionStorage'] as const) {
        try {
            const storage = globalThis[name];
            const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index));
            for (const key of keys) {
                if (key && /^(?:qg_|qchess_)/.test(key)) {
                    try { storage.removeItem(key); } catch { cleared = false; }
                }
            }
        } catch { cleared = false; }
    }
    return cleared;
}
