import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const target = process.argv[2];
assert.ok(['web','android'].includes(target), 'Specify web or android');
const html = await readFile(process.argv[3] ?? new URL('../../out/commerce/index.html', import.meta.url), 'utf8');
// Ignore serialized React data/scripts; this is the actual prerendered document body.
const markup = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
if (target === 'web') {
    assert.ok(markup.includes('data-commerce-disclosure'));
    assert.ok(markup.includes('鈴木 壮太'));
    assert.ok(markup.includes('内宿台2-184-1'));
    assert.ok(markup.includes('070-7660-1602'));
    assert.ok(markup.includes('qgambit970@gmail.com'));
    assert.ok(markup.includes('現在、新規購入は受け付けていません。'));
    assert.ok(markup.includes('2.99'));
} else {
    assert.ok(!markup.includes('data-commerce-disclosure'));
    assert.ok(!markup.includes('鈴木 壮太'));
    assert.ok(!markup.includes('070-7660-1602'));
}
assert.ok(!/<a\b[^>]*href=["'][^"']*(?:checkout\.stripe\.com|billing\.stripe\.com|q-gambit\.com\/commerce)/i.test(markup));
assert.ok(!/生年月日|acct_/.test(markup));
console.log(`PASS: ${target} commerce export; approved fields/Web sales OFF or Android commercial content absent; no payment link.`);
