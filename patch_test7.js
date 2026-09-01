const fs = require('fs');
let code = fs.readFileSync('src/quantum-engine/__tests__/fidelity.test.ts', 'utf8');

code += `
    it('7. Checkmate test', () => {
        // Construct a classic Fool's Mate scenario
        // White King is trapped. Black Queen attacks it.
        // We will make sure there is ONLY ONE white king candidate, 
        // and no white piece can block or capture.
        const state = createCustomState([
            { id: 'wK', owner: 'white', position: { row: 0, col: 4 }, state: PIECE_KING },
            { id: 'bQ', owner: 'black', position: { row: 0, col: 7 }, state: PIECE_QUEEN }, // Attacks wK
            // Add a blocker that can't actually move
            { id: 'wP', owner: 'white', position: { row: 1, col: 4 }, state: PIECE_PAWN }
        ]);
        
        // Remove bK to avoid interference if any, but let's keep bK for existence
        // createCustomState auto-adds bK at 0,4, but we manually placed wK at 0,4.
        // Let's place pieces explicitly.
        const cleanState = createCustomState([
            { id: 'wK', owner: 'white', position: { row: 7, col: 4 }, state: PIECE_KING },
            { id: 'bQ', owner: 'black', position: { row: 7, col: 7 }, state: PIECE_QUEEN }, // Attacks wK horizontally
            { id: 'bK', owner: 'black', position: { row: 0, col: 4 }, state: PIECE_KING },
            // White pawns blocking the king from moving forward
            { id: 'wP1', owner: 'white', position: { row: 6, col: 3 }, state: PIECE_PAWN },
            { id: 'wP2', owner: 'white', position: { row: 6, col: 4 }, state: PIECE_PAWN },
            { id: 'wP3', owner: 'white', position: { row: 6, col: 5 }, state: PIECE_PAWN },
        ]);
        
        // The White King is at 7,4. Black Queen at 7,7 attacks it.
        // King can move to 7,3 or 7,5 (if empty), but wait, Black Queen controls the entire 7th row!
        // So King cannot move to 7,3 or 7,5 because it would still be in check.
        // Can any pawn capture the Queen? No.
        // So this is Checkmate!
        expect(isPlayerInCheck('white', cleanState)).toBe(true);
        expect(isCheckmate('white', cleanState)).toBe(true);
    });
`;

fs.writeFileSync('src/quantum-engine/__tests__/fidelity.test.ts', code, 'utf8');
