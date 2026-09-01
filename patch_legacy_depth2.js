const fs = require('fs');
let code = fs.readFileSync('src/quantum-engine/__tests__/legacyPerft.test.ts', 'utf8');

code = code.replace(
    'legacyPerft(tokens, pool, sideToMove, 1);',
    'legacyPerft(tokens, pool, sideToMove, 2);'
);
code = code.replace(
    'Depth 1 Nodes:',
    'Depth 2 Nodes:'
);

fs.writeFileSync('src/quantum-engine/__tests__/legacyPerft.test.ts', code, 'utf8');
