const fs = require('fs');
let code = fs.readFileSync('src/quantum-engine/ai/__tests__/mcts.test.ts', 'utf8');
code = code.replace(/state\.mockMoves/g, "(state as any).mockMoves");
code = code.replace(/state\.id/g, "(state as any).id");
fs.writeFileSync('src/quantum-engine/ai/__tests__/mcts.test.ts', code, 'utf8');
