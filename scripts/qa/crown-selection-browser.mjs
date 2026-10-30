/** Real Crown board/client/engine with a synthetic account and controlled CPU/HTTP timing.
 * No production API, wallet, match, advertisement or physical device is used.
 * Usage: node scripts/qa/crown-selection-browser.mjs [output] [--expect-reset]
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { OrthographicCamera, Vector3 } from 'three';
const root = fileURLToPath(new URL('../../', import.meta.url));
const output = resolve(process.argv[2] || 'build/crown-selection');
const expectReset = process.argv.includes('--expect-reset');
const require = createRequire(import.meta.url);
const { build } = require(require.resolve('esbuild', { paths: [resolve(root, 'server')] }));
const fixture = resolve(output, 'fixture');
await mkdir(fixture, { recursive: true });
const source = path => resolve(root, path).replaceAll('\\', '/');
await build({ stdin: { contents: `export {createInitialState} from './src/quantum-engine/initialState';
export {applyPracticeMove} from './src/quantum-engine/practice';
export {boardCamera} from './src/components/boardPresentation';`, resolveDir: root, loader: 'ts' },
    bundle: true, platform: 'node', format: 'cjs', outfile: resolve(fixture, 'engine.cjs') });
const { createInitialState, applyPracticeMove, boardCamera } = require(resolve(fixture, 'engine.cjs'));
const exportHtml = await readFile(resolve(root, 'out/index.html'), 'utf8');
const cssLinks = [...exportHtml.matchAll(/<link[^>]*href="([^"]+\.css[^"]*)"[^>]*>/g)].map(([, href]) => `<link rel="stylesheet" href="/@fs/${source('out' + href.split('?')[0])}">`).join('');
assert(cssLinks, 'Use the real exported app CSS');
const bodyClass = exportHtml.match(/<body[^>]*class="([^"]*)"/)?.[1] || '';
await writeFile(resolve(fixture, 'index.html'), '<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Crown selection regression</title>'+cssLinks+'</head><body class="'+bodyClass+'"><div id="root"></div><script type="module" src="/main.tsx"></script></body></html>');
await writeFile(resolve(fixture, 'main.tsx'), `import React from 'react';
import {createRoot} from 'react-dom/client';
import LocalGameBoard from ${JSON.stringify(source('src/components/LocalGameBoard.tsx'))};
const query=new URLSearchParams(location.search);
createRoot(document.getElementById('root')).render(<LocalGameBoard lang="ja"
 user={{id:'CrownSelectionFixture',name:'Local QA',type:'registered'}} cpuLevel={1}
 onlineRole={query.get('side')} crownStageId={1} crownRunId={query.get('run')}
 campaignLabel="ステージ 1 / 100" onHome={()=>{}}/>);`);
await writeFile(resolve(fixture, 'cpu-gate.ts'), `import {getAllConcreteMoves} from ${JSON.stringify(source('src/quantum-engine/ai/random.ts'))};
export {requestQubeSearch} from ${JSON.stringify(source('src/lib/cpuClient.ts'))};
export function requestCPUSearch(state,signal){return new Promise((resolve,reject)=>{
 const pending={state,release(from,to){
  const at=square=>({row:8-Number(square[1]),col:square.charCodeAt(0)-97});
  const a=at(from),b=at(to),piece=state.pieces.find(p=>p.position?.row===a.row&&p.position?.col===a.col);
  const move=getAllConcreteMoves(state).find(m=>m.pieceId===piece?.id&&m.target.row===b.row&&m.target.col===b.col);
  if(!move)throw new Error('No legal fixture CPU move '+from+'-'+to);
  window.crownQaCpu=null;resolve({move});
 }};
 window.crownQaCpu=pending;
 signal.addEventListener('abort',()=>{if(window.crownQaCpu===pending)window.crownQaCpu=null;reject(new DOMException('Cancelled','AbortError'));},{once:true});
});}`);
const server = await createServer({ configFile: false, root: fixture, publicDir: resolve(root, 'public'),
    cacheDir: resolve(output, 'vite-cache'), server: { host: '127.0.0.1', port: 0, fs: { allow: [root, output] } },
    resolve: { alias: [{ find: /^\.\.\/lib\/cpuClient$/, replacement: resolve(fixture, 'cpu-gate.ts') }] },
    define: { 'process.env.NEXT_PUBLIC_SERVER_URL': JSON.stringify('http://127.0.0.1:19998'),
        'process.env.NEXT_PUBLIC_QG_CPU_HINT_TICKETS_ENABLED': JSON.stringify('true'), 'process.env': {} },
    esbuild: { jsx: 'automatic' }, optimizeDeps: { include: ['react', 'react-dom/client', 'lucide-react'] },
    css: { postcss: { plugins: [] } } });
await server.listen();
const base = `http://127.0.0.1:${server.httpServer.address().port}`;
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const results = [];
const cases = [];
for (const width of [1280, 390]) for (const view of ['2D', '3D']) for (const side of ['white', 'black']) cases.push({ width, view, side, kind: 'retain' });
if (!expectReset) cases.push({ width: 390, view: '2D', side: 'white', kind: 'recover' }, { width: 390, view: '3D', side: 'white', kind: 'capture' });
try {
    for (const config of cases) {
        const { width, view, side, kind } = config, touch = width < 500;
        const context = await browser.newContext({ viewport: { width, height: touch ? 844 : 900 }, hasTouch: touch, isMobile: touch, reducedMotion: 'reduce' });
        const page = await context.newPage(); page.setDefaultTimeout(30000);
        const errors = [], requests = [], holds = [];
        let reads = 0;
        page.on('pageerror', error => errors.push(error.message));
        let run = { runId: randomUUID(), stageId: 1, playerSide: side, kind: 'crown', hintContextId: randomUUID(),
            strength: 1, seconds: 600, rulesVersion: 'quantum-crown-v1', revision: 0, stateHash: 'fixture-0', state: createInitialState(),
            history: [], whiteMs: 600000, blackMs: 600000, status: 'active', serverNow: Date.now() };
        const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization,content-type', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' };
        await context.route('**/*', async route => {
            const request = route.request(), url = new URL(request.url());
            if (url.origin === base) return route.continue();
            if (url.origin !== 'http://127.0.0.1:19998' || !url.pathname.startsWith('/crown-hints/runs')) return route.abort();
            if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
            if (url.pathname.endsWith('/moves')) {
                const body = request.postDataJSON();
                assert.equal(body.revision, run.revision, 'No duplicate or stale move may be submitted');
                assert.equal(body.actor, run.state.sideToMove === side ? 'human' : 'cpu');
                const state = applyPracticeMove(run.state, body.move);
                run = { ...run, state, revision: state.ply, history: [...run.history, state.lastMove], stateHash: `fixture-${state.ply}`, serverNow: Date.now() };
                requests.push(body);
                const decision = await new Promise(done => holds.push({ actor: body.actor, done }));
                if (decision === 'lost') return route.abort();
            } else if (request.method() === 'GET') reads++;
            else if (url.pathname.endsWith('/close')) run = { ...run, status: 'closed' };
            return route.fulfill({ json: run, headers: cors }).catch(() => {});
        });
        await context.addInitScript(view => {
            localStorage.setItem('qg_language', 'ja');
            localStorage.setItem('qchess_is2DView', String(view === '2D'));
            localStorage.setItem('qg_sound_config', JSON.stringify({ masterMute: true, bgmVolume: 0, seVolume: 0 }));
            sessionStorage.setItem('qg_ranked_session_v1', JSON.stringify({ userId: 'CrownSelectionFixture', token: 'synthetic_crown_selection_credential', expiresAt: Date.now() + 600000 }));
        }, view);
        const selection = async () => await page.locator('.clear-selection').count() ? page.getByTestId('selected-square').innerText() : '—';
        const flush = () => page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
        const waitHold = async actor => { for (let i = 0; i < 100 && !holds.some(h => h.actor === actor); i++) await page.waitForTimeout(50); assert(holds.some(h => h.actor === actor), `Missing ${actor} HTTP request`); };
        const release = async (actor, lost = false) => { await waitHold(actor); holds.splice(holds.findIndex(h => h.actor === actor), 1)[0].done(lost ? 'lost' : 'ok'); };
        const click = async square => {
            if (view === '2D') return touch ? page.locator(`[data-square="${square}"]`).tap() : page.locator(`[data-square="${square}"]`).click();
            const canvas = await page.locator('.board-webgl-layer canvas').boundingBox(); assert(canvas);
            const setup = boardCamera(canvas.width, canvas.height, side === 'black');
            const camera = new OrthographicCamera(-canvas.width/2, canvas.width/2, canvas.height/2, -canvas.height/2, .1, 100);
            camera.position.set(...setup.position); camera.zoom = setup.zoom; camera.lookAt(0,0,0); camera.updateProjectionMatrix(); camera.updateMatrixWorld();
            const point = new Vector3(square.charCodeAt(0)-97-3.5, .35, 8-Number(square[1])-3.5).project(camera);
            const x = canvas.x+(point.x+1)*canvas.width/2, y = canvas.y+(1-point.y)*canvas.height/2;
            return touch ? page.touchscreen.tap(x,y) : page.mouse.click(x,y);
        };
        try {
            await page.goto(`${base}/?side=${side}&run=${run.runId}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
            await page.locator('.match-layout').waitFor({ timeout: 90000 });
            await page.locator('.map-match-intro').waitFor({ state: 'detached' });
            if (view === '3D') await page.locator('[data-graphics-state="ready"]').waitFor();
            else await page.locator('[data-square="e2"]').waitFor();
            await flush();
            const chosen = kind === 'capture' ? 'e7' : side === 'white' ? 'h2' : 'h7';
            if (side === 'white') {
                await click('e2'); assert.equal(await selection(), 'e2');
                await click('e7'); await waitHold('human'); assert.equal(await selection(), '—', 'Own submission must clear selection');
                await click(chosen); assert.equal(await selection(), chosen);
                await release('human');
            }
            await page.waitForFunction(() => !!window.crownQaCpu);
            if (side === 'black') await click(chosen);
            assert.equal(await selection(), chosen, 'First selection must register before CPU result');
            const beforeCpu = await selection(), countBeforeCpu = requests.length;
            // Inspection while the CPU thinks must not submit a premature player move.
            if (kind === 'retain') {
                await click(side === 'white' ? 'h4' : 'h5'); await flush();
                assert.equal(requests.length, countBeforeCpu);
                await click(chosen); assert.equal(await selection(), chosen);
            }
            await page.evaluate(side => window.crownQaCpu.release(side === 'white' ? 'f8' : 'e2', 'e7'), side);
            await waitHold('cpu'); await flush();
            const afterOptimisticCpu = await selection();
            const expected = expectReset || kind === 'capture' ? '—' : chosen;
            assert.equal(afterOptimisticCpu, expected, 'CPU optimistic board update must preserve a surviving friendly selection');
            await release('cpu', kind === 'recover');
            await page.waitForFunction(n => document.querySelectorAll('.match-history li').length === n, side === 'white' ? 2 : 1);
            await flush();
            const afterAcknowledgement = await selection();
            assert.equal(afterAcknowledgement, expected, 'Acknowledgement/recovery must preserve the selected surviving piece');
            if (kind === 'recover') assert(reads > 0, 'Lost reply must recover through a read');
            if (!expectReset && kind !== 'capture') {
                const before = requests.filter(r => r.actor === 'human').length;
                await click(side === 'white' ? 'h4' : 'h5'); await waitHold('human');
                assert.equal(requests.filter(r => r.actor === 'human').length, before + 1, 'One destination click must submit exactly one move');
                assert.equal(await selection(), '—');
                assert.equal(requests.at(-1).move.target.row, side === 'white' ? 4 : 3);
                await release('human');
            }
            assert.deepEqual(errors, []);
            await page.screenshot({ path: resolve(output, `${view}-${width}-${side}-${kind}.png`) });
            const result = { ...config, beforeCpu, afterOptimisticCpu, afterAcknowledgement, moves: requests.length,
                reads, errors, reproducedOldReset: expectReset, passed: !expectReset };
            results.push(result); console.log(JSON.stringify(result));
        } catch (error) {
            await page.screenshot({ path: resolve(output, 'failure.png') });
            console.error(JSON.stringify({ errors }));
            console.error((await page.locator('body').innerText()).slice(0, 1800));
            throw error;
        } finally { holds.forEach(h => h.done('ok')); await context.close(); }
    }
} finally {
    await browser.close(); await server.close();
    await writeFile(resolve(output, 'results.json'), JSON.stringify({ measuredAt: new Date().toISOString(), expectReset,
        evidence: 'Actual LocalGameBoard, CrownHintRunClient, 2D/3D and engine; CPU timing and account/API responses controlled locally. No live account, tickets or physical-device test.', results }, null, 2)+'\n');
}
