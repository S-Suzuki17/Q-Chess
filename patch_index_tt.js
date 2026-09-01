const fs = require('fs');
let code = fs.readFileSync('src/quantum-engine/ai/index.ts', 'utf8');
if (!code.includes('./tt')) {
    code += "export * from './tt';\n";
    fs.writeFileSync('src/quantum-engine/ai/index.ts', code, 'utf8');
}
