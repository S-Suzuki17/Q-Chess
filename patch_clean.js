const fs = require('fs');

let compCode = fs.readFileSync('src/quantum-engine/__tests__/comparison.test.ts', 'utf8');
compCode = compCode.replace('const state = createInitialState();', 'let state = createInitialState();');
compCode = compCode.replace('state.pieces = [', 'state = { ...state, pieces: [');
compCode = compCode.replace('];\n\n        // Quantum Move', '] };\n\n        // Quantum Move');
fs.writeFileSync('src/quantum-engine/__tests__/comparison.test.ts', compCode, 'utf8');

let complCode = fs.readFileSync('src/quantum-engine/__tests__/completeness.test.ts', 'utf8');
complCode = complCode.replace(/state\.pieces = state\.pieces\.filter\((.*?)\);/g, 'state = { ...state, pieces: state.pieces.filter($1) };');
// also change const to let in completeness
complCode = complCode.replace(/const state = createCustomState/g, 'let state = createCustomState');
fs.writeFileSync('src/quantum-engine/__tests__/completeness.test.ts', complCode, 'utf8');

