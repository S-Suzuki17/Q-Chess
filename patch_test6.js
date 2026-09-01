const fs = require('fs');
let code = fs.readFileSync('src/quantum-engine/__tests__/fidelity.test.ts', 'utf8');

code = code.replace(
    `const state1 = createCustomState([
            { id: 'w1', owner: 'white', position: { row: 4, col: 4 }, state: ALL_PIECE_TYPES }, // Only 1 potential king
            { id: 'bR', owner: 'black', position: { row: 4, col: 0 }, state: PIECE_ROOK } // Attacking w1
        ]);
        
        // Since wK is auto-added, we have 2 kings! So it's NOT in check.
        expect(isPlayerInCheck('white', state1)).toBe(false);
        
        // Let's remove the auto-added wK so w1 is the ONLY potential king.
        const singleKingState = { ...state1, pieces: state1.pieces.filter(p => p.id !== 'wK') };
        expect(isPlayerInCheck('white', singleKingState)).toBe(true);`,
    `const state1 = createCustomState([
            { id: 'w1', owner: 'white', position: { row: 4, col: 4 }, state: ALL_PIECE_TYPES },
            { id: 'w2', owner: 'white', position: { row: 7, col: 4 }, state: ALL_PIECE_TYPES },
            { id: 'bR', owner: 'black', position: { row: 4, col: 0 }, state: PIECE_ROOK }
        ]);
        
        // We have 2 potential kings (w1 and w2). So it's NOT in check even though w1 is attacked.
        expect(isPlayerInCheck('white', state1)).toBe(false);
        
        // Let's remove w2 so w1 is the ONLY potential king.
        const singleKingState = { ...state1, pieces: state1.pieces.filter(p => p.id !== 'w2') };
        expect(isPlayerInCheck('white', singleKingState)).toBe(true);`
);

fs.writeFileSync('src/quantum-engine/__tests__/fidelity.test.ts', code, 'utf8');
