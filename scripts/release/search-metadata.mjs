import assert from 'node:assert/strict';

export const SEARCH_ORIGIN = 'https://q-gambit.com';
export const SEARCH_ROUTES = ['/', '/about/', '/rules/', '/guide/', '/faq/', '/contact/', '/privacy/', '/terms/'];

/** Inspect the initial HTML, not client-side metadata or an Open Graph URL. */
export function checkSearchMetadata(html, route) {
    const head = html.split('</head>')[0];
    const links = [...head.matchAll(/<link\b[^>]*>/gi)].map(match => match[0]);
    const canonicals = links.filter(link => /\brel=["']canonical["']/i.test(link));
    assert.equal(canonicals.length, 1, `${route}: exactly one initial-HTML canonical required`);
    const href = /\bhref=["']([^"']+)["']/i.exec(canonicals[0])?.[1];
    assert.equal(href, new URL(route, SEARCH_ORIGIN).href, `${route}: canonical must match the public .com URL`);
    const directives = [...head.matchAll(/<meta\b[^>]*>/gi)].map(match => match[0])
        .filter(tag => /\bname=["'](?:robots|googlebot)["']/i.test(tag));
    assert.ok(directives.some(tag => /\bname=["']robots["']/i.test(tag)), `${route}: robots metadata required`);
    for (const tag of directives) {
        const content = /\bcontent=["']([^"']*)["']/i.exec(tag)?.[1] ?? '';
        assert.ok(!/\b(?:noindex|none)\b/i.test(content), `${route}: public content must remain indexable`);
    }
}

export function checkSearchFiles(robots, sitemap) {
    assert.match(robots, /^Sitemap:\s*https:\/\/q-gambit\.com\/sitemap\.xml\s*$/mi);
    assert.doesNotMatch(robots, /^Disallow:\s*\/\s*$/mi, 'Do not block the public site');
    const locations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]);
    assert.equal(new Set(locations).size, locations.length, 'Sitemap URLs must not repeat');
    assert.deepEqual(locations.slice().sort(), SEARCH_ROUTES.map(route => new URL(route, SEARCH_ORIGIN).href).sort());
}
