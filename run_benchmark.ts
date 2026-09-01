import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';

if (isMainThread) {
    const fs = require('fs');
    const path = require('path');
    
    interface Task {
        id: number;
        white: string;
        black: string;
        budgetMs: number;
        games: number;
        evalVersion: string;
    }

    const tasks: Task[] = [];
    const budgets = [100, 500, 1000, 2000, 5000]; // ms
    const opponents = ['random', 'greedy'];
    const evals = ['v0', 'v1'];
    let taskId = 0;

    const CHUNK_SIZE = 20; // smaller chunk for more frequent saves
    const TOTAL_GAMES = 1000;

    for (const ev of evals) {
        for (const budget of budgets) {
            for (const opp of opponents) {
                // White = MCTS
                for (let i = 0; i < TOTAL_GAMES / 2 / CHUNK_SIZE; i++) {
                    tasks.push({ id: taskId++, white: 'mcts', black: opp, budgetMs: budget, games: CHUNK_SIZE, evalVersion: ev });
                }
                // Black = MCTS
                for (let i = 0; i < TOTAL_GAMES / 2 / CHUNK_SIZE; i++) {
                    tasks.push({ id: taskId++, white: opp, black: 'mcts', budgetMs: budget, games: CHUNK_SIZE, evalVersion: ev });
                }
            }
        }
    }

    // Sort tasks to do 100ms and 500ms first so we get results faster
    tasks.sort((a, b) => a.budgetMs - b.budgetMs);

    const numWorkers = require('os').cpus().length;
    console.log(`Starting ${tasks.length} tasks across ${numWorkers} workers...`);
    const results: any[] = [];
    let completedTasks = 0;

    const startWorker = () => {
        if (tasks.length === 0) return;
        const task = tasks.shift()!;
        const worker = new Worker(__filename, { workerData: task });
        
        worker.on('message', (res) => {
            results.push({ task, res });
            completedTasks++;
            console.log(`[${completedTasks}/${taskId}] Budget: ${task.budgetMs}ms, Eval: ${task.evalVersion}, ${task.white} vs ${task.black} - Plies: ${res.plies}, MCTS_Iters: ${res.mctsIters}`);
            
            fs.writeFileSync('benchmark_massive.json', JSON.stringify(results, null, 2));

            startWorker();
        });
        
        worker.on('error', (err) => console.error(err));
        worker.on('exit', (code) => {
            if (code !== 0) console.error(`Worker stopped with code ${code}`);
            if (completedTasks === taskId) {
                console.log('All tasks completed.');
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
    const { EvalV0 } = require('./dist/src/quantum-engine/ai/eval');
    const { EvalV1 } = require('./dist/src/quantum-engine/ai/eval');

    const wrapMCTS = (budgetMs: number, evalVersion: string) => {
        return (state: any) => {
            const evaluator = evalVersion === 'v0' ? new EvalV0() : new EvalV1();
            const engine = new MCTSEngine(evaluator, { timeLimitMs: budgetMs, maxIterations: 99999, useTT: false, clearTT: true });
            const stats = engine.search(state, { timeLimitMs: budgetMs, clearTT: true });
            return { move: stats.move, stats };
        };
    };

    const getAgent = (name: string, budgetMs: number, evalVersion: string) => {
        if (name === 'random') return wrapRandom();
        if (name === 'greedy') return wrapGreedy();
        if (name === 'mcts') return wrapMCTS(budgetMs, evalVersion);
        return wrapRandom();
    };

    const task = workerData;
    let wWins = 0, bWins = 0, draws = 0, plies = 0, time = 0;
    let t_iters = 0, t_nodes = 0, t_nps = 0, t_depth = 0, t_mcts_moves = 0;

    for (let i = 0; i < task.games; i++) {
        const wAgent = getAgent(task.white, task.budgetMs, task.evalVersion);
        const bAgent = getAgent(task.black, task.budgetMs, task.evalVersion);
        const res = playMatch(wAgent, bAgent);
        
        if (res.winner === 'white') wWins++;
        else if (res.winner === 'black') bWins++;
        else draws++;
        
        plies += res.plies;
        time += res.timeMs;

        const mctsStats = task.white === 'mcts' ? res.whiteStats : res.blackStats;
        for (const s of mctsStats) {
            t_iters += s.iterations;
            t_nodes += s.nodes;
            t_nps += s.nodesPerSec;
            t_depth += s.maxDepth;
            t_mcts_moves++;
        }
    }

    parentPort!.postMessage({
        wWins, bWins, draws, plies, time,
        mctsMoves: t_mcts_moves,
        mctsIters: t_iters,
        mctsNodes: t_nodes,
        mctsNps: t_nps,
        mctsDepth: t_depth
    });
}
