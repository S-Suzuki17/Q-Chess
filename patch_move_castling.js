const fs = require('fs');
let code = fs.readFileSync('src/quantum-engine/move.ts', 'utf8');

code = code.replace(
    'if (absDr === 0 && absDc === 2 && !hasMoved && start.row === startRow) {',
    'const kingStartRow = color === \'white\' ? 7 : 0;\n    if (absDr === 0 && absDc === 2 && !hasMoved && start.row === kingStartRow) {'
);

fs.writeFileSync('src/quantum-engine/move.ts', code, 'utf8');
