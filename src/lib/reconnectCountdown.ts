export const RECONNECT_GRACE_SECONDS = 30;

/** A display clock only. The server, never this countdown, decides the result. */
export function reconnectDeadline(roomId: string, payload: unknown, receivedAt: number,
    previous: number | null = null): number | null {
    if (!payload || typeof payload !== 'object') return previous;
    const data = payload as Record<string, unknown>;
    if (data.matchId !== undefined && data.matchId !== roomId) return previous;
    let remaining = RECONNECT_GRACE_SECONDS * 1000;
    if (typeof data.deadline === 'number' && Number.isFinite(data.deadline)
        && typeof data.serverNow === 'number' && Number.isFinite(data.serverNow)) {
        remaining = data.deadline - data.serverNow;
    } else if (typeof data.gracePeriodSeconds === 'number' && Number.isFinite(data.gracePeriodSeconds)) {
        remaining = data.gracePeriodSeconds * 1000;
    }
    const candidate = receivedAt + Math.max(0, Math.min(RECONNECT_GRACE_SECONDS * 1000, remaining));
    // Duplicate notifications or a re-render cannot start another grace period.
    return previous === null ? candidate : Math.min(previous, candidate);
}

export function reconnectSecondsLeft(deadline: number, now: number): number {
    return Math.max(0, Math.ceil((deadline - now) / 1000));
}
