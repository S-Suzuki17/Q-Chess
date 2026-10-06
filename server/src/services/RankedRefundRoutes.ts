import express from 'express';
import { type RankedSessionAuthority, isRankedUserId } from './RankedAuth';
import { AccountWriteGate } from './AccountDeletion';
import { rankedAdmissionRecoveryEnabled } from './TicketFeatureGates';

export interface RankedRefundReader {
    verifyUser(token: string): Promise<string | null>;
    blocked(userId: string): Promise<boolean>;
    read(userId: string): Promise<{ freeRankedRefunds: number; paidRankedRefunds: number }>;
}

/** Read only. T1's RPC owns expiry/reversal eligibility and uncapped credits. */
export function createRankedRefundRouter(auth: RankedSessionAuthority, store: RankedRefundReader,
    gate: AccountWriteGate, enabled = rankedAdmissionRecoveryEnabled) {
    const router = express.Router();
    const attempts = new Map<string, { count: number; until: number }>();
    const allow = (key: string, max: number) => {
        const now = Date.now();
        for (const [id, entry] of attempts) if (entry.until <= now) attempts.delete(id);
        const entry = attempts.get(key) ?? { count: 0, until: now + 60_000 };
        if (entry.count >= max || (!attempts.has(key) && attempts.size >= 10_000)) return false;
        entry.count++; attempts.set(key, entry); return true;
    };
    router.get('/tickets/ranked-refunds', async (req, res) => {
        res.setHeader('Cache-Control', 'no-store');
        res.vary('Authorization');
        if (!enabled()) { res.status(503).json({ code: 'FEATURE_DISABLED', enabled: false }); return; }
        const limited = () => { res.setHeader('Retry-After', '60'); res.status(429).json({ code: 'TRY_LATER' }); };
        if (!allow(`ip:${req.socket.remoteAddress ?? 'unknown'}`, 180)) { limited(); return; }
        const token = /^Bearer ([-\w.]{1,8192})$/i.exec(req.headers.authorization ?? '')?.[1];
        try {
            const proof = await auth.verifySession(token);
            const userId = proof?.userId ?? (token && /^[-\w]+\.[-\w]+\.[-\w]+$/.test(token) ? await store.verifyUser(token) : null);
            if (!userId || !isRankedUserId(userId)) { res.status(401).json({ code: 'AUTH_REQUIRED' }); return; }
            if (!allow(`user:${userId}`, 90)) { limited(); return; }
            if (Object.keys(req.query).length || req.headers['transfer-encoding'] || Number(req.headers['content-length'] ?? 0) !== 0) {
                res.status(400).json({ code: 'INVALID_REQUEST' }); return;
            }
            if (gate.blocked(userId) || await store.blocked(userId)) { res.status(423).json({ code: 'ACCOUNT_DELETING' }); return; }
            const balance = await store.read(userId);
            if (![balance?.freeRankedRefunds, balance?.paidRankedRefunds].every(value => Number.isSafeInteger(value) && value >= 0)) {
                throw new Error('INVALID_BALANCE');
            }
            // A revocation/deletion while the RPC was pending must not expose an old account's balance.
            if (proof ? !(await auth.verifySession(token, userId)) : !token || await store.verifyUser(token) !== userId) {
                res.status(401).json({ code: 'AUTH_REQUIRED' }); return;
            }
            if (gate.blocked(userId) || await store.blocked(userId)) { res.status(423).json({ code: 'ACCOUNT_DELETING' }); return; }
            if (!enabled()) { res.status(503).json({ code: 'FEATURE_DISABLED', enabled: false }); return; }
            res.json({ userId, enabled: true, freeRankedRefunds: balance.freeRankedRefunds, paidRankedRefunds: balance.paidRankedRefunds });
        } catch { res.status(503).json({ code: 'REFUND_BALANCE_UNAVAILABLE' }); }
    });
    return router;
}
