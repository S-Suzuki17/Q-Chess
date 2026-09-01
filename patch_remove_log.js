const fs = require('fs');
let code = fs.readFileSync('src/quantum-engine/quantum/candidateSolver.ts', 'utf8');

code = code.replace(
    /console\.log\("Removing".*?;\s*/g,
    ''
);

fs.writeFileSync('src/quantum-engine/quantum/candidateSolver.ts', code, 'utf8');
