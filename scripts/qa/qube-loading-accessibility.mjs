/** Isolated UI fixture: real MatchLayout/useMoveHint, deterministic deferred replies.
 * Run: node scripts/qa/qube-loading-accessibility.mjs [--build-only]
 * Requires the repo dependencies and Playwright Chromium (available in CI).
 * QUBE_QA_CHROMIUM_EXECUTABLE may name an already-installed Chromium executable.
 * No app server, auth, ads, payments, production backend, or engine search runs.
 */
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { chromium } from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const output = resolve(root, 'scratch/qube-loading-accessibility');
await mkdir(output, {recursive:true});
const temp = await mkdtemp(resolve(output, 'fixture-'));
let browser;
try {
    const entry = resolve(temp, 'fixture.tsx');
    await writeFile(entry, `
import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MatchLayout } from ${JSON.stringify(resolve(root, 'src/components/MatchLayout.tsx'))};
import { useMoveHint } from ${JSON.stringify(resolve(root, 'src/hooks/useMoveHint.ts'))};
const noop = () => {};
const move = {fromRow:6,fromCol:4,toRow:4,toCol:4};
function Fixture() {
    const [position, setPosition] = useState(0);
    const hint = useMoveHint('white:' + position);
    const control = useRef({requests:0, resolve:null, reject:null, signal:null, saved:null});
    useEffect(() => {
        window.qubeFixture = {
            get requests() {return control.current.requests;},
            get aborted() {return control.current.signal?.aborted;},
            complete() {control.current.resolve?.(move);},
            fail() {control.current.reject?.(new Error('Fixture search failed'));},
            changePosition() {setPosition(value => value + 1);},
            setPosition(value) {setPosition(value);},
            saveReply() {const {resolve,reject,signal}=control.current;control.current.saved={resolve,reject,signal};},
            completeSaved() {control.current.saved?.resolve?.(move);},
            failSaved() {control.current.saved?.reject?.(new Error('Old fixture search failed'));},
            get savedAborted() {return control.current.saved?.signal.aborted;}
        };
    }, []);
    return <MatchLayout lang="en" mode="CPU fixture" white={{name:'Guest',clock:'10:00'}} black={{name:'CPU',clock:'10:00'}}
        bottomSide="white" currentTurn="white" finished={false}
        tokens={[{id:'white_1',player:'white',row:6,col:4,probabilities:{King:1,Queen:1,Rook:1,Bishop:1,Knight:1,Pawn:1}}]}
        selectedTokenId={null} history={[]} validMoveCount={16} onClearSelection={noop} is2D={true}
        onViewChange={noop} onResetView={noop} onHome={noop} onRules={noop} onResign={noop}
        showMoveHints={true} onHintsChange={noop} hintPending={hint.pending} hintMove={hint.hintMove}
        hintFailed={hint.failed} onClearHint={hint.clear}
        onHint={() => hint.request(signal => new Promise((resolve,reject) => {
            control.current.requests++; Object.assign(control.current,{resolve,reject,signal});
        }))}
        board={<div data-fixture-position={position} style={{height:'100%',background:'repeating-conic-gradient(#363f32 0% 25%, #88917c 0% 50%) 0 / 25% 25%'}} aria-label="Static fixture board"/>}/>;
}
createRoot(document.getElementById('root')).render(<Fixture/>);
`);
    const built = await build({root, configFile:false, logLevel:'error',
        define:{'process.env.NODE_ENV':JSON.stringify('production')},
        build:{write:false, minify:false, lib:{entry, name:'QubeLoadingFixture', formats:['iife']}}});
    const files = (Array.isArray(built) ? built : [built]).flatMap(value => value.output);
    const script = files.filter(file => file.type === 'chunk').map(file => file.code).join('\n');
    const css = files.filter(file => file.type === 'asset' && file.fileName.endsWith('.css')).map(file => String(file.source)).join('\n');
    assert(script && css, 'The actual component and its styles must be bundled');
    if (process.argv.includes('--build-only')) {
        console.log('PASS: isolated fixture bundle built; browser checks were not run');
    } else {
        const icon = await readFile(resolve(root, 'public/qube_icon.jpg'));
        browser = await chromium.launch({headless:true, executablePath:process.env.QUBE_QA_CHROMIUM_EXECUTABLE || undefined});
        for (const width of [390,1280]) {
            const context = await browser.newContext({viewport:{width,height:900}, reducedMotion:'no-preference', serviceWorkers:'block'});
            const blocked = [], errors = [];
            // Every request is intercepted. The single static icon is fulfilled from disk.
            // Never continue a request, even if a future import adds external behavior.
            await context.route('**/*', route => {
                if (route.request().url() === 'https://qube-fixture.invalid/qube_icon.jpg') {
                    return route.fulfill({contentType:'image/jpeg',body:icon});
                }
                blocked.push(route.request().url()); return route.abort();
            });
            await context.routeWebSocket('**/*', socket => socket.close());
            const page = await context.newPage();
            page.on('pageerror', error => errors.push(error.message));
            await page.setContent('<!doctype html><html><head><base href="https://qube-fixture.invalid/"></head><body style="margin:0"><div id="root"></div></body></html>');
            await page.addStyleTag({content:css});
            await page.addScriptTag({content:script});
            await page.waitForFunction(() => !!window.qubeFixture);
            const status = page.locator('[data-hint-status]');
            const button = page.locator('.match-hint-action');
            const pulse = page.locator('.qube-icon');
            const idle = async () => {
                await page.waitForFunction(() => document.querySelector('.match-hint-action')?.getAttribute('aria-busy') === 'false');
                assert.equal(await button.isDisabled(),false);
            };
            const pending = async () => {
                await button.click();
                await page.waitForFunction(() => document.querySelector('.match-hint-action')?.getAttribute('aria-busy') === 'true');
                assert.equal(await button.isDisabled(),true);
                assert.equal(await page.getByRole('button',{name:'QUBE is thinking…',exact:true}).count(),1);
                assert.equal(await status.getAttribute('aria-busy'),null,'The live status must not defer its announcement');
                assert.ok((await status.innerText()).includes('QUBE is thinking…'));
                assert.equal(await pulse.getAttribute('alt'),'');
                assert.equal(await pulse.getAttribute('aria-hidden'),'true');
            };
            const goToPosition = async value => {
                await page.evaluate(value => window.qubeFixture.setPosition(value),value);
                await page.waitForFunction(value => document.querySelector('[data-fixture-position]')?.getAttribute('data-fixture-position') === String(value),value);
                await page.evaluate(() => new Promise(requestAnimationFrame));
            };
            assert.equal(await status.textContent(),'','The live region already exists while idle');
            await idle();
            await pending();
            await button.evaluate(node => {node.click();node.click();});
            assert.equal(await page.evaluate(() => window.qubeFixture.requests),1,'Repeated clicks must not start another request');
            const firstFrame = await pulse.evaluate(node => ({transform:getComputedStyle(node).transform,
                time:node.getAnimations()[0]?.currentTime, name:getComputedStyle(node).animationName}));
            assert.equal(firstFrame.name,'qube-pulse');
            await page.waitForFunction(({transform,time}) => {
                const icon = document.querySelector('.qube-icon');
                return icon.getAnimations()[0]?.currentTime > time && getComputedStyle(icon).transform !== transform;
            }, firstFrame);
            assert.ok(await page.evaluate(() => document.querySelector('.match-layout').scrollWidth <= innerWidth), 'No horizontal layout overflow');
            await page.screenshot({path:resolve(output,`pending-${width}.png`),fullPage:true});
            await page.emulateMedia({reducedMotion:'reduce'});
            assert.equal(await pulse.evaluate(node => getComputedStyle(node).animationName),'none');
            assert.equal(await pulse.evaluate(node => node.getAnimations().length),0,'Reduced motion stops the infinite loop');
            assert.ok((await status.innerText()).includes('QUBE is thinking…'),'Reduced motion preserves feedback');
            await page.evaluate(() => window.qubeFixture.complete());
            await idle();
            assert.equal(await page.getByTestId('hint-source').innerText(),'e2');
            assert.equal(await page.getByTestId('hint-destination').innerText(),'e4');
            await page.getByRole('button',{name:'Dismiss hint',exact:true}).click();
            assert.equal(await status.textContent(),'');
            await pending();
            await page.evaluate(() => window.qubeFixture.fail());
            await idle();
            assert.ok((await status.innerText()).includes('Hint unavailable. Please try again.'));
            await pending();
            await page.getByRole('button',{name:'Dismiss hint',exact:true}).click();
            assert.equal(await page.evaluate(() => window.qubeFixture.aborted),true);
            await page.evaluate(() => window.qubeFixture.complete());
            await page.evaluate(() => new Promise(requestAnimationFrame));
            await idle();
            assert.equal(await status.textContent(),'','A dismissed late reply must stay hidden');
            await pending();
            await page.evaluate(() => window.qubeFixture.changePosition());
            await idle();
            assert.equal(await page.evaluate(() => window.qubeFixture.aborted),true);
            await page.evaluate(() => window.qubeFixture.complete());
            await page.evaluate(() => new Promise(requestAnimationFrame));
            await idle();
            assert.equal(await status.textContent(),'','A late reply must not annotate a newer position');
            // Reusing a key must not revive an aborted pending request, regardless of
            // whether its worker settles before or after returning to that position.
            for (const timing of ['before-return','after-return']) {
                await goToPosition(2);
                await pending();
                await page.evaluate(() => window.qubeFixture.saveReply());
                await goToPosition(3);
                await idle();
                assert.equal(await page.evaluate(() => window.qubeFixture.savedAborted),true);
                if (timing === 'before-return') {
                    await page.evaluate(() => window.qubeFixture.completeSaved());
                    await page.evaluate(() => new Promise(requestAnimationFrame));
                }
                await goToPosition(2);
                await idle();
                assert.equal(await status.textContent(),'',`A reused key stays idle (${timing})`);
                if (timing === 'after-return') {
                    await page.evaluate(() => window.qubeFixture.completeSaved());
                    await page.evaluate(() => new Promise(requestAnimationFrame));
                }
                await idle();
                assert.equal(await status.textContent(),'','An aborted result remains hidden on the reused key');
            }
            for (const outcome of ['completeSaved','failSaved']) {
                await goToPosition(4);
                await pending();
                await page.evaluate(() => window.qubeFixture.saveReply());
                await goToPosition(5);
                await idle();
                await goToPosition(4);
                await idle();
                await pending();
                await page.evaluate(outcome => window.qubeFixture[outcome](),outcome);
                await page.evaluate(() => new Promise(requestAnimationFrame));
                assert.equal(await button.getAttribute('aria-busy'),'true','An old reply must not clear the replacement request');
                assert.equal(await button.isDisabled(),true);
                assert.ok((await status.innerText()).includes('QUBE is thinking…'));
                assert.equal(await page.getByTestId('hint-source').count(),0);
                await page.evaluate(() => window.qubeFixture.complete());
                await idle();
                assert.equal(await page.getByTestId('hint-source').innerText(),'e2');
                assert.equal(await page.getByTestId('hint-destination').innerText(),'e4');
                await page.getByRole('button',{name:'Dismiss hint',exact:true}).click();
            }
            assert.deepEqual(blocked,[],'No backend, auth, ad, or payment requests are expected');
            assert.deepEqual(errors,[],'No browser runtime errors');
            console.log(`PASS: QUBE loading, disabled repeat, status/busy, animation/reduced motion, success/failure/dismiss/new position/key reuse/replacement request at ${width}px`);
            await context.close();
        }
    }
} finally {
    await browser?.close();
    await rm(temp,{recursive:true,force:true});
}
