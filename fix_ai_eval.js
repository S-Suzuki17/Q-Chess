const fs = require('fs');

let code = fs.readFileSync('src/lib/AIEngine.ts', 'utf8');
code = code.replace(/import \{ getRandomMove, getGreedyMove, MCTSEngine, EvalV0 \} from '\.\.\/quantum-engine\/ai';/, "import { getRandomMove, getGreedyMove, MCTSEngine, EvalV3 } from '../quantum-engine/ai';");
code = code.replace(/const evaluator = new EvalV0\(\);/, "const evaluator = new EvalV3();");

fs.writeFileSync('src/lib/AIEngine.ts', code, 'utf8');
