const fs = require('fs');
let code = fs.readFileSync('src/quantum-engine/__tests__/perft.test.ts', 'utf8');
code = code.replace('perft(state, 1);', 'perft(state, 2);');
code = code.replace('Depth 1', 'Depth 2');
fs.writeFileSync('src/quantum-engine/__tests__/perft.test.ts', code, 'utf8');
