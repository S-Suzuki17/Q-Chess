const fs = require('fs');
let code = fs.readFileSync('src/quantum-engine/terminal.ts', 'utf8');
code = code.replace(/import \{ GameState, PlayerColor, QuantumPiece \} from '\.\/types';/, "import { GameState, QuantumPiece } from './types';");
fs.writeFileSync('src/quantum-engine/terminal.ts', code, 'utf8');
