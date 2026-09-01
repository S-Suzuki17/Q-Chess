const fs = require('fs');
let code = fs.readFileSync('src/quantum-engine/ai/index.ts', 'utf8');
code += "\nexport * from './eval';\nexport * from './mcts';\n";
fs.writeFileSync('src/quantum-engine/ai/index.ts', code, 'utf8');
