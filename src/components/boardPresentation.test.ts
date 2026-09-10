import { describe, expect, it } from 'vitest';
import { BOARD_HEIGHTS, PIECE_HEIGHTS, PIECE_MAX_WIDTH, quantumCandidateSize, boardCamera, hintArrowPoints, isValidHintMove, squareName } from './boardPresentation';
import { createLocalPosition } from '../lib/localGame';
import { legacyToQuantumState, quantumToLegacyMove } from '../quantum-engine/adapter';

describe('Readable 3D board and hint coordinates', () => {
    it('keeps all remaining candidates equally readable without spilling into the next square', () => {
        for (const count of [2,3,4,5,6]) {
            const {scale, radius} = quantumCandidateSize(count);
            expect(scale).toBeGreaterThan(.37);
            expect(radius * 2 + scale * PIECE_MAX_WIDTH).toBeLessThan(1);
        }
        expect(PIECE_MAX_WIDTH).toBeGreaterThan(.9);
        expect(PIECE_MAX_WIDTH).toBeLessThan(1);
        expect(Math.min(...Object.values(PIECE_HEIGHTS))).toBeGreaterThanOrEqual(1.2);
    });
    it('keeps the stage below the entire board, not coplanar with the squares', () => {
        expect(BOARD_HEIGHTS.stage).toBeLessThan(BOARD_HEIGHTS.baseBottom);
        expect(BOARD_HEIGHTS.rimTop).toBeLessThan(BOARD_HEIGHTS.squareTop);
        expect(BOARD_HEIGHTS.overlay).toBeGreaterThan(BOARD_HEIGHTS.squareTop);
    });
    it.each([[970,644],[358,358],[320,320],[600,300]])('fits all files and ranks at %i × %i', (width,height) => {
        const view=boardCamera(width,height);
        expect(view.zoom * 8.85).toBeLessThan(width);
        expect(view.zoom * 8.85).toBeLessThan(height);
        expect(boardCamera(width,height,true).position[2]).toBe(-view.position[2]);
    });
    it('uses targetRow/targetCol from the actual search adapter', () => {
        const {tokens,pool}=createLocalPosition();
        const source=tokens.find(token=>token.player==='white' && token.row===6 && token.col===4)!;
        const state=legacyToQuantumState(tokens,pool,'white',0,null);
        const legacy=quantumToLegacyMove({pieceId:source.id,target:{row:4,col:4}},state);
        const hint={fromRow:source.row,fromCol:source.col,toRow:legacy.targetRow,toCol:legacy.targetCol};
        expect(isValidHintMove(hint)).toBe(true);
        expect(squareName(hint.fromRow,hint.fromCol)).toBe('e2');
        expect(squareName(hint.toRow,hint.toCol)).toBe('e4');
        expect(hintArrowPoints(hint)).toHaveLength(7);
    });
    it.each([[6,4,4,4],[7,1,5,2],[0,4,2,4],[3,3,4,4]])('draws an arrow to the target for %j,%j → %j,%j', (fromRow,fromCol,toRow,toCol) => {
        const points=hintArrowPoints({fromRow,fromCol,toRow,toCol});
        expect(points.every(point=>point.every(Number.isFinite))).toBe(true);
        const tip=points[3];
        expect(Math.hypot(tip[0]-(toCol+.5),tip[1]-(toRow+.5))).toBeCloseTo(.08);
    });
    it('rejects missing, off-board and zero-length destinations', () => {
        for (const toRow of [undefined,NaN,8,-1,1.5,6]) {
            const hint={fromRow:6,fromCol:4,toRow:toRow as number,toCol:4};
            expect(isValidHintMove(hint)).toBe(false);
            expect(hintArrowPoints(hint)).toEqual([]);
        }
    });
});
