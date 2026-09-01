const fs = require('fs');
let code = fs.readFileSync('src/quantum-engine/types.ts', 'utf8');

code = code.replace(
    'readonly promotedType?: number;',
    'readonly promotedType?: number;\n    readonly hasMoved: boolean;'
);

fs.writeFileSync('src/quantum-engine/types.ts', code, 'utf8');
