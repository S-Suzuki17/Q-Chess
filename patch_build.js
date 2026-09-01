const fs = require('fs');

// 1. Export PieceType from IdentityPool
let poolCode = fs.readFileSync('src/lib/IdentityPool.ts', 'utf8');
poolCode = poolCode.replace('type PieceType = ', 'export type PieceType = ');
fs.writeFileSync('src/lib/IdentityPool.ts', poolCode, 'utf8');

// 2. Fix comparison.test.ts probabilities and readonly pieces
let compCode = fs.readFileSync('src/quantum-engine/__tests__/comparison.test.ts', 'utf8');
compCode = compCode.replace(/probabilities: \{\}/g, 'probabilities: {} as any');
compCode = compCode.replace(/state\.pieces = \[/g, 'state = { ...state, pieces: [');
compCode = compCode.replace(/\];/g, '] };');
fs.writeFileSync('src/quantum-engine/__tests__/comparison.test.ts', compCode, 'utf8');

// 3. Fix completeness.test.ts readonly pieces
let complCode = fs.readFileSync('src/quantum-engine/__tests__/completeness.test.ts', 'utf8');
complCode = complCode.replace(/state\.pieces = state\.pieces\.filter/g, 'state = { ...state, pieces: state.pieces.filter');
fs.writeFileSync('src/quantum-engine/__tests__/completeness.test.ts', complCode, 'utf8');

// 4. Fix fidelity.test.ts hasMoved
let fidCode = fs.readFileSync('src/quantum-engine/__tests__/fidelity.test.ts', 'utf8');
fidCode = fidCode.replace(/alive: p.alive !== undefined \? p.alive : true\n    }\)\);/g, 'alive: p.alive !== undefined ? p.alive : true,\n        hasMoved: false\n    }));');
fidCode = fidCode.replace(/alive: true \}/g, 'alive: true, hasMoved: false }');
fs.writeFileSync('src/quantum-engine/__tests__/fidelity.test.ts', fidCode, 'utf8');

// 5. Fix terminal.ts imports
let termCode = fs.readFileSync('src/quantum-engine/terminal.ts', 'utf8');
termCode = termCode.replace(/import { PIECE_KING } from '.\/constants';/g, "import { PIECE_KING, PIECE_PAWN, PIECE_QUEEN, PlayerColor } from './constants';");
termCode = termCode.replace(/import { GameState, Move, PlayerColor } from '.\/types';/g, "import { GameState, Move } from './types';");
fs.writeFileSync('src/quantum-engine/terminal.ts', termCode, 'utf8');

