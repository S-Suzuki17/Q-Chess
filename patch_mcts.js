const fs = require('fs');
let code = fs.readFileSync('src/quantum-engine/ai/mcts.ts', 'utf8');
code = code.replace(/import \{ GameState, Move, PlayerColor \} from '\.\.\/types';/, "import { GameState, Move } from '../types';\nimport { PlayerColor } from '../constants';");
fs.writeFileSync('src/quantum-engine/ai/mcts.ts', code, 'utf8');
