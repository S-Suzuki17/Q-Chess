import { describe, it, expect } from 'vitest';
import { IdentityPool } from '../../lib/IdentityPool';
import { type Token, deduceMoveTypes, isPlayerInCheck } from '../../lib/GameEngine';
import type { PieceType } from '../../config/gameConfig';

const ALL_TYPES: PieceType[] = ['King', 'Queen', 'Rook', 'Bishop', 'Knight', 'Pawn'];
const initialProbabilities = { King: 1, Queen: 1, Rook: 1, Bishop: 1, Knight: 1, Pawn: 1 };
type Side = 'white' | 'black';
type Position = { tokens: Token[]; pool: IdentityPool; sideToMove: Side };

function initial(sideToMove: Side): Position {
    const tokens: Token[] = [];
    const pool = new IdentityPool();
    for (const [player, rows] of [['black', [0, 1]], ['white', [6, 7]]] as const) {
        for (const row of rows) for (let col = 0; col < 8; col++) {
            const id = `${player}_${row}_${col}`;
            tokens.push({ id, player, row, col, probabilities: { ...initialProbabilities }, isCaptured: false, hasMoved: false });
            pool.registerPiece(id);
        }
    }
    return { tokens, pool, sideToMove };
}

/** One ply of concrete identity branches. Check the old global constraints and
 * king safety; this counts identities separately, unlike a combined UI move. */
function onePly({ tokens, pool, sideToMove }: Position) {
    const moves: { id: string; type: PieceType; row: number; col: number }[] = [];
    for (const token of tokens.filter(piece => !piece.isCaptured && piece.player === sideToMove)) {
        const identities = pool.piecePossibilities.get(token.id)!;
        for (let row = 0; row < 8; row++) for (let col = 0; col < 8; col++) {
            if (token.row === row && token.col === col) continue;
            const target = tokens.find(piece => !piece.isCaptured && piece.row === row && piece.col === col);
            if (target?.player === sideToMove) continue;
            const geometry = deduceMoveTypes(token, row, col, tokens);
            for (const type of ALL_TYPES.filter(type => identities.has(type) && geometry.includes(type))) {
                const nextPool = pool.clone();
                nextPool.restrictIdentity(token.id, [type]);
                const nextTokens = tokens.map(piece => {
                    if (piece.id === target?.id) {
                        nextPool.piecePossibilities.get(piece.id)?.delete('King');
                        return { ...piece, isCaptured: true, row: -1, col: -1 };
                    }
                    return piece.id === token.id ? { ...piece, row, col, hasMoved: true } : piece;
                });
                if (!nextPool.resolveGlobalConstraints(nextTokens) || isPlayerInCheck(sideToMove, nextTokens, nextPool)) continue;
                moves.push({ id: token.id, type, row, col });
            }
        }
    }
    return moves;
}

function resolved(rows: [string, Side, PieceType, number, number][]): Position {
    const pool = new IdentityPool();
    const tokens: Token[] = rows.map(([id, player, type, row, col]) => {
        pool.registerPiece(id); pool.restrictIdentity(id, [type]);
        const probabilities = { King: Number(type === 'King'), Queen: Number(type === 'Queen'),
            Rook: Number(type === 'Rook'), Bishop: Number(type === 'Bishop'),
            Knight: Number(type === 'Knight'), Pawn: Number(type === 'Pawn') };
        return { id, player, row, col, probabilities, isCaptured: false, hasMoved: true };
    });
    return { tokens, pool, sideToMove: 'white' };
}

describe('Legacy finite one-ply regression', () => {
    it('counts independently derived initial identity branches for both sides without changing the position', () => {
        // Front pawns: 8*2. Knights: 26 front + 14 back. Bishops: two
        // diagonals totalling 50. Rooks: 8*5. Queens: 50+40. Every revealed
        // king destination is exposed to the enemy file, so no King branch.
        const counts = { Pawn: 16, Knight: 40, Bishop: 50, Rook: 40, Queen: 90, King: 0 };
        const bySide = (['white', 'black'] as const).map(side => {
            const position = initial(side);
            const before = JSON.stringify({ tokens: position.tokens, masks: [...position.pool.piecePossibilities] });
            const moves = onePly(position);
            expect(moves).toHaveLength(236);
            for (const type of ALL_TYPES) expect(moves.filter(move => move.type === type)).toHaveLength(counts[type]);
            expect(JSON.stringify({ tokens: position.tokens, masks: [...position.pool.piecePossibilities] })).toBe(before);
            return moves;
        });
        const key = (move: { type: PieceType; row: number; col: number }) => `${move.type}:${move.row}:${move.col}`;
        expect(bySide[0].map(move => key({ ...move, row: 7 - move.row, col: 7 - move.col })).sort())
            .toEqual(bySide[1].map(key).sort());
    });
    it('counts fourteen unobstructed rook moves and three corner king moves', () => {
        const moves = onePly(resolved([['wk', 'white', 'King', 7, 0], ['wr', 'white', 'Rook', 4, 4], ['bk', 'black', 'King', 0, 7]]));
        expect(moves).toHaveLength(17);
        expect(moves.filter(move => move.id === 'wr')).toHaveLength(14);
        expect(moves.filter(move => move.id === 'wk').map(({row,col}) => [row,col]).sort())
            .toEqual([[6,0],[6,1],[7,1]]);
    });
    it('keeps a pinned rook on its file and permits capturing the pinning rook', () => {
        const moves = onePly(resolved([['wk', 'white', 'King', 7, 4], ['wr', 'white', 'Rook', 6, 4],
            ['br', 'black', 'Rook', 0, 4], ['bk', 'black', 'King', 0, 7]]));
        expect(moves).toHaveLength(10);
        expect(moves.filter(move => move.id === 'wr').map(({row,col}) => [row,col]).sort())
            .toEqual([[0,4],[1,4],[2,4],[3,4],[4,4],[5,4]]);
        expect(moves.filter(move => move.id === 'wk')).toHaveLength(4);
    });
});
