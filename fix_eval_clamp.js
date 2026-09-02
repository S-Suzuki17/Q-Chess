const fs = require('fs');
let code = fs.readFileSync('src/quantum-engine/ai/evalV3.ts', 'utf8');
code = code.replace('return value;', 'return Math.max(0.1, value);');
fs.writeFileSync('src/quantum-engine/ai/evalV3.ts', code, 'utf8');
