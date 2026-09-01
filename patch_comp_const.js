const fs = require('fs');
let code = fs.readFileSync('src/quantum-engine/__tests__/comparison.test.ts', 'utf8');

code = code.replace(
    'const state = createInitialState();',
    'let state = createInitialState();'
);

fs.writeFileSync('src/quantum-engine/__tests__/comparison.test.ts', code, 'utf8');
