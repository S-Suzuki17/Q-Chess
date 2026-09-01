const fs = require('fs');
let code = fs.readFileSync('src/quantum-engine/quantum/candidateSolver.ts', 'utf8');

code = code.replace(
    `p.state = p.state & ~subsetMask;
                                changed = true;`,
    `console.log("Removing", subsetMask, "from", p.id, "reqCount:", reqCount, "piecesInSubset:", piecesInSubset.map(x=>x.id));
                                p.state = p.state & ~subsetMask;
                                changed = true;`
);

fs.writeFileSync('src/quantum-engine/quantum/candidateSolver.ts', code, 'utf8');
