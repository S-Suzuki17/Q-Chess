const fs = require('fs');
let code = fs.readFileSync('src/quantum-engine/terminal.ts', 'utf8');
code = code.replace("import { GameState, PlayerColor } from './types';", "import { GameState } from './types';\nimport { PlayerColor } from './constants';");
fs.writeFileSync('src/quantum-engine/terminal.ts', code, 'utf8');
