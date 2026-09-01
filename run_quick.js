const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');

if (isMainThread) {
    const fs = require('fs');
    
    const tasks = [];
    const budgets = [100, 500]; // Only 100 and 500
    const opponents = ['random', 'greedy'];
    const evals = ['v0', 'v1'];

    const CHUNK_SIZE = 25; 
    const TOTAL_GAMES = 50; // Just 50 games per condition to get a quick estimate

    for (const ev of evals) {
        for (const budget of budgets) {
            for (const opp of opponents) {
                for (let i = 0; i < TOTAL_GAMES / 2 / CHUNK_SIZE; i++) {
                    tasks.push({ white: 'mcts', black: opp, budgetMs: budget, games: CHUNK_SIZE, evalVersion: ev });
                    tasks.push({ white: opp, black: 'mcts', budgetMs: budget, games: CHUNK_SIZE, evalVersion: ev });
                }
            }
        }
    }

    const numWorkers = require('os').cpus().length;
    console.log(`Starting ${tasks.length} tasks across ${numWorkers} workers...`);
    const results = [];
    let completedTasks = 0;
    const total = tasks.length;

    const startWorker = () => {
        if (tasks.length === 0) return;
        const task = tasks.shift();
        const worker = new Worker(__filename, { workerData: task });
        
        worker.on('message', (res) => {
            results.push({ task, res });
            completedTasks++;
            console.log(`[${completedTasks}/${total}] Budget: ${task.budgetMs}ms, Eval: ${task.evalVersion}, ${task.white} vs ${task.black} - W:${res.wWins} B:${res.bWins}`);
            startWorker();
        });
        
        worker.on('exit', (code) => {
            if (completedTasks === total) {
                console.log('All tasks completed.');
                fs.writeFileSync('benchmark_quick.json', JSON.stringify(results, null, 2));
                process.exit(0);
            }
        });
    };

    for (let i = 0; i < numWorkers; i++) {
        startWorker();
    }

} else {
    const { playMatch, wrapRandom, wrapGreedy } = require('./dist/src/quantum-engine/ai/arena');
    const { MCTSEngine } = require('./dist/src/quantum-engine/ai/mcts');
    const { EvalV0, EvalV1 } = require('./dist/src/quantum-engine/ai/eval');

    const wrapMCTS = (budgetMs, evalVersion) => {
        return (state) => {
            const evaluator = evalVersion === 'v0' ? new EvalV0() : new EvalV1();
            const engine = new MCTSEngine(evaluator, { timeLimitMs: budgetMs, maxIterations: 99999, useTT: false, clearTT: true });
            const stats = engine.search(state, { timeLimitMs: budgetMs, clearTT: true });
            return { move: stats.move, stats };
        };
    };

    const getAgent = (name, budgetMs, evalVersion) => {
        if (name === 'random') return wrapRandom();
        if (name === 'greedy') return wrapGreedy();
        if (name === 'mcts') return wrapMCTS(budgetMs, evalVersion);
        return wrapRandom();
    };

    const task = workerData;
    let wWins = 0, bWins = 0, draws = 0, plies = 0, time = 0;

    for (let i = 0; i < task.games; i++) {
        const wAgent = getAgent(task.white, task.budgetMs, task.evalVersion);
        const bAgent = getAgent(task.black, task.budgetMs, task.evalVersion);
        const res = playMatch(wAgent, bAgent);
        
        if (res.winner === 'white') wWins++;
        else if (res.winner === 'black') bWins++;
        else draws++;
    }

    parentPort.postMessage({ wWins, bWins, draws });
}
