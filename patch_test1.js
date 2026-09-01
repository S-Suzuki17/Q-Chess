const fs = require('fs');
let code = fs.readFileSync('src/quantum-engine/__tests__/fidelity.test.ts', 'utf8');

code = code.replace(
    `const state = createCustomState([
            { id: 'w1', position: { row: 5, col: 2 } }
        ]);`,
    `const state = createCustomState([
            { id: 'w1', position: { row: 5, col: 2 } },
            { id: 'wK', owner: 'white', position: { row: 7, col: 4 }, state: PIECE_KING },
            { id: 'bK', owner: 'black', position: { row: 0, col: 4 }, state: PIECE_KING }
        ]);`
);

code = code.replace(
    `const state = createCustomState([
            { id: 'w1', position: { row: 5, col: 2 } }
        ]);`,
    `const state = createCustomState([
            { id: 'w1', position: { row: 5, col: 2 } },
            { id: 'wK', owner: 'white', position: { row: 7, col: 4 }, state: PIECE_KING },
            { id: 'bK', owner: 'black', position: { row: 0, col: 4 }, state: PIECE_KING }
        ]);`
);

fs.writeFileSync('src/quantum-engine/__tests__/fidelity.test.ts', code, 'utf8');
