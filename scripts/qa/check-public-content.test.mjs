import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contentDigest, inspectPublicPage, inspectInternalLinks, checkPublicSite } from './check-public-content.mjs';
import { SEARCH_ROUTES, SEARCH_ORIGIN } from '../release/search-metadata.mjs';

function page(route) {
  const guide = ['start', 'candidates', 'decisions', 'outcomes', 'practice', 'chain'].map(id => `<section id="${id}">Explanation</section>`).join('');
  const faq = ['guest', 'identity', 'move', 'win', 'clock', 'hints', 'connection', 'save', 'privacy'].map(id => `<details id="${id}" data-learning-faq><summary>Question</summary><p>Answer</p></details>`).join('');
  const article = route === '/guide/' ? `<article data-learning-article="guide">${guide}<div data-learning-exercise>Exercise</div><figure data-learning-chain>Example</figure></article>` : route === '/faq/' ? `<article data-learning-article="faq">${faq}</article>` : route === '/about/' ? '<article data-about-article>About</article>' : 'Public information';
  return `<html><head><link rel="canonical" href="${SEARCH_ORIGIN}${route}"><meta name="robots" content="index, follow"></head><body>${article}<a href="/guide/">Guide</a><a href="/faq/">FAQ</a></body></html>`;
}
test('the existing public pages, native answers and navigation pass', () => {
  for (const route of SEARCH_ROUTES) assert.equal(inspectPublicPage({ html: page(route), route }).ok, true, route);
});
test('HTTP, index headers and wrong canonical URLs are actionable', () => {
  assert.equal(inspectPublicPage({ html: page('/'), route: '/', status: 404 }).ok, false);
  assert.equal(inspectPublicPage({ html: page('/'), route: '/', headerRobots: 'noindex' }).ok, false);
  assert.equal(inspectPublicPage({ html: page('/').replace('q-gambit.com', 'wrong.example'), route: '/' }).ok, false);
  assert.equal(inspectPublicPage({ html: page('/').replace('index, follow', 'noindex'), route: '/' }).ok, false);
});
test('initial article, exercise and chain removal are detected', () => {
  for (const marker of ['data-learning-article', 'data-learning-exercise', 'data-learning-chain']) assert.equal(inspectPublicPage({ html: page('/guide/').replaceAll(marker, 'removed'), route: '/guide/' }).ok, false, marker);
});
test('FAQ topics cannot disappear silently', () => {
  const result = inspectPublicPage({ html: page('/faq/').replace('id="hints"', 'id="other"'), route: '/faq/' });
  assert.equal(result.ok, false); assert.ok(result.problems.some(problem => problem.includes('#hints')));
});
test('the QUBE presentation is required only after its release has been confirmed', () => {
  assert.equal(inspectPublicPage({html: page('/guide/'), route: '/guide/', requireQube: true}).ok, false);
  assert.equal(inspectPublicPage({html: page('/guide/') + '<div data-qube-teacher><span data-qube-speaker>QUBE</span></div>', route: '/guide/', requireQube: true}).ok, true);
});
test('public navigation, premature ads and retired diaries are checked', () => {
  for (const html of [page('/').replace('href="/faq/"', 'href="/missing/"'), page('/') + '<script src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js"></script>', page('/') + '<a href="/updates/">Diary</a>']) assert.equal(inspectPublicPage({ html, route: '/' }).ok, false);
});
test('cross-page and same-page anchors must resolve; external links and protected email are excluded', () => {
  const pages = SEARCH_ROUTES.map(route => ({ route, html: page(route) }));
  pages[0].html += '<a href="/guide/#start">Start</a><a href="https://external.example/path">External</a><a href="/cdn-cgi/l/email-protection#abc">Email</a>';
  assert.deepEqual(inspectInternalLinks(pages), []);
  pages[0].html += '<a href="/faq/#gone">Broken</a><a href="/gone/">Missing</a>';
  assert.equal(inspectInternalLinks(pages).length, 2);
  pages[0].html += '<a href="/guide/#%invalid">Malformed</a>';
  assert.equal(inspectInternalLinks(pages).length, 3);
});
test('script fingerprints and email masking do not create false editorial changes', () => {
  const first = page('/') + '<script src="/chunk-a.js">a</script><a href="/cdn-cgi/l/email-protection#aaa">[email protected]</a>';
  const second = page('/') + '<script src="/chunk-b.js">b</script><a href="/cdn-cgi/l/email-protection#bbb">[email protected]</a>';
  assert.equal(contentDigest(first), contentDigest(second));
  assert.notEqual(contentDigest(first), contentDigest(first.replace('Public information', 'Updated public information')));
});
test('the full HTTP check retries transport errors and reports unavailable pages distinctly', async () => {
  const fetchBefore = globalThis.fetch;
  const attempts = new Map();
  try {
    globalThis.fetch = async url => {
      const route = new URL(url).pathname;
      attempts.set(route, (attempts.get(route) || 0) + 1);
      if (route === '/guide/') throw new Error('Network unavailable');
      if (route === '/faq/' && attempts.get(route) === 1) throw new Error('Transient network failure');
      if (route === '/robots.txt') return new Response(`Sitemap: ${SEARCH_ORIGIN}/sitemap.xml\n`);
      if (route === '/sitemap.xml') return new Response('<urlset>' + SEARCH_ROUTES.map(route => `<url><loc>${SEARCH_ORIGIN}${route}</loc></url>`).join('') + '</urlset>');
      return new Response(page(route), { headers: { 'content-type': 'text/html' } });
    };
    const result = await checkPublicSite();
    assert.equal(result.ok, false);
    assert.equal(attempts.get('/guide/'), 2); assert.equal(attempts.get('/faq/'), 2);
    assert.equal(result.results.find(page => page.route === '/guide/').category, 'fetch-failure');
    assert.equal(result.results.find(page => page.route === '/faq/').ok, true);
  } finally { globalThis.fetch = fetchBefore; }
});

test('only the exact verified screenshot is accepted as an internal asset link', () => {
  const asset = '/previews/game-screen-sample.png';
  const pages = SEARCH_ROUTES.map(route => ({ route, html: page(route) }));
  pages[0].html += `<a href="${asset}">Full size</a>`;
  assert.equal(inspectInternalLinks(pages).length, 1, 'unverified known asset must fail');
  assert.deepEqual(inspectInternalLinks(pages, SEARCH_ORIGIN, [asset]), []);
  pages[0].html += '<a href="/missing.png">Missing image</a><a href="/gone/">Missing page</a>';
  assert.equal(inspectInternalLinks(pages, SEARCH_ORIGIN, [asset, '/missing.png']).length, 2);
  pages[0].html += `<a href="${asset}#missing">Invalid asset anchor</a><a href="${asset}?unknown=1">Unverified variant</a>`;
  assert.equal(inspectInternalLinks(pages, SEARCH_ORIGIN, [asset]).length, 3); // Duplicate unverified asset paths are reported once.
});

test('the HTTP check verifies a linked screenshot and rejects missing or non-image responses', async () => {
  const fetchBefore = globalThis.fetch;
  const asset = '/previews/game-screen-sample.png';
  try {
    for (const [status, contentType, passes] of [[200, 'image/png', true], [404, 'image/png', false], [200, 'text/html', false]]) {
      let assetRequests = 0;
      globalThis.fetch = async (url, options) => {
        const route = new URL(url).pathname;
        if (route === asset) {
          assetRequests++;
          assert.equal(options.method, 'HEAD');
          return new Response(null, { status, headers: { 'content-type': contentType } });
        }
        if (route === '/robots.txt') return new Response(`Sitemap: ${SEARCH_ORIGIN}/sitemap.xml\n`);
        if (route === '/sitemap.xml') return new Response('<urlset>' + SEARCH_ROUTES.map(route => `<url><loc>${SEARCH_ORIGIN}${route}</loc></url>`).join('') + '</urlset>');
        const html = page(route) + (route === '/' ? `<a href="${asset}">Full size</a>` : '');
        return new Response(html, { headers: { 'content-type': 'text/html' } });
      };
      const result = await checkPublicSite();
      assert.equal(assetRequests, 1);
      assert.equal(result.ok, passes, JSON.stringify(result.problems));
      if (!passes) assert.ok(result.problems.some(problem => problem.includes(asset)));
    }
  } finally { globalThis.fetch = fetchBefore; }
});
