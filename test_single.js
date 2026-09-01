const { playMatch, wrapRandom, wrapGreedy } = require('./dist/src/quantum-engine/ai/arena');
const { MCTSEngine } = require('./dist/src/quantum-engine/ai/mcts');
const { EvalV0 } = require('./dist/src/quantum-engine/ai/eval');

const wrapMCTS = (budgetMs) => {
    return (state) => {
        const evaluator = new EvalV0();
        const engine = new MCTSEngine(evaluator, { timeLimitMs: budgetMs, maxIterations: 99999, useTT: false, clearTT: true });
        const stats = engine.search(state, { timeLimitMs: budgetMs, clearTT: true });
        return { move: stats.move, stats };
    };
};

const wAgent = wrapMCTS(100);
const bAgent = wrapGreedy();
console.log("Playing match...");
const res = playMatch(wAgent, bAgent);
console.log("Winner:", res.winner, "Plies:", res.plies);
