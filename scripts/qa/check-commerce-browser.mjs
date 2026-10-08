import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { chromium } from 'playwright';
import { checkCommerceExport } from './check-commerce-export.mjs';
const [salesFlag='--sales=off', artifactDirectory='scratch/release-20261007', ...extraArgs] = process.argv.slice(2);
assert.ok(/^--sales=(on|off)$/.test(salesFlag) && extraArgs.length === 0, 'Usage: check-commerce-browser.mjs [--sales=on|off] [artifact-directory]');
const sales = salesFlag.slice('--sales='.length);
const root = resolve('out');
const types = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml', '.jpg':'image/jpeg', '.png':'image/png', '.woff2':'font/woff2' };
const server = createServer(async (req,res) => {
    const pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
    const file = resolve(root, '.' + pathname + (pathname.endsWith('/') ? 'index.html' : ''));
    if (!file.startsWith(root + sep)) {res.writeHead(403).end();return;}
    try {const ext = Object.keys(types).find(ext=>file.endsWith(ext));res.setHeader('Content-Type',types[ext] ?? 'application/octet-stream');res.end(await readFile(file));}
    catch {res.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
    browser = await chromium.launch({headless:true});
    for (const width of [390,1280]) {
        const page=await browser.newPage({viewport:{width,height:844}});
        await page.route('**/*',route=>new URL(route.request().url()).origin===origin
            ? route.continue() : route.fulfill({status:503,json:{code:'QA_EXTERNAL_BLOCKED'}}));
        const errors=[];page.on('pageerror',error=>errors.push(error.message));
        await page.goto(origin+'/commerce/',{waitUntil:'networkidle'});
        const article=page.locator('[data-commerce-disclosure]');
        assert.equal(await article.getAttribute('data-commerce-sales'),sales === 'on' ? 'open' : 'closed');
        checkCommerceExport('web',sales,await article.evaluate(element=>element.outerHTML));
        const text=await article.innerText();
        assert.ok(text.includes('USD 2.99'),'Legacy contract remains disclosed');
        assert.ok(text.includes('$3.00') && text.includes('$6.00'),'New product prices are correctly rendered');
        assert.equal(text.includes('現在、新規購入は受け付けていません。'),sales === 'off','New sales match the reviewed configuration');
        assert.equal(await page.locator('a[href*="checkout.stripe.com"],a[href*="billing.stripe.com"]').count(),0);
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal overflow');
        assert.deepEqual(errors,[],'No browser runtime errors');
        await mkdir(artifactDirectory,{recursive:true});
        await page.screenshot({path:resolve(artifactDirectory,`commerce-${sales}-${width}.png`),fullPage:true});
        await page.locator('select').selectOption('en');
        const english = await article.innerText();
        assert.equal(english.includes('New products (not on sale)'),sales === 'off');
        assert.ok(english.includes('One-time hint packs:') && english.includes('Charged once at purchase. No automatic renewal.'));
        assert.ok(english.includes('Existing legacy membership') && english.includes('USD 2.99/month'));
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'English page has no horizontal overflow');
        assert.deepEqual(errors,[],'No browser runtime errors after language switch');
        await page.close();
    }
    console.log(`PASS: desktop/mobile Japanese/English commerce page; sales ${sales}, all products and legacy contract, no overflow/runtime errors`);
} finally {await browser?.close();await new Promise(resolve=>server.close(resolve));}
