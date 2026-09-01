const fs = require('fs');

let arena = fs.readFileSync('src/quantum-engine/ai/arena.ts', 'utf8');
arena = arena.replace(/import \{ GameState, Move, PlayerColor \} from '\.\.\/types';/, "import { GameState, Move } from '../types';\nimport { PlayerColor } from '../constants';");
arena = arena.replace(/ttHits/g, "ttStats");
arena = arena.replace(/stats: \{ move, iterations: 1, nodes: 1, timeMs: performance\.now\(\) - start, nodesPerSec: 0, maxDepth: 1, ttStats: 0 \}/, "stats: { move, iterations: 1, nodes: 1, timeMs: performance.now() - start, nodesPerSec: 0, maxDepth: 1, ttStats: {lookupCount:0, hitCount:0, missCount:0, hitRate:0, tableSize:0} }");
fs.writeFileSync('src/quantum-engine/ai/arena.ts', arena, 'utf8');

let evalTs = fs.readFileSync('src/quantum-engine/ai/eval.ts', 'utf8');
evalTs = evalTs.replace(/import \{ GameState, PlayerColor, QuantumPiece \} from '\.\.\/types';/, "import { GameState, QuantumPiece } from '../types';\nimport { PlayerColor } from '../constants';");
fs.writeFileSync('src/quantum-engine/ai/eval.ts', evalTs, 'utf8');

let evalV2 = fs.readFileSync('src/quantum-engine/ai/evalV2.ts', 'utf8');
evalV2 = evalV2.replace(/import \{ GameState, PlayerColor, QuantumPiece \} from '\.\.\/types';/, "import { GameState, QuantumPiece } from '../types';\nimport { PlayerColor } from '../constants';");
fs.writeFileSync('src/quantum-engine/ai/evalV2.ts', evalV2, 'utf8');

let mcts = fs.readFileSync('src/quantum-engine/ai/mcts.ts', 'utf8');
mcts = mcts.replace(/import \{ GameState, Move, PlayerColor \} from '\.\.\/types';/, "import { GameState, Move } from '../types';\nimport { PlayerColor } from '../constants';");
fs.writeFileSync('src/quantum-engine/ai/mcts.ts', mcts, 'utf8');
