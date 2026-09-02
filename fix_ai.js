const fs = require('fs');

function fixAI() {
    let code = fs.readFileSync('src/lib/AIEngine.ts', 'utf8');
    
    const target = `    let qMove = null;
    if (level === 1) {
        // Level 1: Random Move
        qMove = getRandomMove(qState);
    } else if (level === 2) {
        // Level 2: Greedy (Immediate material gain)
        qMove = getGreedyMove(qState);
    } else {
        // Level 3-5: MCTS Engine with varying time budgets
        let timeBudget = 500;
        if (level === 4) timeBudget = 1500;
        if (level === 5) timeBudget = 3000;

        const evaluator = new EvalV0();
        const mcts = new MCTSEngine(evaluator, { timeLimitMs: timeBudget, maxIterations: 20000 });
        const stats = mcts.search(qState, { timeLimitMs: timeBudget });
        console.log(\`[CPU Level \${level}] MCTS Stats: \${stats.iterations} iters, \${stats.maxDepth} depth, \${stats.nodesPerSec.toFixed(1)} nps\`);
        qMove = stats.move;
    }`;

    const replacement = `    // CPU level is locked to MAX power for all difficulties
    const timeBudget = 4000; // 4 seconds max
    const evaluator = new EvalV0();
    const mcts = new MCTSEngine(evaluator, { timeLimitMs: timeBudget, maxIterations: 100000 });
    const stats = mcts.search(qState, { timeLimitMs: timeBudget });
    console.log(\`[CPU MAX MODE] MCTS Stats: \${stats.iterations} iters, \${stats.maxDepth} depth, \${stats.nodesPerSec.toFixed(1)} nps\`);
    const qMove = stats.move;`;
    
    code = code.replace(target, replacement);
    fs.writeFileSync('src/lib/AIEngine.ts', code, 'utf8');
}

fixAI();
