const fs = require('fs');
let code = fs.readFileSync('run_quick.js', 'utf8');
code = code.replace(/const \{ EvalV0, EvalV1 \} = require\('\.\/dist\/src\/quantum-engine\/ai\/index'\);/, "const { EvalV0, EvalV1 } = require('./dist/src/quantum-engine/ai/eval');");
fs.writeFileSync('run_quick.js', code, 'utf8');
