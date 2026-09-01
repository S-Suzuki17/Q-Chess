const fs = require('fs');
let code = fs.readFileSync('src/quantum-engine/types.ts', 'utf8');

code = code.replace(
    'winner: PlayerColor | \'draw\' | null;',
    'winner: PlayerColor | \'draw\' | null;\n    readonly lastMove?: Move;'
);

fs.writeFileSync('src/quantum-engine/types.ts', code, 'utf8');
