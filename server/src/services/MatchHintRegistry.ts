import type { MatchmakingService, MatchSession } from '../matchmaking/MatchmakingService';
import { CrownHintRegistry } from './CrownHintRegistry';
import { applyPracticeMove } from '../quantum-engine/practice';
import { adviceForMove } from '../quantum-engine/ai/hintAdvice';
import { MatchHintError, type HintPositionRegistry, type TrustedHintPosition } from './MatchHintTypes';

export class MatchHintRegistry implements HintPositionRegistry {
    constructor(private readonly matches: MatchmakingService,
        private readonly canAdvance: (match: MatchSession) => boolean,
        private readonly connected: (userId: string) => boolean) {}
    private match(userId: string, matchId: string) {
        if (typeof matchId !== 'string' || !matchId || matchId.length > 128) throw new MatchHintError('INVALID_REQUEST');
        const match = this.matches.getMatch(matchId);
        if (!match?.engine || !Object.values(match.players).includes(userId)) throw new MatchHintError('NOT_A_PARTICIPANT');
        return match;
    }
    contextId(userId: string, matchId: string) { return this.match(userId, matchId).engine!.hintContextFor(userId); }
    position(userId: string, matchId: string, revision: number): TrustedHintPosition {
        const match = this.match(userId, matchId), session = this.matches.getPlayerSession(userId);
        if (match.state !== 'IN_GAME') throw new MatchHintError('SESSION_FINISHED');
        const role = match.players.host === userId ? 'host' : 'joiner';
        if (session?.currentMatchId !== matchId || session.state !== 'IN_GAME' || !this.connected(userId)
            || !match.connected[role] || this.matches.awaitingReconnect(userId, matchId)) throw new MatchHintError('RECONNECT_REQUIRED');
        if (this.matches.authorityCheckPending(match) || !this.canAdvance(match)) throw new MatchHintError('MATCH_AUTHORITY_UNAVAILABLE');
        // Queue mode is authoritative; private engines use random display metadata.
        return { ...match.engine!.hintPosition(userId, revision), mode: match.mode ?? 'private' };
    }
}
export function crownHintAuthority(registry: CrownHintRegistry): HintPositionRegistry {
    return {
        contextId: (userId, runId) => registry.read(userId, runId).hintContextId,
        position(userId, runId, revision) {
            const p = registry.hintSnapshot(userId, runId, revision);
            return { contextId: p.hintContextId, kind: 'crown', mode: 'crown', side: p.playerSide,
                revision: p.revision, stateHash: p.stateHash, rulesVersion: p.rulesVersion, state: p.state,
                remainingMs: p.remainingMs, validUntilMs: p.validUntilMs,
                validateMove(move) {
                    if (!p.state.pieces.some(piece => piece.id === move?.pieceId && piece.alive && piece.owner === p.playerSide)) {
                        throw new MatchHintError('NO_LEGAL_HINT');
                    }
                    try { applyPracticeMove(p.state, move); return adviceForMove(p.state, move); }
                    catch { throw new MatchHintError('NO_LEGAL_HINT'); }
                },
                acquire: () => registry.acquireHint(userId, runId, revision, p.stateHash) };
        },
    };
}
