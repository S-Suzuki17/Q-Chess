const fs = require('fs');
let code = fs.readFileSync('src/quantum-engine/ai/__tests__/arena.test.ts', 'utf8');
code = code.replace(/'\.\/arena'/, "'../arena'");
fs.writeFileSync('src/quantum-engine/ai/__tests__/arena.test.ts', code, 'utf8');
