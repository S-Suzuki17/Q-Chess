import { readFileSync, existsSync } from 'node:fs';
import assert from 'node:assert/strict';

// Local output only. Does not contact Google or enable any advertising.
for (const route of ['', 'about', 'rules', 'contact', 'privacy', 'terms', 'updates']) {
    const html = readFileSync(`out/${route ? `${route}/` : ''}index.html`, 'utf8');
    const head = html.split('</head>')[0];
    assert.match(head, /name="google-adsense-account" content="ca-pub-1116866075179199"/, route);
    assert.doesNotMatch(html, /<script[^>]*src=["'][^"']*(?:googlesyndication|googleadservices|doubleclick)/i, route);
    if (route) {
        assert.ok(head.includes(`href="https://q-gambit.com/${route}/"`), `${route}: canonical`);
        assert.ok(head.includes('user-scalable=yes'), `${route}: text zoom`);
    }
}
for (const route of ['teaser', 'teaser2', '_teaser', '_teaser2']) {
    assert.equal(existsSync(`out/${route}/index.html`), false, `${route} must not be exported`);
}
assert.match(readFileSync('out/about/index.html', 'utf8'), /data-about-article/);
assert.match(readFileSync('out/updates/index.html', 'utf8'), /猫、箱に入るだけ/);
assert.match(readFileSync('out/ads.txt', 'utf8'), /^google\.com, pub-1116866075179199, DIRECT, f08c47fec0942fa0\s*$/);
assert.match(readFileSync('out/sitemap.xml', 'utf8'), /https:\/\/q-gambit\.com\/terms\//);
assert.doesNotMatch(readFileSync('out/robots.txt', 'utf8'), /Disallow:\s*\/(?:\s|$|teaser)/);
console.log('Web review guard passed: 7 public pages; ownership retained; no ad SDK; recording routes excluded.');
