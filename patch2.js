const fs = require('fs');
let code = fs.readFileSync('src/quantum-engine/adapter.ts', 'utf8');
const lines = code.split('\n');
const newLines = lines.filter((line, index) => {
    if (index >= 80 && line.startsWith('import {')) return false;
    return true;
});
fs.writeFileSync('src/quantum-engine/adapter.ts', newLines.join('\n'), 'utf8');
