const fs = require('fs');
let code = fs.readFileSync('src/quantum-engine/initialState.ts', 'utf8');

code = code.replace(
    /promoted: false,\s*alive: true/g,
    'promoted: false, alive: true, hasMoved: false'
);

fs.writeFileSync('src/quantum-engine/initialState.ts', code, 'utf8');
