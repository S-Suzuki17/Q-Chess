const fs = require('fs');
let code = fs.readFileSync('src/quantum-engine/types.ts', 'utf8');

code = code.replace(
    'readonly promoted: boolean;',
    'readonly promoted: boolean;\n    readonly promotedType?: number;'
);

fs.writeFileSync('src/quantum-engine/types.ts', code, 'utf8');
