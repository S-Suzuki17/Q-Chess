import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { chromium } from 'playwright';
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
        const errors=[];page.on('pageerror',error=>errors.push(error.message));
        await page.goto(origin+'/commerce/',{waitUntil:'networkidle'});
        const article=page.locator('[data-commerce-disclosure]');
        assert.equal(await article.getAttribute('data-commerce-sales'),'closed');
        const text=await article.innerText();
        assert.ok(text.includes('USD 2.99'),'Legacy contract remains disclosed');
        assert.ok(text.includes('$3.00') && text.includes('$6.00'),'Planned prices are correctly rendered');
        assert.ok(text.includes('現在、新規購入は受け付けていません。'),'New sales stay closed');
        assert.equal(await page.locator('a[href*="checkout.stripe.com"],a[href*="billing.stripe.com"]').count(),0);
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal overflow');
        assert.deepEqual(errors,[],'No browser runtime errors');
        await mkdir('scratch/release-20261006',{recursive:true});
        await page.screenshot({path:`scratch/release-20261006/commerce-${width}.png`,fullPage:true});
        await page.close();
    }
    console.log('PASS: desktop/mobile static commerce page; unavailable products, legacy contract, no overflow/runtime errors');
} finally {await browser?.close();await new Promise(resolve=>server.close(resolve));}
