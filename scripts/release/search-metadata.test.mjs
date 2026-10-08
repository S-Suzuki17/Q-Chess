import {test} from 'node:test';
import assert from 'node:assert/strict';
import {checkSearchMetadata, checkSearchFiles, SEARCH_ROUTES} from './search-metadata.mjs';

const page = (url, extra = '') => `<html><head><meta name="robots" content="index, follow"><link rel="canonical" href="${url}">${extra}</head><body></body></html>`;

test('accepts a self-canonical .com URL on each public page', () => {
    for (const route of SEARCH_ROUTES) assert.doesNotThrow(() => checkSearchMetadata(page(`https://q-gambit.com${route}`), route));
});
test('rejects missing, duplicate, alternate-host and wrong-page canonicals', () => {
    assert.throws(() => checkSearchMetadata('<head><meta property="og:url" content="https://q-gambit.com/"></head>', '/'), /exactly one/);
    assert.throws(() => checkSearchMetadata(page('https://q-gambit.com/', '<link rel="canonical" href="https://q-gambit.com/">'), '/'), /exactly one/);
    for (const url of ['https://q-chess-w8rg.vercel.app/', 'https://q-gambit-web.pages.dev/', 'https://www.q-gambit.com/', 'http://q-gambit.com/']) {
        assert.throws(() => checkSearchMetadata(page(url), '/'), /public .com/);
    }
    assert.throws(() => checkSearchMetadata(page('https://q-gambit.com/'), '/about/'), /public .com/);
});
test('requires metadata in the initial head and refuses noindex for public content', () => {
    assert.throws(() => checkSearchMetadata('<head></head><body><link rel="canonical" href="https://q-gambit.com/"></body>', '/'), /exactly one/);
    assert.throws(() => checkSearchMetadata(page('https://q-gambit.com/', '<meta name="googlebot" content="noindex">'), '/'), /indexable/);
});
test('requires a crawlable sitemap with only the canonical public URLs', () => {
    const robots = 'User-agent: *\nAllow: /\nSitemap: https://q-gambit.com/sitemap.xml\n';
    const sitemap = `<urlset>${SEARCH_ROUTES.map(route => `<url><loc>https://q-gambit.com${route}</loc></url>`).join('')}</urlset>`;
    assert.doesNotThrow(() => checkSearchFiles(robots, sitemap));
    assert.throws(() => checkSearchFiles(`${robots}Disallow: /\n`, sitemap), /block/);
    assert.throws(() => checkSearchFiles(robots, sitemap.replace('https://q-gambit.com/', 'https://q-chess-w8rg.vercel.app/')));
    assert.throws(() => checkSearchFiles(robots, `${sitemap}<loc>https://q-gambit.com/</loc>`), /repeat/);
});
