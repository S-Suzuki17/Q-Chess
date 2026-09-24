import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

export type DeletionJob = { ticket_hash: string; user_id: string | null; auth_user_id: string | null; phase: 'pending' | 'data_deleted' | 'completed' };
export class DeletionError extends Error {
    constructor(public code: 'UNAVAILABLE' | 'AUTH_REQUIRED' | 'ACCOUNT_BUSY' | 'INVALID_REQUEST') { super(code); }
}
export const deletionTicketHash = (ticket: unknown): string | null => typeof ticket === 'string' && /^delete_[a-f0-9]{64}$/.test(ticket)
    ? createHash('sha256').update(ticket).digest('hex') : null;
export interface AccountDeletionStore {
    verifyUser(token: string): Promise<string | null>;
    ready(): Promise<boolean>;
    blocked(userId: string): Promise<boolean>;
    begin(userId: string, hash: string, authId: string | null): Promise<void>;
    job(hash: string): Promise<DeletionJob | null>;
    removePhotoBatch(hash: string): Promise<boolean>;
    eraseData(hash: string): Promise<void>;
    eraseAuth(authId: string): Promise<void>;
    finish(hash: string): Promise<void>;
}

/** Single-process ingress barrier, matching the game server's session model. */
export class AccountWriteGate {
    private deleting = new Set<string>();
    private writes = new Map<string, number>();
    blocked(id: string) { return this.deleting.has(id); }
    reserve(id: string, busy: boolean) {
        if (busy || (this.writes.get(id) ?? 0) > 0) throw new DeletionError('ACCOUNT_BUSY');
        this.deleting.add(id);
    }
    release(id: string) { this.deleting.delete(id); }
    enter(id: string): (() => void) | null {
        if (this.blocked(id)) return null;
        this.writes.set(id, (this.writes.get(id) ?? 0) + 1);
        let ended = false;
        return () => { if (ended) return; ended = true; const left = (this.writes.get(id) ?? 1) - 1;
            if (left) this.writes.set(id, left); else this.writes.delete(id); };
    }
}

export function createAccountDeletionStore(client: SupabaseClient, verifyUser: AccountDeletionStore['verifyUser']): AccountDeletionStore {
    const rpc = async (name: string, parameters?: Record<string, unknown>) => {
        const { data, error } = await client.rpc(name, parameters).abortSignal(AbortSignal.timeout(10000));
        if (error) throw new DeletionError('UNAVAILABLE'); return data;
    };
    return {
        verifyUser,
        async ready() { try { return await rpc('account_deletion_ready') === 1; } catch { return false; } },
        async blocked(userId) {
            const { data, error } = await client.from('account_deletion_jobs').select('phase').eq('user_id', userId).maybeSingle();
            // Allows upgrading the server before the feature migration; deletion itself remains unavailable.
            if (error?.code === '42P01' || error?.code === 'PGRST205') return false;
            if (error) throw new DeletionError('UNAVAILABLE');
            return !!data && data.phase !== 'completed';
        },
        async begin(userId, hash, authId) { await rpc('begin_account_deletion', { p_user_id: userId, p_ticket_hash: hash, p_auth_user_id: authId }); },
        async job(hash) {
            const { data, error } = await client.from('account_deletion_jobs').select('ticket_hash,user_id,auth_user_id,phase').eq('ticket_hash', hash).maybeSingle();
            if (error) throw new DeletionError('UNAVAILABLE'); return data as DeletionJob | null;
        },
        async removePhotoBatch(hash) {
            const rows = await rpc('account_deletion_objects', { p_ticket_hash: hash });
            if (!Array.isArray(rows)) throw new DeletionError('UNAVAILABLE');
            const groups = new Map<string, string[]>();
            for (const row of rows) {
                if (typeof row.bucket_id !== 'string' || typeof row.name !== 'string') throw new DeletionError('UNAVAILABLE');
                groups.set(row.bucket_id, [...(groups.get(row.bucket_id) ?? []), row.name]);
            }
            for (const [bucket, names] of groups) {
                // Exact paths come from the service-only ownership query, never from the request.
                const { error } = await client.storage.from(bucket).remove(names);
                if (error) throw new DeletionError('UNAVAILABLE');
            }
            return rows.length === 0;
        },
        async eraseData(hash) { await rpc('erase_account_data', { p_ticket_hash: hash }); },
        async eraseAuth(authId) {
            const { error } = await client.auth.admin.deleteUser(authId, false);
            if (error && error.code !== 'user_not_found') throw new DeletionError('UNAVAILABLE');
        },
        async finish(hash) { await rpc('finish_account_deletion', { p_ticket_hash: hash }); },
    };
}

/** Each successful phase is durable. No personal ID appears in the response. */
export async function completeAccountDeletion(store: AccountDeletionStore, hash: string, beforeErase: (id: string) => void): Promise<'pending' | 'completed'> {
    const job = await store.job(hash);
    if (!job) throw new DeletionError('AUTH_REQUIRED');
    if (job.phase === 'completed') return 'completed';
    if (!job.user_id) throw new DeletionError('UNAVAILABLE');
    beforeErase(job.user_id);
    // Bounded work per request. The client resumes with the same opaque ticket.
    if (!await store.removePhotoBatch(hash)) return 'pending';
    if (job.phase === 'pending') await store.eraseData(hash);
    if (job.auth_user_id) await store.eraseAuth(job.auth_user_id);
    await store.finish(hash);
    return 'completed';
}
