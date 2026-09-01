import { GameState, QuantumPiece } from './types';
import { ALL_PIECE_TYPES } from './constants';

export function createInitialState(): GameState {
    const pieces: QuantumPiece[] = [];
    
    let idCounter = 1;

    // Black pieces (row 0, 1)
    for (let r = 0; r < 2; r++) {
        for (let c = 0; c < 8; c++) {
            pieces.push({
                id: `b_${idCounter++}`,
                owner: 'black',
                origin: { row: r, col: c },
                position: { row: r, col: c },
                state: ALL_PIECE_TYPES,
                promoted: false, alive: true, hasMoved: false
            });
        }
    }

    // White pieces (row 6, 7)
    for (let r = 6; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            pieces.push({
                id: `w_${idCounter++}`,
                owner: 'white',
                origin: { row: r, col: c },
                position: { row: r, col: c },
                state: ALL_PIECE_TYPES,
                promoted: false, alive: true, hasMoved: false
            });
        }
    }

    return {
        pieces,
        sideToMove: 'white',
        ply: 0,
        captured: { white: 0, black: 0 },
        hash: '', 
        winner: null
    };
}
