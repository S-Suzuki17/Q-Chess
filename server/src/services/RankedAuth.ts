import { createHash, randomBytes } from 'node:crypto';

export const MAX_RANKED_SESSION_TTL_MS = 60 * 60 * 1000;
export const MAX_RANKED_SESSIONS = 10_000;
export const MAX_RANKED_USER_ID_BYTES = 256;
export const MAX_RANKED_PASSWORD_BYTES = 1024;

const TOKEN_PATTERN = /^ranked_[A-Za-z0-9_-]{43}$/;
const RESERVED_USER_ID_PATTERN = /^(?:guest(?:[-_]|$)|anon(?:ymous)?(?:[-_]|$)|cpu(?:[-_]|$)|ai(?::|$)|supabase-)/i;

export interface RankedIdentity {
    userId: string;
    /** Unix time in milliseconds. */
    expiresAt: number;
}

export interface RankedSession extends RankedIdentity {
    token: string;
}

export interface RankedAuthOptions {
    /** Defaults to one hour; may only be shortened. */
    sessionTtlMs?: number;
    /** Defaults to 10,000; may only be reduced. Full stores reject new sessions. */
    maxSessions?: number;
}

export type VerifyLegacyPassword = (userId: string, password: string) => Promise<boolean>;

export function isRankedUserId(value: unknown): value is string {
    return typeof value === 'string'
        && value.length > 0
        && value.length <= MAX_RANKED_USER_ID_BYTES
        && Buffer.byteLength(value, 'utf8') <= MAX_RANKED_USER_ID_BYTES
        && value === value.trim()
        && !/[\u0000-\u001f\u007f]/.test(value)
        && !RESERVED_USER_ID_PATTERN.test(value);
}

function isPassword(value: unknown): value is string {
    return typeof value === 'string'
        && value.length > 0
        && value.length <= MAX_RANKED_PASSWORD_BYTES
        && Buffer.byteLength(value, 'utf8') <= MAX_RANKED_PASSWORD_BYTES;
}

function tokenHash(token: unknown): string | null {
    if (typeof token !== 'string' || token.length !== 50 || !TOKEN_PATTERN.test(token)) return null;
    return createHash('sha256').update(token).digest('hex');
}

/**
 * Process-local proof for existing password accounts. The verifier must perform
 * the actual legacy password check and return true only after successful login.
 * Passwords and plaintext tokens are never retained in the session store.
 *
 * A restart invalidates all sessions and requires login again. Use one shared
 * instance in the existing single server process; multiple server instances
 * would need a shared session store. HTTPS is required when carrying credentials
 * or tokens. Rate limiting and request body limits belong at the route boundary.
 */
export class RankedAuth {
    private readonly sessions = new Map<string, RankedIdentity>();
    private readonly pendingChecks = new Map<string, Set<{ revoked: boolean }>>();
    private readonly sessionTtlMs: number;
    private readonly maxSessions: number;

    constructor(
        private readonly verifyLegacy: VerifyLegacyPassword,
        options: RankedAuthOptions = {},
    ) {
        this.sessionTtlMs = options.sessionTtlMs ?? MAX_RANKED_SESSION_TTL_MS;
        this.maxSessions = options.maxSessions ?? MAX_RANKED_SESSIONS;
        if (!Number.isSafeInteger(this.sessionTtlMs)
            || this.sessionTtlMs < 1 || this.sessionTtlMs > MAX_RANKED_SESSION_TTL_MS) {
            throw new RangeError('Ranked session lifetime must be between 1 millisecond and 1 hour.');
        }
        if (!Number.isSafeInteger(this.maxSessions)
            || this.maxSessions < 1 || this.maxSessions > MAX_RANKED_SESSIONS) {
            throw new RangeError('Ranked session capacity must be between 1 and 10000.');
        }
    }

    async issueLegacySession(userId: unknown, password: unknown): Promise<RankedSession | null> {
        if (!isRankedUserId(userId) || !isPassword(password)) return null;
        this.cleanupExpiredSessions();
        if (this.sessions.size >= this.maxSessions) return null;

        const check = { revoked: false };
        const checks = this.pendingChecks.get(userId) ?? new Set<{ revoked: boolean }>();
        checks.add(check); this.pendingChecks.set(userId, checks);
        try {
            // Truthy RPC payloads, errors, and rejected checks must never grant access.
            if (await this.verifyLegacy(userId, password) !== true || check.revoked) return null;
            this.cleanupExpiredSessions();
            // Another verification may have filled the store while this one awaited.
            if (this.sessions.size >= this.maxSessions) return null;

            for (let attempt = 0; attempt < 3; attempt += 1) {
                const token = `ranked_${randomBytes(32).toString('base64url')}`;
                const hash = tokenHash(token)!;
                if (this.sessions.has(hash)) continue;
                const identity = { userId, expiresAt: Date.now() + this.sessionTtlMs };
                this.sessions.set(hash, identity);
                return { ...identity, token };
            }
        } catch {
            // Do not log the verifier error: upstream errors may contain credentials.
            return null;
        } finally {
            checks.delete(check); if (!checks.size) this.pendingChecks.delete(userId);
        }
        return null;
    }

    verifySession(token: unknown, expectedUserId?: unknown): RankedIdentity | null {
        const hash = tokenHash(token);
        if (!hash) return null;
        const identity = this.sessions.get(hash);
        if (!identity) return null;
        if (identity.expiresAt <= Date.now()) {
            this.sessions.delete(hash);
            return null;
        }
        if (expectedUserId !== undefined
            && (!isRankedUserId(expectedUserId) || expectedUserId !== identity.userId)) return null;
        // Callers cannot mutate the identity retained in the store.
        return { ...identity };
    }

    revokeSession(token: unknown): boolean {
        const hash = tokenHash(token);
        return hash ? this.sessions.delete(hash) : false;
    }

    revokeUserSessions(userId: unknown): number {
        if (!isRankedUserId(userId)) return 0;
        for (const check of this.pendingChecks.get(userId) ?? []) check.revoked = true;
        let revoked = 0;
        for (const [hash, identity] of this.sessions) {
            if (identity.userId === userId) {
                this.sessions.delete(hash);
                revoked += 1;
            }
        }
        return revoked;
    }

    cleanupExpiredSessions(): number {
        const now = Date.now();
        let removed = 0;
        for (const [hash, identity] of this.sessions) {
            if (identity.expiresAt <= now) {
                this.sessions.delete(hash);
                removed += 1;
            }
        }
        return removed;
    }

    get activeSessionCount(): number {
        this.cleanupExpiredSessions();
        return this.sessions.size;
    }
}
