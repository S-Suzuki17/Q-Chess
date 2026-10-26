// Local-only before/after probe. Prepare a baseline before changing the sources:
// node scripts/qa/free-runtime-latency.mjs prepare before
// node scripts/qa/free-runtime-latency.mjs prepare after
// node scripts/qa/free-runtime-latency.mjs compare
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright';

const require = createRequire(import.meta.url);
const { build } = require(require.resolve('esbuild', { paths: [path.resolve('server')] }));
const root = path.resolve('build/free-runtime-latency');
const [mode, label] = process.argv.slice(2);
if (mode === 'prepare') {
    assert(['before', 'after'].includes(label));
    const destination = path.join(root, label);
    await mkdir(destination, { recursive: true });
    await build({ stdin: { contents: `export * from './cpuClient';
        export {createInitialState} from '../quantum-engine/initialState';
        export {applyMove} from '../quantum-engine/stateTransition';`,
        resolveDir: path.resolve('src/lib'), loader: 'ts' }, bundle: true, format: 'esm',
        outfile: path.join(destination, 'lib/cpuClient.js') });
    await build({ entryPoints: ['src/workers/cpu.worker.ts'], bundle: true, format: 'esm',
        outfile: path.join(destination, 'workers/cpu.worker.ts') });
    await build({ stdin: { contents: `export {GameEngine} from './server/src/game/GameEngine';
        export {RankedRuntime} from './server/src/game/RankedRuntime';
        export {createInitialBoard} from './server/src/game/quantumChess';`,
        resolveDir: process.cwd(), loader: 'ts' }, bundle: true, platform: 'node', format: 'cjs',
        outfile: path.join(destination, 'server.cjs') });
    console.log(`Prepared ${label}: ${destination}`);
} else if (mode === 'compare') {
    const server = createServer(async (request, response) => {
        const pathname = new URL(request.url, 'http://localhost').pathname;
        if (pathname === '/') { response.end('<!doctype html><title>Local CPU probe</title>'); return; }
        if (!/^\/(before|after)\/(lib\/cpuClient\.js|workers\/cpu\.worker\.ts)$/.test(pathname)) {
            response.writeHead(404).end(); return;
        }
        try { response.setHeader('Content-Type', 'text/javascript'); response.end(await readFile(path.join(root, pathname))); }
        catch { response.writeHead(404).end(); }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    const browser = await chromium.launch({ headless: true, channel: 'chrome' });
    const context = await browser.newContext();
    const errors = [];
    try {
        await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
        const page = await context.newPage();
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(origin);
        const client = await page.evaluate(async () => {
            const counts = { before: 0, after: 0 };
            const NativeWorker = window.Worker;
            window.Worker = class extends NativeWorker {
                constructor(url, options) { super(url, options); counts[new URL(url).pathname.split('/')[1]]++; }
            };
            const modules = { before: await import('/before/lib/cpuClient.js'), after: await import('/after/lib/cpuClient.js') };
            const output = { before: [], after: [] };
            const initial = modules.before.createInitialState();
            let position = initial;
            for (let i = 0; i < 20; i++) {
                const snapshot = JSON.stringify(position);
                const answers = {};
                for (const variant of i % 2 ? ['after', 'before'] : ['before', 'after']) {
                    const start = performance.now();
                    const result = await modules[variant].requestCPUSearch(position, new AbortController().signal, 1,
                        'balanced', { timeLimitMs: 1000, maxDepth: 0, tieBreakSeed: 1234 });
                    output[variant].push(performance.now() - start);
                    if (!result.move) throw new Error('Missing legal CPU move');
                    const next = modules[variant].applyMove(position, result.move);
                    if (next.sideToMove === position.sideToMove) throw new Error('Move did not advance turn');
                    if (JSON.stringify(position) !== snapshot) throw new Error('CPU mutated caller state');
                    answers[variant] = result.move;
                }
                if (JSON.stringify(answers.before) !== JSON.stringify(answers.after)) throw new Error('Deterministic CPU move changed');
                position = modules.before.applyMove(position, answers.before);
            }
            return { durationsMs: output, workersCreated: counts, legalMovesPerVariant: 20, identicalMoves: true };
        });
        const runtimes = {};
        for (const variant of ['before', 'after']) {
            const { GameEngine, RankedRuntime, createInitialBoard } = require(path.join(root, variant, 'server.cjs'));
            let snapshots = 0;
            const matches = Array.from({ length: 32 }, (_, i) => {
                const engine = new GameEngine(`local-${i}`, 'white', 'black', createInitialBoard(), 3600);
                const original = engine.getPublicState.bind(engine);
                engine.getPublicState = (...args) => { snapshots++; return original(...args); };
                return { matchId: `local-${i}`, state: 'IN_GAME', players: { host: 'white', joiner: 'black' }, engine };
            });
            const runtime = new RankedRuntime({ to: () => ({ emit() {} }) },
                { getMatches: () => matches, authorityCheckPending: () => false }, async () => null);
            for (let i = 0; i < 100; i++) runtime.tick();
            snapshots = 0;
            const started = performance.now();
            for (let i = 0; i < 1000; i++) runtime.tick();
            runtimes[variant] = { matches: 32, ticks: 1000, elapsedMs: performance.now() - started, snapshots };
        }
        const summarize = values => {
            const sorted = values.slice(2).sort((a, b) => a - b);
            return { firstMs: values[0], warmedMedianMs: sorted[Math.floor(sorted.length / 2)],
                warmedP95Ms: sorted[Math.ceil(sorted.length * .95) - 1], samples: sorted.length };
        };
        assert.equal(errors.length, 0, errors.join('\n'));
        assert.equal(client.workersCreated.after, 1);
        assert.equal(runtimes.after.snapshots, 0);
        const report = { measuredAt: new Date().toISOString(), environment: 'Local Chrome / Node; no production or device timing',
            cpuProfile: 'Easy, depth 0, unchanged 1000ms limit and seed 1234', client,
            summary: { before: summarize(client.durationsMs.before), after: summarize(client.durationsMs.after) }, runtimes, errors };
        await writeFile(path.join(root, 'result.json'), JSON.stringify(report, null, 2) + '\n');
        console.log(JSON.stringify(report, null, 2));
    } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
} else throw new Error('Use prepare before|after, or compare');
