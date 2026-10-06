import express from 'express';
import { isRankedUserId, type RankedIdentity } from './RankedAuth';
import { AccountWriteGate, type AccountDeletionStore } from './AccountDeletion';

type SessionInspector = { verifySession(token: unknown, expectedUserId?: unknown): Promise<RankedIdentity | null> };

/** Legacy bearer inspection only. Account restrictions belong to admission, not identity. */
export function createRankedSessionInspectionRouter(authority: SessionInspector,
    deletion: Pick<AccountDeletionStore, 'blocked'>, gate: AccountWriteGate) {
    const router = express.Router();
    router.all('/auth/ranked-session/status', async (req, res) => {
        res.setHeader('Cache-Control', 'no-store'); res.setHeader('Vary', 'Authorization');
        if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); res.status(405).json({ code: 'INVALID_REQUEST' }); return; }
        if (Object.keys(req.query).length || req.headers['transfer-encoding'] !== undefined ||
            (req.headers['content-length'] !== undefined && req.headers['content-length'] !== '0') ||
            (req.body !== undefined && (typeof req.body !== 'object' || req.body === null || Object.keys(req.body).length))) {
            res.status(400).json({ code: 'INVALID_REQUEST' }); return;
        }
        const headerCount = req.rawHeaders.filter((_, i) => i % 2 === 0 && req.rawHeaders[i].toLowerCase() === 'authorization').length;
        const token = headerCount === 1 ? /^Bearer (ranked_[A-Za-z0-9_-]{43})$/.exec(req.headers.authorization ?? '')?.[1] : undefined;
        const invalid = () => { res.status(401).json({ code: 'AUTH_REQUIRED' }); };
        if (!token) { invalid(); return; }
        let release: (() => void) | undefined;
        try {
            const identity = await authority.verifySession(token);
            if (!identity || !isRankedUserId(identity.userId)) { invalid(); return; }
            release = gate.enter(identity.userId) ?? undefined;
            if (!release || await deletion.blocked(identity.userId) || gate.blocked(identity.userId)) { invalid(); return; }
            // A logout/deletion may complete while the deletion lookup yields.
            const current = await authority.verifySession(token, identity.userId);
            if (!current || current.userId !== identity.userId || gate.blocked(identity.userId)) { invalid(); return; }
            const serverNow = current.serverNow ?? Date.now();
            if (!Number.isSafeInteger(current.expiresAt) || current.expiresAt <= serverNow) { invalid(); return; }
            res.json({ userId: current.userId, expiresAt: current.expiresAt, serverNow });
        } catch {
            res.setHeader('Retry-After', '5'); res.status(503).json({ code: 'UNAVAILABLE' });
        } finally { release?.(); }
    });
    return router;
}
