import { describe, expect, it } from 'vitest';
import { reconnectDeadline, reconnectSecondsLeft } from './reconnectCountdown';

describe('server-authoritative thirty-second reconnection display', () => {
    it('uses server time, regardless of the device wall clock', () => {
        expect(reconnectDeadline('m', { matchId: 'm', deadline: 900000, serverNow: 883000 }, 500)).toBe(17500);
    });
    it('defaults legacy notifications to thirty seconds and caps obsolete grace values', () => {
        expect(reconnectDeadline('m', {}, 100)).toBe(30100);
        expect(reconnectDeadline('m', { gracePeriodSeconds: 120 }, 100)).toBe(30100);
    });
    it('does not extend an existing absence for duplicate or stale notifications', () => {
        const first = reconnectDeadline('m', { deadline: 31000, serverNow: 1000 }, 500)!;
        expect(reconnectDeadline('m', { deadline: 31000, serverNow: 1000 }, 9500, first)).toBe(first);
        expect(reconnectDeadline('m', {}, 30000, first)).toBe(first);
    });
    it('ignores another match and malformed notifications', () => {
        expect(reconnectDeadline('m', { matchId: 'other' }, 100)).toBeNull();
        expect(reconnectDeadline('m', null, 100, 900)).toBe(900);
    });
    it('catches up after a suspended tab, but never declares a local win at zero', () => {
        expect(reconnectSecondsLeft(30100, 30101)).toBe(0);
        expect(reconnectSecondsLeft(30100, 9200)).toBe(21);
        expect(reconnectDeadline('m', { deadline: 1000, serverNow: 2000 }, 700)).toBe(700);
    });
    it('starts a fresh absence only after the previous one was explicitly cleared', () => {
        expect(reconnectDeadline('m', {}, 60000, null)).toBe(90000);
    });
});
