// Local CPU-only benchmark. Build first: npm --prefix server run build.
// No server, account, external database or network connection is created.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { cpus, availableParallelism } from 'node:os';
const require = createRequire(import.meta.url);
const { searchCpuPracticeMove } = require('../../server/dist/services/CpuPracticeSearch.js');
const { createInitialState } = require('../../server/dist/quantum-engine/initialState.js');
const { applyPracticeMove } = require('../../server/dist/quantum-engine/practice.js');
const { getAllConcreteMoves } = require('../../server/dist/quantum-engine/ai/random.js');
const args = process.argv.slice(2);
const argument = (key, fallback) => args.includes(key) ? args[args.indexOf(key) + 1] : fallback;
const output = resolve(argument('--output', 'scratch/cpu-practice-search.json'));
const repeats = Number(argument('--repeats', '3'));
assert(Number.isInteger(repeats) && repeats > 0 && repeats <= 10);
const checkpoints = new Set([0, 2, 3, 6, 12, 13, 20, 30]);
const positions = [];
const history = [];
let state = createInitialState(), seed = 0x20261003;
const random = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed >>> 0; };
const opening = [['c2','e4'],['b7','d5'],['e4','e5'],['d5','d4'],['e5','d4'],['g8','f6']];
const square = ({row,col}) => 'abcdefgh'[col] + (8 - row);
while (state.ply <= 30) {
    assert.equal(state.winner, null);
    if (checkpoints.has(state.ply)) positions.push({name:`legal-ply-${state.ply}`,state,history:[...history]});
    if (state.ply === 30) break;
    const legal = getAllConcreteMoves(state);
    let move, next;
    if (state.ply < opening.length) {
        const [from,to] = opening[state.ply];
        move = legal.find(candidate => square(state.pieces.find(piece => piece.id === candidate.pieceId).position) === from
            && square(candidate.target) === to);
        assert(move, `${from}-${to}`); next = applyPracticeMove(state, move);
    } else {
        // Reproducible legal continuations, excluding terminal results. These are
        // reachable positions from normal full-superposition play, not seeded boards.
        const ranked = legal.map(candidate => ({candidate,priority:random()})).sort((a,b) => a.priority - b.priority);
        for (const {candidate} of ranked) {
            const after = applyPracticeMove(state, candidate);
            if (!after.winner) { move=candidate; next=after; break; }
        }
    }
    assert(next && move && !next.winner, `continuation at ply ${state.ply}`);
    history.push(move); state=next;
}
const samples = [];
for (let round=0; round<repeats; round++) for (const position of positions) {
    const unchanged = JSON.stringify(position.state);
    const pair = await Promise.all([0,1].map(async worker => {
        const start=performance.now();
        try {
            const move=await searchCpuPracticeMove(position.state,5,new AbortController().signal,true);
            assert(move, 'NO_LEGAL_HINT');
            const next=applyPracticeMove(position.state,move);
            assert.equal(next.ply,position.state.ply+1);
            assert.equal(JSON.stringify(position.state),unchanged);
            return {position:position.name,round,worker,ms:Math.round(performance.now()-start),ok:true,move};
        } catch(error) {
            return {position:position.name,round,worker,ms:Math.round(performance.now()-start),ok:false,error:error.message};
        }
    }));
    samples.push(...pair);
    console.log(`${position.name} round ${round+1}: ${pair.map(item => `${item.ok?'legal':item.error} ${item.ms}ms`).join(', ')}`);
}
const summarize = rows => {
    const times=rows.map(row=>row.ms).sort((a,b)=>a-b),errors={};
    for(const row of rows) if(!row.ok) errors[row.error]=(errors[row.error]??0)+1;
    return {requests:rows.length,legal:rows.filter(row=>row.ok).length,errors,
        p50Ms:times[Math.ceil(times.length*0.5)-1],p95Ms:times[Math.ceil(times.length*0.95)-1],maxMs:times.at(-1)};
};
const report={createdAt:new Date().toISOString(),scope:'isolated local CPU; not Render capacity evidence',
    runtime:process.version,cpu:cpus()[0]?.model,availableParallelism:availableParallelism(),
    concurrency:2,searchBudgetMs:4000,workerWatchdogMs:6000,repeats,
    summary:summarize(samples),positions:positions.map(({name,state,history})=>({name,ply:state.ply,
        side:state.sideToMove,captured:state.captured,history,summary:summarize(samples.filter(row=>row.position===name))})),samples};
await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report.summary));
if(args.includes('--require-success')&&samples.some(sample=>!sample.ok))process.exitCode=1;
