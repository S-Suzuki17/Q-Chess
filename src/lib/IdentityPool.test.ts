import { describe, test, expect, beforeEach } from 'vitest';
import { IdentityPool } from './IdentityPool';
import { Token } from './GameEngine';
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

describe('IdentityPool', () => {
    let pool: IdentityPool;

    beforeEach(() => {
        pool = new IdentityPool();
    });

    describe('registerPiece', () => {
        test('should register a piece with all 6 types as possibilities', () => {
            pool.registerPiece('p1');
            const poss = pool.piecePossibilities.get('p1');
            expect(poss).toBeDefined();
            expect(poss!.size).toBe(6);
            expect(poss!.has('King')).toBe(true);
            expect(poss!.has('Queen')).toBe(true);
            expect(poss!.has('Rook')).toBe(true);
            expect(poss!.has('Bishop')).toBe(true);
            expect(poss!.has('Knight')).toBe(true);
            expect(poss!.has('Pawn')).toBe(true);
        });
    });

    describe('restrictIdentity', () => {
        test('should restrict to only the allowed types', () => {
            pool.registerPiece('p1');
            pool.restrictIdentity('p1', ['King', 'Queen']);
            const poss = pool.piecePossibilities.get('p1');
            expect(poss!.size).toBe(2);
            expect(poss!.has('King')).toBe(true);
            expect(poss!.has('Queen')).toBe(true);
            expect(poss!.has('Rook')).toBe(false);
        });

        test('should return true when something changed', () => {
            pool.registerPiece('p1');
            const changed = pool.restrictIdentity('p1', ['King']);
            expect(changed).toBe(true);
        });

        test('should return false when nothing changed', () => {
            pool.registerPiece('p1');
            pool.restrictIdentity('p1', ['King']);
            const changed = pool.restrictIdentity('p1', ['King']);
            expect(changed).toBe(false);
        });

        test('should return false for unregistered piece', () => {
            const result = pool.restrictIdentity('nonexistent', ['King']);
            expect(result).toBe(false);
        });
    });

    describe('clone', () => {
        test('should create a deep copy that does not affect the original', () => {
            pool.registerPiece('p1');
            pool.registerPiece('p2');
            const cloned = pool.clone();

            // Modify clone
            cloned.restrictIdentity('p1', ['King']);

            // Original should still have all 6
            expect(pool.piecePossibilities.get('p1')!.size).toBe(6);
            expect(cloned.piecePossibilities.get('p1')!.size).toBe(1);
        });
    });

    describe('resolveGlobalConstraints', () => {
        test('should return true for a valid 16-piece initial state', () => {
            // Simulate 16 tokens for white: 1 King, 1 Queen, 2 Rooks, 2 Bishops, 2 Knights, 8 Pawns
            const tokens: Token[] = [];
            for (let i = 0; i < 16; i++) {
                const id = `w${i}`;
                pool.registerPiece(id);
                tokens.push(makeToken(id, 'white', Math.floor(i / 8), i % 8));
            }
            // Also need black tokens for the King check
            for (let i = 0; i < 16; i++) {
                const id = `b${i}`;
                pool.registerPiece(id);
                tokens.push(makeToken(id, 'black', 6 + Math.floor(i / 8), i % 8));
            }
            const result = pool.resolveGlobalConstraints(tokens);
            expect(result).toBe(true);
        });

        test('should detect contradiction when too many pieces are forced into same type', () => {
            // 2 white tokens both forced to be King (only 1 King allowed)
            pool.piecePossibilities.set('w1', new Set<PieceType>(['King']));
            pool.piecePossibilities.set('w2', new Set<PieceType>(['King']));
            // Need at least one token each side with King possibility for the King check
            pool.piecePossibilities.set('b1', new Set<PieceType>(['King', 'Queen', 'Rook', 'Bishop', 'Knight', 'Pawn']));

            const tokens: Token[] = [
                makeToken('w1', 'white', 0, 0),
                makeToken('w2', 'white', 0, 1),
                makeToken('b1', 'black', 7, 0),
            ];
            const result = pool.resolveGlobalConstraints(tokens);
            expect(result).toBe(false);
        });

        test('should propagate constraints: if only 1 piece can be King, others cannot', () => {
            // 3 white pieces: one is forced to be King, other two should lose King possibility
            pool.piecePossibilities.set('w1', new Set<PieceType>(['King']));
            pool.piecePossibilities.set('w2', new Set<PieceType>(['King', 'Pawn']));
            pool.piecePossibilities.set('w3', new Set<PieceType>(['King', 'Bishop']));
            pool.piecePossibilities.set('b1', new Set<PieceType>(['King', 'Queen', 'Rook', 'Bishop', 'Knight', 'Pawn']));

            const tokens: Token[] = [
                makeToken('w1', 'white', 0, 0),
                makeToken('w2', 'white', 0, 1),
                makeToken('w3', 'white', 0, 2),
                makeToken('b1', 'black', 7, 0),
            ];

            pool.resolveGlobalConstraints(tokens);

            // w1 is already {King}, so w2 and w3 should lose King
            expect(pool.piecePossibilities.get('w2')!.has('King')).toBe(false);
            expect(pool.piecePossibilities.get('w3')!.has('King')).toBe(false);
            expect(pool.piecePossibilities.get('w2')!.has('Pawn')).toBe(true);
            expect(pool.piecePossibilities.get('w3')!.has('Bishop')).toBe(true);
        });

        test('should return false when no piece can be King', () => {
            pool.piecePossibilities.set('w1', new Set<PieceType>(['Pawn']));
            pool.piecePossibilities.set('b1', new Set<PieceType>(['King', 'Pawn']));

            const tokens: Token[] = [
                makeToken('w1', 'white', 0, 0),
                makeToken('b1', 'black', 7, 0),
            ];
            const result = pool.resolveGlobalConstraints(tokens);
            expect(result).toBe(false);
        });
    });

    describe('sampleDeterminization', () => {
        test('should return a valid assignment for simple case', () => {
            pool.piecePossibilities.set('w1', new Set<PieceType>(['King']));
            pool.piecePossibilities.set('w2', new Set<PieceType>(['Pawn']));
            pool.piecePossibilities.set('b1', new Set<PieceType>(['King']));
            pool.piecePossibilities.set('b2', new Set<PieceType>(['Pawn']));

            const tokens: Token[] = [
                makeToken('w1', 'white', 0, 0),
                makeToken('w2', 'white', 1, 0),
                makeToken('b1', 'black', 7, 0),
                makeToken('b2', 'black', 6, 0),
            ];

            const result = pool.sampleDeterminization(tokens);
            expect(result).not.toBeNull();
            expect(result!['w1']).toBe('King');
            expect(result!['w2']).toBe('Pawn');
            expect(result!['b1']).toBe('King');
            expect(result!['b2']).toBe('Pawn');
        });

        test('should return null when assignment is impossible', () => {
            // Two tokens both must be King, but only 1 King allowed
            pool.piecePossibilities.set('w1', new Set<PieceType>(['King']));
            pool.piecePossibilities.set('w2', new Set<PieceType>(['King']));

            const tokens: Token[] = [
                makeToken('w1', 'white', 0, 0),
                makeToken('w2', 'white', 0, 1),
            ];

            const result = pool.sampleDeterminization(tokens);
            expect(result).toBeNull();
        });

        test('should respect maxPieces constraints', () => {
            // 3 pieces that could be Rook, but only 2 Rooks allowed
            pool.piecePossibilities.set('w1', new Set<PieceType>(['Rook']));
            pool.piecePossibilities.set('w2', new Set<PieceType>(['Rook']));
            pool.piecePossibilities.set('w3', new Set<PieceType>(['Rook']));

            const tokens: Token[] = [
                makeToken('w1', 'white', 0, 0),
                makeToken('w2', 'white', 0, 1),
                makeToken('w3', 'white', 0, 2),
            ];

            const result = pool.sampleDeterminization(tokens);
            expect(result).toBeNull();
        });
    });
});
