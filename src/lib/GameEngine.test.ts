import { describe, test, expect, beforeEach } from 'vitest';
import {
    Token,
    deduceMoveTypes,
    calculateProbabilities,
    isTokenThreatened,
    isPlayerInCheck,
    checkGameOver,
    isCheckmate,
} from './GameEngine';
import { IdentityPool } from './IdentityPool';
import { PieceType } from '../config/gameConfig';

// Helper to create a minimal token
function makeToken(id: string, player: 'white' | 'black', row: number, col: number, overrides: Partial<Token> = {}): Token {
    return {
        id,
        player,
        row,
        col,
        probabilities: { King: 0, Queen: 0, Rook: 0, Bishop: 0, Knight: 0, Pawn: 0 },
        ...overrides,
    };
}

describe('GameEngine', () => {

    describe('deduceMoveTypes', () => {

        test('should return empty array for zero movement', () => {
            const token = makeToken('t1', 'white', 3, 3);
            const result = deduceMoveTypes(token, 3, 3, [token]);
            expect(result).toEqual([]);
        });

        // ─────────────────── Knight ───────────────────
        test('should detect Knight for L-shaped moves', () => {
            const token = makeToken('t1', 'white', 4, 4);
            const result = deduceMoveTypes(token, 2, 3, [token]); // 2 up, 1 left
            expect(result).toContain('Knight');
        });

        test('should detect Knight for all 8 L-shapes', () => {
            const token = makeToken('t1', 'white', 4, 4);
            const lShapes = [
                [2, 3], [2, 5], [6, 3], [6, 5],
                [3, 2], [3, 6], [5, 2], [5, 6],
            ];
            for (const [r, c] of lShapes) {
                const result = deduceMoveTypes(token, r, c, [token]);
                expect(result).toContain('Knight');
            }
        });

        test('Knight should be able to jump over pieces', () => {
            const token = makeToken('t1', 'white', 0, 1); // Knight start
            const blocker1 = makeToken('t2', 'white', 1, 0);
            const blocker2 = makeToken('t3', 'white', 1, 1);
            const blocker3 = makeToken('t4', 'white', 1, 2);
            const result = deduceMoveTypes(token, 2, 0, [token, blocker1, blocker2, blocker3]);
            expect(result).toContain('Knight');
        });

        // ─────────────────── King ───────────────────
        test('should detect King for single-step moves', () => {
            const token = makeToken('t1', 'white', 4, 4);
            // All 8 neighbors
            const neighbors = [
                [3, 3], [3, 4], [3, 5],
                [4, 3],         [4, 5],
                [5, 3], [5, 4], [5, 5],
            ];
            for (const [r, c] of neighbors) {
                const result = deduceMoveTypes(token, r, c, [token]);
                expect(result).toContain('King');
            }
        });

        // ─────────────────── Rook ───────────────────
        test('should detect Rook/Queen for straight moves', () => {
            const token = makeToken('t1', 'white', 4, 4);
            // Horizontal
            const result = deduceMoveTypes(token, 4, 7, [token]);
            expect(result).toContain('Rook');
            expect(result).toContain('Queen');
            // Vertical
            const result2 = deduceMoveTypes(token, 0, 4, [token]);
            expect(result2).toContain('Rook');
            expect(result2).toContain('Queen');
        });

        test('should NOT detect Rook/Queen when path is blocked', () => {
            const token = makeToken('t1', 'white', 4, 4);
            const blocker = makeToken('t2', 'white', 4, 5); // blocking path to 4,7
            const result = deduceMoveTypes(token, 4, 7, [token, blocker]);
            expect(result).not.toContain('Rook');
            expect(result).not.toContain('Queen');
        });

        // ─────────────────── Bishop ───────────────────
        test('should detect Bishop/Queen for diagonal moves', () => {
            const token = makeToken('t1', 'white', 4, 4);
            const result = deduceMoveTypes(token, 2, 2, [token]); // 2 diagonal steps
            expect(result).toContain('Bishop');
            expect(result).toContain('Queen');
        });

        test('should NOT detect Bishop/Queen when diagonal is blocked', () => {
            const token = makeToken('t1', 'white', 4, 4);
            const blocker = makeToken('t2', 'white', 3, 3);
            const result = deduceMoveTypes(token, 2, 2, [token, blocker]);
            expect(result).not.toContain('Bishop');
            expect(result).not.toContain('Queen');
        });

        // ─────────────────── Pawn ───────────────────
        test('white pawn should move one step forward (row decreases)', () => {
            const token = makeToken('t1', 'white', 6, 3);
            const result = deduceMoveTypes(token, 5, 3, [token]);
            expect(result).toContain('Pawn');
        });

        test('white pawn should NOT move backward', () => {
            const token = makeToken('t1', 'white', 5, 3);
            const result = deduceMoveTypes(token, 6, 3, [token]);
            expect(result).not.toContain('Pawn');
        });

        test('white pawn double step from start row', () => {
            const token = makeToken('t1', 'white', 6, 3); // start row for white pawns
            const result = deduceMoveTypes(token, 4, 3, [token]);
            expect(result).toContain('Pawn');
        });

        test('white pawn should NOT double step from non-start row', () => {
            const token = makeToken('t1', 'white', 5, 3); // not start row
            const result = deduceMoveTypes(token, 3, 3, [token]);
            expect(result).not.toContain('Pawn');
        });

        test('black pawn should move one step forward (row increases)', () => {
            const token = makeToken('t1', 'black', 1, 3);
            const result = deduceMoveTypes(token, 2, 3, [token]);
            expect(result).toContain('Pawn');
        });

        test('black pawn double step from start row', () => {
            const token = makeToken('t1', 'black', 1, 3); // start row for black pawns
            const result = deduceMoveTypes(token, 3, 3, [token]);
            expect(result).toContain('Pawn');
        });

        test('pawn diagonal capture', () => {
            const whitePawn = makeToken('t1', 'white', 4, 4);
            const blackPiece = makeToken('t2', 'black', 3, 5);
            const result = deduceMoveTypes(whitePawn, 3, 5, [whitePawn, blackPiece]);
            expect(result).toContain('Pawn');
        });

        test('pawn should NOT capture forward (non-diagonal)', () => {
            const whitePawn = makeToken('t1', 'white', 4, 4);
            const blackPiece = makeToken('t2', 'black', 3, 4);
            const result = deduceMoveTypes(whitePawn, 3, 4, [whitePawn, blackPiece]);
            // A capture on the same column should still allow Rook/Queen but NOT Pawn
            expect(result).not.toContain('Pawn');
        });

        test('pawn should NOT move diagonally without capture', () => {
            const whitePawn = makeToken('t1', 'white', 4, 4);
            const result = deduceMoveTypes(whitePawn, 3, 5, [whitePawn]);
            // No capture at target: Pawn should not appear
            expect(result).not.toContain('Pawn');
        });

        // ─────────────────── En Passant ───────────────────
        test('en passant should be detected', () => {
            const whitePawn = makeToken('t1', 'white', 3, 4); // row 3 for white
            const blackPawn = makeToken('t2', 'black', 3, 5); // just moved 2 forward
            const lastMove = { tokenId: 't2', fromRow: 1, fromCol: 5, toRow: 3, toCol: 5 };
            const result = deduceMoveTypes(whitePawn, 2, 5, [whitePawn, blackPawn], lastMove);
            expect(result).toContain('Pawn');
        });

        test('en passant should NOT be detected if last move was not 2 squares', () => {
            const whitePawn = makeToken('t1', 'white', 3, 4);
            const blackPawn = makeToken('t2', 'black', 3, 5);
            const lastMove = { tokenId: 't2', fromRow: 2, fromCol: 5, toRow: 3, toCol: 5 }; // only 1 square
            const result = deduceMoveTypes(whitePawn, 2, 5, [whitePawn, blackPawn], lastMove);
            expect(result).not.toContain('Pawn');
        });

        // ─────────────────── Castling ───────────────────
        test('white kingside castling should be detected', () => {
            const king = makeToken('t1', 'white', 7, 4, { hasMoved: false }); // e1
            const rook = makeToken('t2', 'white', 7, 7, { hasMoved: false }); // h1
            const result = deduceMoveTypes(king, 7, 6, [king, rook]); // g1
            expect(result).toContain('King');
        });

        test('castling should be blocked if piece is in the way', () => {
            const king = makeToken('t1', 'white', 7, 4, { hasMoved: false });
            const rook = makeToken('t2', 'white', 7, 7, { hasMoved: false });
            const blocker = makeToken('t3', 'white', 7, 5, { hasMoved: false }); // f1 blocks
            const result = deduceMoveTypes(king, 7, 6, [king, rook, blocker]);
            // King shouldn't appear for castling if path is blocked
            // But it can still appear from the normal 2-square horizontal move for Rook/Queen
            // Actually, let's check: the path is blocked so Rook/Queen won't be there either
            // The only way King appears for a 2-square move is castling
            // With blocker at f1, the castling path is blocked, so King should not appear for castling
            // But the regular path check: token at (7,4) to (7,6), step by step 7,5 is blocked
            // So Rook/Queen are blocked too.
            expect(result).not.toContain('King');
        });

        test('castling should not work if king has moved', () => {
            const king = makeToken('t1', 'white', 7, 4, { hasMoved: true });
            const rook = makeToken('t2', 'white', 7, 7, { hasMoved: false });
            const result = deduceMoveTypes(king, 7, 6, [king, rook]);
            // With hasMoved=true, the castling code won't add King for the 2-square move
            // But Rook/Queen should still be valid (straight line, no block)
            expect(result).toContain('Rook');
            expect(result).toContain('Queen');
            // King should not appear because 2 squares is out of King range AND castling is blocked
            // Wait - King moves 1 square max normally. Castling check requires !hasMoved
            // The normal absDr<=1 && absDc<=1 check won't match for absDc=2
            // So King should NOT be in the result
            expect(result).not.toContain('King');
        });

        // ─────────────────── Promoted pieces ───────────────────
        test('promoted Queen should only return Queen moves', () => {
            const token = makeToken('t1', 'white', 4, 4, { promotedTo: 'Queen' });
            const diag = deduceMoveTypes(token, 2, 2, [token]);
            expect(diag).toEqual(['Queen']);
            const straight = deduceMoveTypes(token, 4, 7, [token]);
            expect(straight).toEqual(['Queen']);
        });

        test('promoted Knight should only return Knight for L-shapes', () => {
            const token = makeToken('t1', 'white', 4, 4, { promotedTo: 'Knight' });
            const result = deduceMoveTypes(token, 2, 3, [token]);
            expect(result).toEqual(['Knight']);
            // Non-L-shape should not work
            const result2 = deduceMoveTypes(token, 4, 5, [token]);
            expect(result2).toEqual([]);
        });

        test('promoted piece should not be able to move as any other type', () => {
            const token = makeToken('t1', 'white', 4, 4, { promotedTo: 'Bishop' });
            // Straight move should not work for promoted Bishop
            const result = deduceMoveTypes(token, 4, 7, [token]);
            expect(result).toEqual([]);
        });

        // ─────────────────── Capture on occupied square ───────────────────
        test('should detect capture move types when enemy is on target', () => {
            const attacker = makeToken('t1', 'white', 4, 4);
            const defender = makeToken('t2', 'black', 2, 4); // straight line, 2 up
            const result = deduceMoveTypes(attacker, 2, 4, [attacker, defender]);
            expect(result).toContain('Rook');
            expect(result).toContain('Queen');
        });

        test('should NOT allow moving to a square occupied by friendly piece', () => {
            // Note: deduceMoveTypes doesn't enforce this - it's the caller's job.
            // But for the isCapture logic: friendly piece at target means no capture
            const attacker = makeToken('t1', 'white', 4, 4);
            const friendly = makeToken('t2', 'white', 3, 5); // diagonal
            const result = deduceMoveTypes(attacker, 3, 5, [attacker, friendly]);
            // Pawn capture requires enemy at target, so Pawn should not be included
            expect(result).not.toContain('Pawn');
        });

        // ─────────────────── Blocking ───────────────────
        test('captured pieces should NOT block movement', () => {
            const attacker = makeToken('t1', 'white', 4, 4);
            const captured = makeToken('t2', 'black', 4, 5, { isCaptured: true });
            const result = deduceMoveTypes(attacker, 4, 7, [attacker, captured]);
            // The captured piece is still in the tokens array but should not block
            // BUG CHECK: deduceMoveTypes checks `tokens.some(t => t.row === r && t.col === c)` for blocking
            // but doesn't filter out captured pieces!
            expect(result).toContain('Rook');
            expect(result).toContain('Queen');
        });

        // ─────────────────── Deduplication ───────────────────
        test('should not return duplicate types', () => {
            const token = makeToken('t1', 'white', 4, 4);
            // Diagonal 1-step: King + Bishop + Queen
            const result = deduceMoveTypes(token, 3, 3, [token]);
            const uniqueResult = Array.from(new Set(result));
            expect(result.length).toBe(uniqueResult.length);
        });
    });

    describe('calculateProbabilities', () => {
        test('should return equal probabilities for all possibilities', () => {
            const pool = new IdentityPool();
            pool.registerPiece('p1');
            const probs = calculateProbabilities(pool, 'p1');
            const expected = 1 / 6;
            expect(probs.King).toBeCloseTo(expected, 5);
            expect(probs.Queen).toBeCloseTo(expected, 5);
            expect(probs.Pawn).toBeCloseTo(expected, 5);
        });

        test('should return zero for eliminated types', () => {
            const pool = new IdentityPool();
            pool.piecePossibilities.set('p1', new Set<PieceType>(['King', 'Queen']));
            const probs = calculateProbabilities(pool, 'p1');
            expect(probs.King).toBeCloseTo(0.5, 5);
            expect(probs.Queen).toBeCloseTo(0.5, 5);
            expect(probs.Rook).toBe(0);
            expect(probs.Pawn).toBe(0);
        });

        test('should return all zeros for unregistered piece', () => {
            const pool = new IdentityPool();
            const probs = calculateProbabilities(pool, 'nonexistent');
            expect(probs.King).toBe(0);
            expect(probs.Queen).toBe(0);
        });
    });

    describe('isTokenThreatened', () => {
        test('should detect threat from a piece that can reach the target', () => {
            const pool = new IdentityPool();
            const target = makeToken('w1', 'white', 4, 4);
            const enemy = makeToken('b1', 'black', 4, 7); // same row, 3 columns away
            pool.piecePossibilities.set('b1', new Set<PieceType>(['Rook']));
            pool.piecePossibilities.set('w1', new Set<PieceType>(['King']));
            const result = isTokenThreatened(target, [target, enemy], pool);
            expect(result).toBe(true);
        });

        test('should NOT detect threat when enemy cannot reach', () => {
            const pool = new IdentityPool();
            const target = makeToken('w1', 'white', 4, 4);
            const enemy = makeToken('b1', 'black', 5, 6); // not L-shape, not straight, not diagonal
            pool.piecePossibilities.set('b1', new Set<PieceType>(['Pawn']));
            pool.piecePossibilities.set('w1', new Set<PieceType>(['King']));
            const result = isTokenThreatened(target, [target, enemy], pool);
            expect(result).toBe(false);
        });

        test('should NOT detect threat from captured enemies', () => {
            const pool = new IdentityPool();
            const target = makeToken('w1', 'white', 4, 4);
            const enemy = makeToken('b1', 'black', 4, 7, { isCaptured: true });
            pool.piecePossibilities.set('b1', new Set<PieceType>(['Rook']));
            pool.piecePossibilities.set('w1', new Set<PieceType>(['King']));
            const result = isTokenThreatened(target, [target, enemy], pool);
            expect(result).toBe(false);
        });
    });

    describe('isPlayerInCheck', () => {
        test('should return true when the only King candidate is attacked', () => {
            const pool = new IdentityPool();
            const king = makeToken('w1', 'white', 4, 4);
            const attacker = makeToken('b1', 'black', 4, 7);
            pool.piecePossibilities.set('w1', new Set<PieceType>(['King']));
            pool.piecePossibilities.set('b1', new Set<PieceType>(['Rook']));
            const result = isPlayerInCheck('white', [king, attacker], pool);
            expect(result).toBe(true);
        });

        test('should return false when multiple King candidates exist (quantum uncertainty)', () => {
            const pool = new IdentityPool();
            const king1 = makeToken('w1', 'white', 4, 4);
            const king2 = makeToken('w2', 'white', 6, 6);
            const attacker = makeToken('b1', 'black', 4, 7);
            pool.piecePossibilities.set('w1', new Set<PieceType>(['King', 'Pawn']));
            pool.piecePossibilities.set('w2', new Set<PieceType>(['King', 'Rook']));
            pool.piecePossibilities.set('b1', new Set<PieceType>(['Rook']));
            const result = isPlayerInCheck('white', [king1, king2, attacker], pool);
            expect(result).toBe(false);
        });

        test('should return false when King candidate is NOT attacked', () => {
            const pool = new IdentityPool();
            const king = makeToken('w1', 'white', 0, 0);
            const attacker = makeToken('b1', 'black', 7, 7);
            pool.piecePossibilities.set('w1', new Set<PieceType>(['King']));
            pool.piecePossibilities.set('b1', new Set<PieceType>(['Knight'])); // Can't reach diagonally
            const result = isPlayerInCheck('white', [king, attacker], pool);
            expect(result).toBe(false);
        });
    });

    describe('checkGameOver', () => {
        test('should return null when both sides have King candidates', () => {
            const pool = new IdentityPool();
            pool.piecePossibilities.set('w1', new Set<PieceType>(['King']));
            pool.piecePossibilities.set('b1', new Set<PieceType>(['King']));
            const tokens = [
                makeToken('w1', 'white', 0, 0),
                makeToken('b1', 'black', 7, 7),
            ];
            expect(checkGameOver(tokens, pool)).toBeNull();
        });

        test('should return white_wins when black has no King candidates', () => {
            const pool = new IdentityPool();
            pool.piecePossibilities.set('w1', new Set<PieceType>(['King']));
            pool.piecePossibilities.set('b1', new Set<PieceType>(['Pawn'])); // no King
            const tokens = [
                makeToken('w1', 'white', 0, 0),
                makeToken('b1', 'black', 7, 7),
            ];
            expect(checkGameOver(tokens, pool)).toBe('white_wins');
        });

        test('should return black_wins when white has no King candidates', () => {
            const pool = new IdentityPool();
            pool.piecePossibilities.set('w1', new Set<PieceType>(['Pawn'])); // no King
            pool.piecePossibilities.set('b1', new Set<PieceType>(['King']));
            const tokens = [
                makeToken('w1', 'white', 0, 0),
                makeToken('b1', 'black', 7, 7),
            ];
            expect(checkGameOver(tokens, pool)).toBe('black_wins');
        });

        test('should NOT count captured pieces as having King possibility', () => {
            const pool = new IdentityPool();
            pool.piecePossibilities.set('w1', new Set<PieceType>(['King']));
            pool.piecePossibilities.set('b1', new Set<PieceType>(['King']));
            const tokens = [
                makeToken('w1', 'white', 0, 0),
                makeToken('b1', 'black', 7, 7, { isCaptured: true }),
            ];
            // Black's only King candidate is captured
            expect(checkGameOver(tokens, pool)).toBe('white_wins');
        });
    });

    describe('isCheckmate', () => {
        test('should return false when not in check', () => {
            const pool = new IdentityPool();
            const king = makeToken('w1', 'white', 0, 0);
            const enemy = makeToken('b1', 'black', 7, 7);
            pool.piecePossibilities.set('w1', new Set<PieceType>(['King']));
            pool.piecePossibilities.set('b1', new Set<PieceType>(['King']));
            expect(isCheckmate('white', [king, enemy], pool)).toBe(false);
        });

        test('should return true when in check with no escape (back rank mate)', () => {
            const pool = new IdentityPool();
            // White King on 7,0, blocked by own pawns on 6,0 6,1
            // Black Rook on 7,7 attacking along rank 7
            const king = makeToken('wk', 'white', 7, 0);
            const pawn1 = makeToken('wp1', 'white', 6, 0);
            const pawn2 = makeToken('wp2', 'white', 6, 1);
            const rook = makeToken('br', 'black', 7, 7);
            const bking = makeToken('bk', 'black', 0, 0);

            pool.piecePossibilities.set('wk', new Set<PieceType>(['King']));
            pool.piecePossibilities.set('wp1', new Set<PieceType>(['Pawn']));
            pool.piecePossibilities.set('wp2', new Set<PieceType>(['Pawn']));
            pool.piecePossibilities.set('br', new Set<PieceType>(['Rook']));
            pool.piecePossibilities.set('bk', new Set<PieceType>(['King']));

            const tokens = [king, pawn1, pawn2, rook, bking];
            
            // First confirm it's in check
            expect(isPlayerInCheck('white', tokens, pool)).toBe(true);
            // Then confirm it's checkmate
            expect(isCheckmate('white', tokens, pool)).toBe(true);
        });

        test('should return false when in check but can escape', () => {
            const pool = new IdentityPool();
            // White King on 4,4, attacked by black Rook on 4,7
            // King can escape to 3,3 (diagonal)
            const king = makeToken('wk', 'white', 4, 4);
            const rook = makeToken('br', 'black', 4, 7);
            const bking = makeToken('bk', 'black', 0, 0);

            pool.piecePossibilities.set('wk', new Set<PieceType>(['King']));
            pool.piecePossibilities.set('br', new Set<PieceType>(['Rook']));
            pool.piecePossibilities.set('bk', new Set<PieceType>(['King']));

            const tokens = [king, rook, bking];
            expect(isPlayerInCheck('white', tokens, pool)).toBe(true);
            expect(isCheckmate('white', tokens, pool)).toBe(false);
        });
    });
});
