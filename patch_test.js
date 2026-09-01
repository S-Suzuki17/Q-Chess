const fs = require('fs');
let code = fs.readFileSync('src/quantum-engine/ai/__tests__/mcts.test.ts', 'utf8');
code = code.replace(/vi\.mock\('\.\.\/\.\.\/random'/g, "vi.mock('../random'");
fs.writeFileSync('src/quantum-engine/ai/__tests__/mcts.test.ts', code, 'utf8');
