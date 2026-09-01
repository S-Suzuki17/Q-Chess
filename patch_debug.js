const fs = require('fs');
let code = fs.readFileSync('src/quantum-engine/__tests__/fidelity.test.ts', 'utf8');

code = code.replace(
    'const nextState = applyMove(state, { pieceId: \'w1\', target: { row: 4, col: 3 } });',
    'const moves = generateLegalMoves(state, \'w1\'); console.log("Legal moves:", moves.find(m => m.target.row === 4 && m.target.col === 3)); const nextState = applyMove(state, { pieceId: \'w1\', target: { row: 4, col: 3 } });'
);

fs.writeFileSync('src/quantum-engine/__tests__/fidelity.test.ts', code, 'utf8');
