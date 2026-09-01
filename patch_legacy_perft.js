const fs = require('fs');
let code = fs.readFileSync('run_legacy_perft.ts', 'utf8');

code = code.replace(/probabilities: \{\}/g, 'probabilities: {} as any');

fs.writeFileSync('run_legacy_perft.ts', code, 'utf8');
