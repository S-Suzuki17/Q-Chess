import { readFileSync, existsSync } from 'node:fs';
import assert from 'node:assert/strict';
import {SEARCH_ROUTES, checkSearchMetadata, checkSearchFiles} from './search-metadata.mjs';

// Local output only. Does not contact Google or enable any advertising.
for (const publicRoute of SEARCH_ROUTES) {
    const route = publicRoute.replace(/^\/|\/$/g, '');
    const html = readFileSync(`out/${route ? `${route}/` : ''}index.html`, 'utf8');
    assert.doesNotMatch(html, /QUBIT4x|devDiaryTweets|開発AIのぼやき部屋|href=["']\/updates\/?["']/i, route);
    const head = html.split('</head>')[0];
    checkSearchMetadata(html, `/${route ? `${route}/` : ''}`);
    assert.match(head, /name="google-adsense-account" content="ca-pub-1116866075179199"/, route);
    assert.doesNotMatch(html, /<script[^>]*src=["'][^"']*(?:googlesyndication|googleadservices|doubleclick)/i, route);
    if (route) {
        assert.ok(head.includes(`href="https://q-gambit.com/${route}/"`), `${route}: canonical`);
        assert.ok(head.includes('user-scalable=yes'), `${route}: text zoom`);
    }
}
checkSearchFiles(readFileSync('out/robots.txt', 'utf8'), readFileSync('out/sitemap.xml', 'utf8'));
for (const route of ['teaser', 'teaser2', '_teaser', '_teaser2', 'updates']) {
    assert.equal(existsSync(`out/${route}/index.html`), false, `${route} must not be exported`);
}
assert.match(readFileSync('out/about/index.html', 'utf8'), /data-about-article/);
for (const route of ['guide', 'faq']) {
    const html = readFileSync(`out/${route}/index.html`, 'utf8');
    assert.match(html, new RegExp(`data-learning-article="${route}"`), `${route}: article must exist in initial HTML`);
    assert.match(html, /href="\/(?:guide|faq)\/"/, `${route}: connected learning pages`);
}
assert.match(readFileSync('out/ads.txt', 'utf8'), /^google\.com, pub-1116866075179199, DIRECT, f08c47fec0942fa0\s*$/);
assert.match(readFileSync('out/sitemap.xml', 'utf8'), /https:\/\/q-gambit\.com\/terms\//);
assert.doesNotMatch(readFileSync('out/robots.txt', 'utf8'), /Disallow:\s*\/(?:\s|$|teaser)/);
console.log(`Web review guard passed: ${SEARCH_ROUTES.length} public pages; ownership retained; no ad SDK; recording routes excluded.`);
