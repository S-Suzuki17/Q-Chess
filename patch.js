const fs = require('fs');
let code = fs.readFileSync('src/quantum-engine/adapter.ts', 'utf8');
code = code.replace("import { generateLegalMoves } from './moveGenerator';\r\nimport { posEquals } from './board';\r\nimport { hasType } from './quantum/quantumState';\r\n\r\n", "");
code = "import { generateLegalMoves } from './moveGenerator';\r\nimport { posEquals } from './board';\r\nimport { hasType } from './quantum/quantumState';\r\n" + code;
fs.writeFileSync('src/quantum-engine/adapter.ts', code, 'utf8');
