const fs = require('fs');
let code = fs.readFileSync('src/quantum-engine/ai/arena.ts', 'utf8');
code = code.replace(/tt \+= s\.ttStats;/g, "tt += s.ttStats.hitCount;");
fs.writeFileSync('src/quantum-engine/ai/arena.ts', code, 'utf8');
