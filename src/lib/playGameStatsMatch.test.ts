import { describe, expect, it } from 'vitest';
import { localMatchStats, onlineMatchStats } from './playGameStatsMatch';

const local = { matchKey: 'local:a', mode: 'practice' as const, timeControl: '10m' as const, side: 'white' as const,
    winner: 'white_wins' as const, moves: [{ player: 'white' as const, capturedTokenId: 'a' }, { player: 'black' as const }, { player: 'white' as const }], checkmate: true };
const online = { roomId: 'a', userId: 'alice', role: 'white' as const, cancelled: false, mode: 'ranked' as const, timeControl: '3m' as const,
    snapshot: { matchId: 'a', players: { host: 'alice', joiner: 'bob' }, moveCount: 5, gameOver: 'WHITE', gameOverReason: 'checkmate',
        pieces: [{ team: 0, captured: true }, { team: 1, captured: true }, { team: 1, captured: true }, { team: 1, captured: false }] } };

describe('completion statistics from actual game state', () => {
    it('counts only the local player moves and captures and maps draws/losses', () => {
        expect(localMatchStats(local)).toMatchObject({ playerMoves: 2, captures: 1, result: 'win', checkmate: true });
        expect(localMatchStats({ ...local, side: 'black' })).toMatchObject({ playerMoves: 1, captures: 0, result: 'loss' });
        expect(localMatchStats({ ...local, winner: 'draw' })).toMatchObject({ result: 'draw' });
    });
    it('excludes ongoing games, spectators and no-move resignations', () => {
        expect(localMatchStats({ ...local, winner: null })).toBeNull();
        expect(localMatchStats({ ...local, side: 'spectator' })).toBeNull();
        expect(localMatchStats({ ...local, moves: [] })).toBeNull();
    });
    it('uses server participant identity and ply count for both colors even after reconnect', () => {
        expect(onlineMatchStats(online)).toMatchObject({ matchKey: 'online:a:white', playerMoves: 3, captures: 2, result: 'win' });
        expect(onlineMatchStats({ ...online, userId: 'bob' })).toMatchObject({ matchKey: 'online:a:black', playerMoves: 2, captures: 1, result: 'loss' });
        expect(onlineMatchStats({ ...online, snapshot: { ...online.snapshot, gameOver: { winner: 'DRAW' } } })).toMatchObject({ result: 'draw' });
    });
    it('rejects other rooms, nonparticipants, cancellations and malformed snapshots', () => {
        for (const change of [{ roomId: 'b' }, { userId: 'eve' }, { role: 'spectator' as const }, { cancelled: true }]) expect(onlineMatchStats({ ...online, ...change })).toBeNull();
        for (const change of [{ gameOver: null }, { gameOver: 'CANCELLED' }, { introPending: true }, { moveCount: 0 }, { moveCount: 3.5 }, { pieces: undefined }]) {
            expect(onlineMatchStats({ ...online, snapshot: { ...online.snapshot, ...change } })).toBeNull();
        }
        expect(onlineMatchStats({ ...online, userId: 'bob', snapshot: { ...online.snapshot, moveCount: 1 } })).toBeNull();
    });
});
