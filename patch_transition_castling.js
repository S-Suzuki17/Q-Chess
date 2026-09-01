const fs = require('fs');
let code = fs.readFileSync('src/quantum-engine/stateTransition.ts', 'utf8');

code = code.replace(
    'movingPiece.position = move.target;',
    'movingPiece.position = move.target;\n    movingPiece.hasMoved = true;'
);

fs.writeFileSync('src/quantum-engine/stateTransition.ts', code, 'utf8');
