const fs = require('fs');

// Fix AIEngine.ts import
let aiCode = fs.readFileSync('src/lib/AIEngine.ts', 'utf8');
aiCode = aiCode.replace(/import \{ IdentityPool, PieceType \} from '\.\/IdentityPool';/, "import { IdentityPool } from './IdentityPool';\nimport { PieceType } from '../config/gameConfig';");
fs.writeFileSync('src/lib/AIEngine.ts', aiCode, 'utf8');

// Fix comparison.test.ts import
let compCode = fs.readFileSync('src/quantum-engine/__tests__/comparison.test.ts', 'utf8');
compCode = compCode.replace(/import \{ IdentityPool, PieceType \} from '\.\.\/\.\.\/lib\/IdentityPool';/, "import { IdentityPool } from '../../lib/IdentityPool';\nimport { PieceType } from '../../config/gameConfig';");
fs.writeFileSync('src/quantum-engine/__tests__/comparison.test.ts', compCode, 'utf8');

// Fix adapter.ts import
let adCode = fs.readFileSync('src/quantum-engine/adapter.ts', 'utf8');
adCode = adCode.replace(/import \{ IdentityPool, PieceType \} from '\.\.\/lib\/IdentityPool';/, "import { IdentityPool } from '../lib/IdentityPool';\nimport { PieceType } from '../config/gameConfig';");
fs.writeFileSync('src/quantum-engine/adapter.ts', adCode, 'utf8');

// Fix terminal.ts duplicate PlayerColor
let termCode = fs.readFileSync('src/quantum-engine/terminal.ts', 'utf8');
termCode = termCode.replace(/import \{ GameState, Move \} from '.\/types';\nimport \{ PIECE_KING, PIECE_PAWN, PIECE_QUEEN, PlayerColor \} from '.\/constants';/, "import { GameState, Move } from './types';\nimport { PIECE_KING, PIECE_PAWN, PIECE_QUEEN, PlayerColor } from './constants';");
// Wait, I might have messed up the regex. I will just do exact replacements:
termCode = termCode.replace(/import \{ GameState, Move, PlayerColor \} from '\.\/types';/, "import { GameState, Move } from './types';");
fs.writeFileSync('src/quantum-engine/terminal.ts', termCode, 'utf8');
