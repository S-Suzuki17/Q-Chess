const { Worker } = require('worker_threads');
const worker = new Worker('./dist/run_benchmark.js', { workerData: { white: 'mcts', black: 'greedy', budgetMs: 100, games: 1, evalVersion: 'v0' } });
worker.on('message', console.log);
worker.on('error', console.error);
worker.on('exit', code => console.log('Exit:', code));
