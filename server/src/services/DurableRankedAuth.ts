import { createHash, randomBytes } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isRankedUserId, MAX_RANKED_PASSWORD_BYTES, type RankedIdentity, type RankedSession } from './RankedAuth';

export const DURABLE_SESSION_PROTOCOL = 2;
const HOUR = 3_600_000;
const MONTH = 30 * 24 * HOUR;
const TOKEN = /^ranked_[A-Za-z0-9_-]{43}$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const GENERATION = /^(0|[1-9][0-9]{0,18})$/;
type RpcName = 'legacy_session_runtime_version' | 'issue_legacy_session' | 'inspect_legacy_session' | 'inspect_live_legacy_sessions'
    | 'revoke_legacy_session' | 'revoke_user_legacy_sessions';
export type DurableSessionRpc = (name: RpcName, parameters: Record<string, unknown>, signal: AbortSignal)
    => PromiseLike<{ data: unknown; error: unknown }>;

/** Never attach the provider error as a cause: it may contain credentials. */
export class SessionAuthorityUnavailable extends Error {
    constructor() { super('Session authority unavailable'); this.name = 'SessionAuthorityUnavailable'; }
}
const unavailable = (): never => { throw new SessionAuthorityUnavailable(); };
const object = (value: unknown): Record<string, unknown> | null =>
    value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
const exact = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).sort().join(',') === [...keys].sort().join(',');
const hashToken = (token: unknown) => typeof token === 'string' && token.length === 50 && TOKEN.test(token)
    ? createHash('sha256').update(token).digest('hex') : null;
const validPassword = (password: unknown): password is string => typeof password === 'string'
    && password.length > 0 && Buffer.byteLength(password, 'utf8') <= MAX_RANKED_PASSWORD_BYTES;

function timestamp(value: unknown): { milliseconds: number; microseconds: bigint } | null {
    if (typeof value !== 'string') return null;
    const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})$/.exec(value);
    if (!parts || parts[0].length !== value.length) return null;
    const [year, month, day, hour, minute, second] = parts.slice(1, 7).map(Number);
    if (year < 1 || month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) return null;
    const dayCheck = new Date(0); dayCheck.setUTCFullYear(year, month - 1, day);
    if (day < 1 || dayCheck.getUTCMonth() !== month - 1) return null;
    if (parts[8] !== 'Z') {
        const [hours, minutes] = parts[8].slice(1).split(':').map(Number);
        if (hours > 14 || minutes > 59 || (hours === 14 && minutes !== 0)) return null;
    }
    const wholeSecond = Date.parse(`${parts[1]}-${parts[2]}-${parts[3]}T${parts[4]}:${parts[5]}:${parts[6]}${parts[8]}`);
    const milliseconds = Date.parse(value);
    if (!Number.isSafeInteger(wholeSecond) || !Number.isSafeInteger(milliseconds)) return null;
    // PostgreSQL timestamps have microsecond precision. Truncating first could
    // incorrectly accept a nearly-but-not-exact one-hour or 720-hour lifetime.
    return { milliseconds, microseconds: BigInt(wholeSecond) * 1000n + BigInt((parts[7] ?? '').padEnd(6, '0')) };
}

function identity(row: Record<string, unknown>, discriminator: 'ok' | 'status'): RankedIdentity {
    if (!exact(row, [discriminator, 'userId', 'incarnation', 'generation', 'persistent', 'issuedAt', 'expiresAt', ...(discriminator === 'status' ? ['serverNow'] : [])])
        || !isRankedUserId(row.userId) || typeof row.incarnation !== 'string' || row.incarnation.length !== 36 || !UUID.test(row.incarnation)
        || typeof row.generation !== 'string' || !GENERATION.test(row.generation)
        || BigInt(row.generation) > 9223372036854775807n || typeof row.persistent !== 'boolean') return unavailable();
    const issued = timestamp(row.issuedAt), expires = timestamp(row.expiresAt);
    if (issued === null || expires === null
        || expires.microseconds - issued.microseconds !== BigInt(row.persistent ? MONTH : HOUR) * 1000n) return unavailable();
    // SQL status uses DB time. Do not substitute an instance's wall clock.
    const now = discriminator === 'ok' ? issued : timestamp(row.serverNow);
    if (!now || now.microseconds < issued.microseconds
        || (row.status === 'valid' && now.microseconds >= expires.microseconds)
        || (row.status === 'expired' && now.microseconds < expires.microseconds)) return unavailable();
    return { userId: row.userId, expiresAt: expires.milliseconds, serverNow: now.milliseconds,
        fence: { incarnation: row.incarnation, generation: row.generation } };
}

export type LiveLegacyStatus = 'valid' | 'expired' | 'revoked' | 'evidence_lost';
export type LiveLegacySession = { token: string; userId: string; fence: { incarnation: string; generation: string } };

/** Dormant: index.ts does not select this authority. There is no Map fallback.
 * Activation needs schema, restoration, live-socket revocation and a reviewed
 * coordinated cutover of all serving instances. */
export class DurableRankedAuth {
    constructor(private readonly rpc: DurableSessionRpc, private readonly timeoutMs = 10_000) {
        if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 10_000) throw new RangeError('Invalid authority timeout');
    }
    private async call(name: RpcName, parameters: Record<string, unknown>): Promise<Record<string, unknown>> {
        const controller = new AbortController();
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
            const timeout = new Promise<never>((_, reject) => {
                timer = setTimeout(() => { controller.abort(); reject(new SessionAuthorityUnavailable()); }, this.timeoutMs);
            });
            const result = await Promise.race([Promise.resolve(this.rpc(name, parameters, controller.signal)), timeout]);
            if (!result || result.error !== null) return unavailable();
            return object(result.data) ?? unavailable();
        } catch { return unavailable(); }
        finally { if (timer !== undefined) clearTimeout(timer); }
    }
    async protocol(): Promise<{ version: 2; activationReady: false }> {
        const row = await this.call('legacy_session_runtime_version', {});
        if (!exact(row, ['version', 'activationReady']) || row.version !== DURABLE_SESSION_PROTOCOL || row.activationReady !== false) return unavailable();
        return { version: 2, activationReady: false };
    }
    async issueLegacySession(userId: unknown, password: unknown, keepLoggedIn = false): Promise<RankedSession | null> {
        if (!isRankedUserId(userId) || !validPassword(password)) return null;
        const token = `ranked_${randomBytes(32).toString('base64url')}`;
        const hash = hashToken(token)!;
        let possiblyIssued = true;
        try {
            const started = performance.now();
            const row = await this.call('issue_legacy_session', {
                p_user_id: userId, p_password: password, p_token_hash: hash, p_persistent: keepLoggedIn === true,
            });
            if (row.ok === false && exact(row, ['ok', 'error']) && ['INVALID_REQUEST', 'INVALID_CREDENTIALS',
                'STALE_AUTHENTICATION', 'TOKEN_CONFLICT', 'CAPACITY'].includes(row.error as string)) {
                possiblyIssued = false;
                if (row.error === 'INVALID_CREDENTIALS' || row.error === 'STALE_AUTHENTICATION') return null;
                return unavailable();
            }
            if (row.ok !== true) return unavailable();
            const proof = identity(row, 'ok');
            if (proof.userId !== userId || row.persistent !== (keepLoggedIn === true)) return unavailable();
            return { ...proof, token, admissionDeadline: started + proof.expiresAt - proof.serverNow! };
        } catch {
            // Unknown outcomes may follow a committed insert. Cleanup is only
            // best-effort for this unreturned proof, not proof of rollback.
            // A confirmed collision belongs to an existing proof: don't revoke
            // it. Every documented denial guarantees no new inserted row.
            if (possiblyIssued) try { await this.call('revoke_legacy_session', { p_token_hash: hash }); } catch { /* Fail closed below. */ }
            return unavailable();
        }
    }
    async verifySession(token: unknown, expectedUserId?: unknown): Promise<RankedIdentity | null> {
        const hash = hashToken(token);
        if (!hash || (expectedUserId !== undefined && !isRankedUserId(expectedUserId))) return null;
        const started = performance.now();
        const row = await this.call('inspect_legacy_session', { p_token_hash: hash, p_expected_user_id: expectedUserId ?? null });
        if (['invalid', 'revoked'].includes(row.status as string) && exact(row, ['status'])) return null;
        if (row.status !== 'valid' && row.status !== 'expired') return unavailable();
        const proof = identity(row, 'status');
        if (expectedUserId !== undefined && proof.userId !== expectedUserId) return unavailable();
        return row.status === 'valid' ? { ...proof, admissionDeadline: started + proof.expiresAt - proof.serverNow! } : null;
    }
    async inspectLiveSessions(sessions: readonly LiveLegacySession[]): Promise<LiveLegacyStatus[]> {
        if (!sessions.length || sessions.length > 200) return unavailable();
        const inputs = sessions.map(session => {
            const tokenHash = hashToken(session.token), { incarnation, generation } = session.fence;
            if (!tokenHash || !isRankedUserId(session.userId) || !UUID.test(incarnation)
                || !GENERATION.test(generation) || BigInt(generation) > 9223372036854775807n) return unavailable();
            return { tokenHash, userId: session.userId, incarnation, generation };
        });
        const row = await this.call('inspect_live_legacy_sessions', { p_sessions: inputs });
        if (!exact(row, ['serverNow', 'sessions']) || !timestamp(row.serverNow)
            || !Array.isArray(row.sessions) || row.sessions.length !== inputs.length) return unavailable();
        return row.sessions.map(value => {
            const result = object(value);
            if (!result || !exact(result, ['status']) || !['valid', 'expired', 'revoked', 'evidence_lost'].includes(result.status as string)) return unavailable();
            return result.status as LiveLegacyStatus;
        });
    }
    private revoked(row: Record<string, unknown>, maximum: number): number {
        if (!exact(row, ['revoked']) || !Number.isSafeInteger(row.revoked) || (row.revoked as number) < 0 || (row.revoked as number) > maximum) return unavailable();
        return row.revoked as number;
    }
    async revokeSession(token: unknown): Promise<boolean> {
        const hash = hashToken(token); if (!hash) return false;
        return this.revoked(await this.call('revoke_legacy_session', { p_token_hash: hash }), 1) === 1;
    }
    async revokeUserSessions(userId: unknown): Promise<number> {
        if (!isRankedUserId(userId)) return 0;
        return this.revoked(await this.call('revoke_user_legacy_sessions', { p_user_id: userId }), 2147483647);
    }
}
export function createDurableRankedAuth(client: Pick<SupabaseClient, 'rpc'>): DurableRankedAuth {
    return new DurableRankedAuth((name, parameters, signal) => client.rpc(name, parameters).abortSignal(signal));
}
