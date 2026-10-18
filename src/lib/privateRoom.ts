import type { PrivateRoomIntent, PrivateRoomRequest } from '../../server/src/protocol/PrivateRoom';
import type { TimeControl } from '../types/game';

export function privateRoomConnection(intent: PrivateRoomIntent | undefined, timeControl: TimeControl, accepted: boolean): PrivateRoomRequest {
    if (accepted || !intent || intent === 'reconnect') return { intent: 'reconnect' };
    return intent === 'create'
        ? { intent: 'create', timeControl: timeControl === '10s' ? 10 : timeControl === '3m' ? 180 : 600 }
        : { intent: 'join' };
}

export function matchTimeControl(milliseconds: unknown, fallback: TimeControl): TimeControl {
    // The wire ID stays 10; the current engine uses a 30-second turn clock.
    return milliseconds === 30_000 || milliseconds === 10_000 ? '10s' : milliseconds === 180_000 ? '3m' : milliseconds === 600_000 ? '10m' : fallback;
}

export function privateRoomReady(value: unknown, roomId: string): { matchId: string; timeControl: number } | null {
    if (!value || typeof value !== 'object') return null;
    const data = value as Record<string, unknown>;
    return data.matchId === roomId && [10, 180, 600].includes(data.timeControl as number)
        ? { matchId: roomId, timeControl: data.timeControl as number } : null;
}
