import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';
import { runArena, Agents, MatchResult } from './src/quantum-engine/ai/arena';

// We bypass runArena's console logs by playing matches directly in workers
import { playMatch } from './src/quantum-engine/ai/arena';

if (isMainThread) {
    const fs = require('fs');
    const path = require('path');
    
    interface Task {
        id: number;
        white: string;
        black: string;
        budgetMs: number;
        games: number;
    }

    const tasks: Task[] = [];
    const budgets = [100]; // ms
    const opponents = ['random', 'greedy'];
    let taskId = 0;

    // We split 1000 games into chunks of 25 games
    const CHUNK_SIZE = 5;
    const TOTAL_GAMES = 10;

    for (const budget of budgets) {
        for (const opp of opponents) {
            // MCTS vs Opp (500 games)
            for (let i = 0; i < TOTAL_GAMES / 2 / CHUNK_SIZE; i++) {
                tasks.push({ id: taskId++, white: 'mcts-v0', black: opp, budgetMs: budget, games: CHUNK_SIZE });
            }
            // Opp vs MCTS (500 games)
            for (let i = 0; i < TOTAL_GAMES / 2 / CHUNK_SIZE; i++) {
                tasks.push({ id: taskId++, white: opp, black: 'mcts-v0', budgetMs: budget, games: CHUNK_SIZE });
            }
        }
    }

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
            console.log(`Completed ${completedTasks}/${taskId} (Budget: ${task.budgetMs}ms, ${task.white} vs ${task.black})`);
            
            // Save intermediate results
            fs.writeFileSync('benchmark_progress.json', JSON.stringify(results, null, 2));

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
    // Worker logic
    const { playMatch, Agents } = require('./src/quantum-engine/ai/arena');
    const { wrapMCTS, wrapRandom, wrapGreedy } = require('./src/quantum-engine/ai/arena');

    const getAgent = (name: string, budgetMs: number) => {
        if (name === 'random') return wrapRandom();
        if (name === 'greedy') return wrapGreedy();
        if (name === 'mcts-v0') return wrapMCTS({ timeLimitMs: budgetMs, maxIterations: 99999, useTT: false });
        return wrapRandom();
    };

    const task = workerData;
    let wWins = 0, bWins = 0, draws = 0, plies = 0, time = 0;
    
    // We don't want to blow up memory with raw stats, just aggregate
    let t_iters = 0, t_nodes = 0, t_nps = 0, t_depth = 0, t_mcts_moves = 0;

    for (let i = 0; i < task.games; i++) {
        const wAgent = getAgent(task.white, task.budgetMs);
        const bAgent = getAgent(task.black, task.budgetMs);
        const res = playMatch(wAgent, bAgent);
        
        if (res.winner === 'white') wWins++;
        else if (res.winner === 'black') bWins++;
        else draws++;
        
        plies += res.plies;
        time += res.timeMs;

        // Collect MCTS stats
        const mctsStats = task.white === 'mcts-v0' ? res.whiteStats : res.blackStats;
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
