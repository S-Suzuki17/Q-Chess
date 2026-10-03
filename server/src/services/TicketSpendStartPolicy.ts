import type { MatchSession } from '../matchmaking/MatchmakingService';

/**
 * Pure eligibility predicate for a future, durable match-start transaction.
 * It does not spend tickets or override the separate first 3 free ranked
 * matches per UTC day. Only additional matches may consume ranked tickets.
 * The live matchmaking flow must NOT call the spend RPC until the activation
 * race and the free-quota policy have been resolved.
 */
export function rankedTicketStartParticipants(match: MatchSession): string[] | null {
    if (match.mode !== 'ranked' || match.state !== 'IN_GAME' || !match.engine
        || match.justStartedFlag !== true || !match.connected.host || !match.connected.joiner) return null;
    if (match.cpu) {
        const cpuSide = match.cpu.side;
        if (match.players[cpuSide] !== match.cpu.id) return null;
        const human = match.players[cpuSide === 'host' ? 'joiner' : 'host'];
        return human && !human.startsWith('ai:') ? [human] : null;
    }
    const { host, joiner } = match.players;
    return host && joiner && host !== joiner && !host.startsWith('ai:') && !joiner.startsWith('ai:')
        ? [host, joiner] : null;
}
