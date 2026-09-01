const fs = require('fs');
let code = fs.readFileSync('src/quantum-engine/moveGenerator.ts', 'utf8');

code = code.replace(
    '// Filter out types that the piece does not have\n            requiredTypes = requiredTypes & piece.state;',
    '// Filter out types that the piece does not have\n            if (piece.promotedType) {\n                requiredTypes = requiredTypes & piece.promotedType;\n            } else {\n                requiredTypes = requiredTypes & piece.state;\n            }'
);

fs.writeFileSync('src/quantum-engine/moveGenerator.ts', code, 'utf8');
