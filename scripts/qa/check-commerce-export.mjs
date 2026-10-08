import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

/** Inspect prerendered markup, ignoring serialized React data/scripts. */
export function checkCommerceExport(target, sales, html) {
    assert.ok(['web','android'].includes(target), 'Specify web or android');
    assert.ok(['on','off'].includes(sales), 'Explicit --sales=on or --sales=off is required');
    assert.ok(target !== 'android' || sales === 'off', 'Android sales must be off');
    const markup = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
    if (target === 'web') {
        for (const expected of ['data-commerce-disclosure','鈴木 壮太','内宿台2-184-1','070-7660-1602','qgambit970@gmail.com','2.99']) {
            assert.ok(markup.includes(expected), `Missing Web disclosure: ${expected}`);
        }
        const closed = '現在、新規購入は受け付けていません。';
        assert.ok(markup.includes(`data-commerce-sales="${sales === 'on' ? 'open' : 'closed'}"`), 'Sales marker does not match requested configuration');
        assert.equal(markup.includes(closed), sales === 'off', 'Sales availability text does not match requested configuration');
        assert.equal(markup.includes('新商品（販売準備中）'), sales === 'off', 'Catalog heading must agree with sales readiness');
        assert.ok(markup.includes('data-legacy-commerce-terms'), 'Legacy terms must be explicitly scoped');
        const products = [...markup.matchAll(/<li\b[^>]*data-commerce-sku=["']([^"']+)["'][^>]*>([\s\S]*?)<\/li>/g)];
        const catalog = [
            ['standard_monthly','3.00',null], ['plus_monthly','6.00',null],
            ['hints_1','1.00',1], ['hints_13','10.00',13], ['hints_27','20.00',27],
            ['hints_44','30.00',44], ['hints_77','50.00',77], ['hints_166','100.00',166],
        ];
        assert.deepEqual(products.map(match => match[1]), catalog.map(([sku]) => sku), 'All eight approved products must appear exactly once');
        for (const [sku, total, hints] of catalog) {
            const body = products.find(match => match[1] === sku)[2];
            assert.ok(body.includes(`USD $${total}`), `${sku}: wrong or missing final price`);
            if (hints !== null) assert.ok(body.includes(`QUBEヒント ${hints}枚`), `${sku}: wrong hint quantity`);
        }
    } else {
        assert.ok(!/data-commerce-(?:disclosure|sales)|鈴木 壮太|内宿台2-184-1|070-7660-1602|2\.99|Q-Gambit Plus|USD/.test(markup), 'Android must have no sales disclosure or price');
    }
    assert.ok(!/<a\b[^>]*href=["'][^"']*(?:checkout\.stripe\.com|billing\.stripe\.com|(?:https?:\/\/q-gambit\.com)?\/commerce(?:\/|["'?#]))/i.test(markup), 'No external payment or commerce link');
    assert.ok(!/生年月日|acct_/.test(markup), 'No private seller/payment fields');
}

export function parseCommerceExportArgs(args) {
    const [target, flag, htmlPath, ...extra] = args;
    assert.ok(['web','android'].includes(target), 'Specify web or android');
    assert.ok(/^--sales=(on|off)$/.test(flag ?? ''), 'Usage: check-commerce-export.mjs <web|android> --sales=<on|off> [html-path]');
    assert.equal(extra.length, 0, 'Unexpected export-check argument');
    const sales = flag.slice('--sales='.length);
    assert.ok(target !== 'android' || sales === 'off', 'Android sales must be off');
    return { target, sales, htmlPath };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const { target, sales, htmlPath } = parseCommerceExportArgs(process.argv.slice(2));
    checkCommerceExport(target, sales, await readFile(htmlPath ?? new URL('../../out/commerce/index.html', import.meta.url), 'utf8'));
    console.log(`PASS: ${target} commerce export, sales ${sales}; disclosure/price boundary and no payment link.`);
}
