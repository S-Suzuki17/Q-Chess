import { createHash, randomBytes } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

export type RecoveryBinding = { user_id: string; email: string; auth_user_id: string };
export type RecoveryKind = 'enroll' | 'reset';
export class RecoveryError extends Error {
    constructor(public code: 'INVALID_REQUEST' | 'AUTH_REQUIRED' | 'TRY_LATER' | 'INVALID_CODE' | 'UNAVAILABLE' | 'ACCOUNT_BUSY') { super(code); }
}
export function recoveryEmail(value: unknown): string | null {
    if (typeof value !== 'string' || value.length > 254) return null;
    const email = value.trim().toLowerCase();
    return /^[^\s@<>\x00-\x1f]+@[^\s@<>\x00-\x1f]+\.[^\s@<>\x00-\x1f]+$/.test(email) ? email : null;
}
export function recoveryPassword(value: unknown): value is string {
    return typeof value === 'string' && [...value].length >= 12 && Buffer.byteLength(value, 'utf8') <= 72 && !/[\x00]/.test(value);
}
export interface RecoveryStore {
    ready(): Promise<boolean>;
    blocked(id: string): Promise<boolean>;
    verifyPassword(id: string, password: string): Promise<boolean>;
    binding(id: string): Promise<RecoveryBinding | null>;
    sendCode(email: string, create: boolean): Promise<void>;
    verifyCode(email: string, code: string): Promise<string | null>;
    enroll(id: string, email: string, authId: string): Promise<void>;
    reset(binding: RecoveryBinding, password: string): Promise<void>;
}
/** Auth operations get a NEW isolated client, never the shared service-role DB client.
 * verifyOtp mutates its Auth session even with persistSession:false. Tokens are never returned.
 */
export function createRecoveryStore(db: SupabaseClient, authClient: () => SupabaseClient,
    verifyPassword: RecoveryStore['verifyPassword'], blocked: RecoveryStore['blocked']): RecoveryStore {
    const rpc = async (name: string, args?: Record<string, unknown>) => {
        const { data, error } = await db.rpc(name, args).abortSignal(AbortSignal.timeout(10000));
        if (error) throw new RecoveryError('UNAVAILABLE'); return data;
    };
    return {
        verifyPassword, blocked,
        async ready() { try { return await rpc('account_recovery_ready') === 1; } catch { return false; } },
        async binding(id) {
            const { data, error } = await db.from('account_recovery_emails').select('user_id,email,auth_user_id').eq('user_id', id).maybeSingle();
            if (error) throw new RecoveryError('UNAVAILABLE'); return data;
        },
        async sendCode(email, create) {
            const { error } = await authClient().auth.signInWithOtp({ email, options: { shouldCreateUser: create } });
            if (error) throw new RecoveryError('UNAVAILABLE');
        },
        async verifyCode(email, code) {
            const client = authClient();
            const { data, error } = await client.auth.verifyOtp({ email, token: code, type: 'email' });
            if (error || !data.user?.email_confirmed_at || data.user.is_anonymous || recoveryEmail(data.user.email) !== email) return null;
            // No reusable session reaches the browser, disk or the shared DB client.
            if (data.session) await client.auth.signOut({ scope: 'local' }).catch(() => {});
            return data.user.id;
        },
        async enroll(id, email, authId) { await rpc('enroll_account_recovery', { p_user_id: id, p_email: email, p_auth_id: authId }); },
        async reset(binding, password) { await rpc('reset_legacy_account_password', {
            p_user_id: binding.user_id, p_email: binding.email, p_auth_id: binding.auth_user_id, p_password: password,
        }); },
    };
}

type Challenge = { kind: RecoveryKind; id: string; email: string; binding: RecoveryBinding | null; until: number; attempts: number };
/** Single-process, short-lived challenges, like RankedAuth. Restart requires a new code.
 * Never keep passwords, OTPs or plaintext challenge tickets. Unknown IDs get decoy tickets.
 */
export class RecoveryChallenges {
    private entries = new Map<string, Challenge>();
    private hash(ticket: string) { return createHash('sha256').update(ticket).digest('hex'); }
    create(kind: RecoveryKind, id: string, email: string, binding: RecoveryBinding | null) {
        for (const [key, item] of this.entries) if (item.until <= Date.now()) this.entries.delete(key);
        if (this.entries.size >= 1000) throw new RecoveryError('TRY_LATER');
        const ticket = randomBytes(32).toString('hex');
        this.entries.set(this.hash(ticket), { kind, id, email, binding, until: Date.now() + 10 * 60000, attempts: 0 });
        return ticket;
    }
    take(ticket: unknown): Challenge {
        if (typeof ticket !== 'string' || !/^[a-f0-9]{64}$/.test(ticket)) throw new RecoveryError('INVALID_CODE');
        const key = this.hash(ticket), value = this.entries.get(key);
        if (!value || value.until <= Date.now() || value.attempts >= 5) { this.entries.delete(key); throw new RecoveryError('INVALID_CODE'); }
        value.attempts++; return { ...value };
    }
    consume(ticket: string) { this.entries.delete(this.hash(ticket)); }
}
