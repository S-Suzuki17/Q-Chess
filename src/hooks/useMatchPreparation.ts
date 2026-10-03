'use client';
import { useEffect, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { acceptsOnlineSnapshot } from '../lib/onlineSnapshot';
import { ratingSettlement } from '../lib/rankedProtocol';

export type MatchPreparation = 'admitting' | 'recovering' | 'unavailable' | 'checking';
export function matchPreparationReason(value: unknown, roomId: string | undefined): MatchPreparation | null {
    if (!roomId || !value || typeof value !== 'object') return null;
    const row = value as Record<string, unknown>;
    if (row.matchId !== roomId || typeof row.reason !== 'string') return null;
    if (row.reason === 'admitting') return 'admitting';
    if (['voiding', 'owner_recovery', 'owner_unavailable'].includes(row.reason)) return 'recovering';
    if (row.reason === 'recovery_unavailable') return 'unavailable';
    return 'checking'; // Do not expose raw server messages; future reasons still pause stale boards.
}

/** Recovery can finish with a snapshot, a cancellation, or a saved rating receipt. */
export function useMatchPreparation(socket: Socket | null, roomId: string | undefined, userId: string | undefined,
    latestSnapshot?: { current: Parameters<typeof acceptsOnlineSnapshot>[1] }) {
    const [pending, setPending] = useState<{ socket: Socket; roomId: string; userId: string | undefined; reason: MatchPreparation } | null>(null);
    useEffect(() => {
        if (!socket || !roomId) return;
        let terminal = false, waiting = false;
        let previous: Parameters<typeof acceptsOnlineSnapshot>[1] = null;
        const clear = () => { waiting = false; setPending(null); };
        clear();
        const preparing = (data: unknown) => {
            const reason = matchPreparationReason(data, roomId);
            if (!reason || terminal) return;
            waiting = true; setPending({ socket, roomId, userId, reason });
        };
        const snapshot = (data: Parameters<typeof acceptsOnlineSnapshot>[2] & { gameOver?: unknown }) => {
            if (terminal || !acceptsOnlineSnapshot(roomId, latestSnapshot?.current ?? previous, data)) return;
            previous = data; terminal = !!data?.gameOver; clear();
        };
        const cancelled = (data: { matchId?: string } | null) => { if (data?.matchId === roomId) { terminal = true; clear(); } };
        const settled = (data: unknown) => { if (ratingSettlement(data, roomId, userId)) { terminal = true; clear(); } };
        socket.on('match_preparing', preparing);
        socket.on('match_start', snapshot); socket.on('sync_state', snapshot);
        socket.on('match_cancelled', cancelled); socket.on('rating_settled', settled);
        // Poll only this outstanding match; this never queues a new match or spends another ticket.
        const timer = setInterval(() => { if (waiting && !terminal && socket.connected) socket.emit('request_sync', { matchId: roomId }); }, 5000);
        return () => {
            clearInterval(timer);
            socket.off('match_preparing', preparing);
            socket.off('match_start', snapshot); socket.off('sync_state', snapshot);
            socket.off('match_cancelled', cancelled); socket.off('rating_settled', settled);
        };
    }, [socket, roomId, userId, latestSnapshot]);
    return pending?.socket === socket && pending.roomId === roomId && pending.userId === userId ? pending.reason : null;
}
