import { describe, expect, it } from 'vitest';
import type { MatchSession } from '../matchmaking/MatchmakingService';
import { rankedTicketStartParticipants } from './TicketSpendStartPolicy';

const ID = '11111111-2222-4333-8444-555555555555';
function match(overrides: Partial<MatchSession> = {}): MatchSession {
    return {
        matchId: ID, mode: 'ranked', state: 'IN_GAME', timeControl: 600,
        players: { host: 'Alice', joiner: 'Bob' }, playerNames: {},
        connected: { host: true, joiner: true },
        engine: {} as MatchSession['engine'], justStartedFlag: true,
        createdAt: 0, ...overrides,
    };
}

describe('ranked match-start ticket eligibility (not wired to gameplay)', () => {
    it('returns both verified human participants only at first playable start', () => {
        expect(rankedTicketStartParticipants(match())).toEqual(['Alice', 'Bob']);
        expect(rankedTicketStartParticipants(match({ justStartedFlag: false }))).toBeNull();
    });
    it('returns only the human for either CPU fallback side', () => {
        const cpu = { id: `ai:${ID}`, side: 'host' as const,
            profile: {} as NonNullable<MatchSession['cpu']>['profile'] };
        expect(rankedTicketStartParticipants(match({ cpu,
            players: { host: cpu.id, joiner: 'Alice' } }))).toEqual(['Alice']);
        expect(rankedTicketStartParticipants(match({ cpu: { ...cpu, side: 'joiner' },
            players: { host: 'Alice', joiner: cpu.id } }))).toEqual(['Alice']);
    });
    it('never selects a queue, disconnected, canceled, casual, or stale CPU match', () => {
        expect(rankedTicketStartParticipants(match({ state: 'CONNECTING' }))).toBeNull();
        expect(rankedTicketStartParticipants(match({ state: 'CANCELLED' }))).toBeNull();
        expect(rankedTicketStartParticipants(match({ mode: 'random' }))).toBeNull();
        expect(rankedTicketStartParticipants(match({ connected: { host: true, joiner: false } }))).toBeNull();
        expect(rankedTicketStartParticipants(match({ engine: undefined }))).toBeNull();
        expect(rankedTicketStartParticipants(match({ cpu: { id: 'ai:wrong', side: 'host',
            profile: {} as NonNullable<MatchSession['cpu']>['profile'] } }))).toBeNull();
    });
});
