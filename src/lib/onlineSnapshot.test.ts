import { describe, expect, it } from 'vitest';
import { acceptsOnlineSnapshot, isNewOnlineMove } from './onlineSnapshot';
const initial = { matchId: 'match', version: 0, lastAction: null };
const moved = { ...initial, version: 1, lastAction: { actionId: 'move-1', action: { type: 'MOVE' } } };
describe('online snapshot ordering and audio', () => {
    it('accepts initial and same-version clock/intro updates', () => {
        expect(acceptsOnlineSnapshot('match', null, initial)).toBe(true);
        expect(acceptsOnlineSnapshot('match', moved, moved)).toBe(true);
    });
    it('rejects other rooms, outdated and malformed packets', () => {
        for (const incoming of [null, {}, { ...initial, matchId: 'old-room' }, { ...initial, version: NaN }, { ...initial, version: -1 }, initial]) {
            expect(acceptsOnlineSnapshot('match', moved, incoming)).toBe(false);
        }
    });
    it('only sounds a new move once, not intro, reconnect, clock, resign or duplicate sync', () => {
        expect(isNewOnlineMove(initial, moved)).toBe(true);
        for (const [previous, next] of [[null, moved], [initial, initial], [moved, moved], [moved, { ...moved, version: 2 }], [initial, { ...moved, lastAction: { actionId: 'resign', action: { type: 'RESIGN' } } }]] as const) {
            expect(isNewOnlineMove(previous, next)).toBe(false);
        }
    });
});
