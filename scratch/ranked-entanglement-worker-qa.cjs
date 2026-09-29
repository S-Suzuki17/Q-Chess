// Run after npm --prefix server run build. Isolated in-memory games; no network/DB.
const assert = require('node:assert/strict');
const { GameEngine } = require('../server/dist/game/GameEngine');
const { createInitialBoard, resolveEntanglement } = require('../server/dist/game/quantumChess');
const { runCpuWorker } = require('../server/dist/game/RankedRuntime');
const { cpuProfileForRating } = require('../server/dist/game/RankCpuSearch');

async function main() {
    const results = [];
    for (const rating of [600, 1000, 1800, 2200]) {
        const engine = new GameEngine('isolated-worker-qa', 'white', 'black', createInitialBoard());
        for (const x of [0, 2, 4]) for (const backwards of [false, true]) for (const team of [0, 1]) {
            const state = engine.getPublicState('white');
            assert.equal(engine.processAction({ actionId: `setup-${state.version}`, version: state.version,
                playerId: team === 0 ? 'white' : 'black', action: { type: 'MOVE', payload: {
                    pieceId: team === 0 ? 2 * x + 1 : 16 + 2 * x, toX: x,
                    toY: team === 0 ? (backwards ? 2 : 3) : (backwards ? 5 : 4),
                } } }).success, true);
        }
        for (const p of engine.getPublicState('white').pieces.filter(p => !p.hasMoved)) {
            assert.deepEqual(p.possibilities, ['P', 'N', 'B', 'K']);
        }
        const started = performance.now();
        for (let turn = 0; turn < 4; turn++) {
            const state = engine.getPublicState('white');
            const response = await runCpuWorker(state, cpuProfileForRating(rating, 600));
            assert.equal(response.error, undefined);
            assert.ok(response.move);
            assert.equal(engine.processAction({ actionId: `worker-${state.version}`, version: response.version,
                playerId: state.turn === 0 ? 'white' : 'black', action: { type: 'MOVE', payload: response.move } }).success, true);
            const after = engine.getPublicState('white');
            assert.deepEqual(resolveEntanglement(resolveEntanglement(after.pieces, 0), 1), after.pieces);
        }
        results.push({ rating, workerMoves: 4, elapsedMs: Math.round(performance.now() - started) });
    }
    console.log(JSON.stringify({ passed: true, results }));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
