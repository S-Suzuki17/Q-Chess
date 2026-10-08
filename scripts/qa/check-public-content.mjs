import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SEARCH_ORIGIN, SEARCH_ROUTES, checkSearchMetadata, checkSearchFiles } from '../release/search-metadata.mjs';

const GUIDE_IDS = ['start', 'candidates', 'decisions', 'outcomes', 'practice', 'chain'];
const FAQ_IDS = ['guest', 'identity', 'move', 'win', 'clock', 'hints', 'connection', 'save', 'privacy'];
const hrefs = html => [...html.matchAll(/<a\b[^>]*\bhref=["']([^"']+)["']/gi)].map(match => match[1].replaceAll('&amp;', '&'));
const ids = html => new Set([...html.matchAll(/\bid=["']([^"']+)["']/gi)].map(match => match[1]));
const errorMessage = error => error.message.split('\n')[0];
const GAME_PREVIEW_ASSET = '/previews/game-screen-sample.png';

export function contentDigest(html) {
  // Deployment scripts and Cloudflare's changing email-obfuscation token are not editorial changes.
  const text = html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '').replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const links = [...new Set(hrefs(html).filter(href => !href.startsWith('/cdn-cgi/l/email-protection')))].sort();
  return createHash('sha256').update(JSON.stringify({ text, links })).digest('hex');
}

export function inspectPublicPage({ html, route, status = 200, headerRobots = '', contentType = 'text/html', requireQube = false }) {
  const problems = [];
  const require = (condition, message) => { if (!condition) problems.push(message); };
  require(status === 200, `HTTP ${status}; expected 200`);
  require(/text\/html/i.test(contentType), 'Public page must return HTML');
  try { checkSearchMetadata(html, route); } catch (error) { problems.push(errorMessage(error)); }
  require(!/\b(?:noindex|none)\b/i.test(headerRobots), 'X-Robots-Tag blocks indexing');
  require(!/QUBIT4x|devDiaryTweets|開発AIのぼやき部屋|href=["']\/updates\/?["']/i.test(html), 'Retired development diary reappeared');
  require(!/<script\b[^>]*src=["'][^"']*(?:googlesyndication|googleadservices|doubleclick)/i.test(html), 'Advertising SDK enabled before the agreed review');
  const links = hrefs(html);
  for (const target of ['/guide/', '/faq/']) require(links.includes(target), `Missing navigation to ${target}`);
  const pageIds = ids(html);
  if (route === '/guide/' || route === '/faq/') {
    const kind = route.slice(1, -1);
    require(new RegExp(`data-learning-article=["']${kind}["']`).test(html), `${kind}: article missing from initial HTML`);
    for (const id of kind === 'guide' ? GUIDE_IDS : FAQ_IDS) require(pageIds.has(id), `${kind}: missing #${id}`);
    if (kind === 'guide') {
      require(/data-learning-exercise\b/.test(html), 'Guide exercises missing');
      require(/data-learning-chain\b/.test(html), 'Guide candidate-chain example missing');
    } else require(/data-learning-faq\b/.test(html), 'FAQ answers missing');
  }
  if (route === '/about/') require(/data-about-article\b/.test(html), 'About article missing from initial HTML');
  if (requireQube && ['/', '/about/', '/rules/', '/guide/', '/faq/'].includes(route)) {
    require(/data-qube-teacher\b/.test(html) && /data-qube-speaker\b/.test(html), 'QUBE teaching presentation missing from initial HTML');
  }
  return { route, status, ok: !problems.length, category: status === 200 ? 'content' : 'http-failure', problems, contentDigest: contentDigest(html) };
}

export function inspectInternalLinks(pages, origin = SEARCH_ORIGIN, verifiedAssets = []) {
  const bodies = new Map(pages.map(page => [page.route, page.html]));
  const problems = [];
  for (const { route, html } of pages) {
    for (const href of new Set(hrefs(html))) {
      let url;
      try { url = new URL(href, new URL(route, origin)); } catch { problems.push(`${route}: malformed href ${href}`); continue; }
      if (url.origin !== new URL(origin).origin || url.pathname.startsWith('/cdn-cgi/')) continue;
      // Only the known screenshot is accepted, after a file/HTTP check. An
      // image-looking suffix by itself never exempts a broken internal link.
      if (url.pathname === GAME_PREVIEW_ASSET && !url.search && !url.hash && verifiedAssets.includes(url.pathname)) continue;
      const target = bodies.get(url.pathname);
      if (target === undefined) { problems.push(`${route}: internal destination was not checked: ${url.pathname}`); continue; }
      if (url.hash) {
        try { if (!ids(target).has(decodeURIComponent(url.hash.slice(1)))) problems.push(`${route}: broken anchor ${href}`); }
        catch { problems.push(`${route}: malformed anchor ${href}`); }
      }
    }
  }
  return [...new Set(problems)];
}

export async function checkPublicSite(origin = SEARCH_ORIGIN, {requireQube = false} = {}) {
  const urls = [...SEARCH_ROUTES, '/robots.txt', '/sitemap.xml'];
  const fetched = await Promise.all(urls.map(async route => {
    // A bounded retry avoids turning a single transport failure into a content finding.
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const response = await fetch(new URL(route, origin), { signal: AbortSignal.timeout(15000), headers: { 'User-Agent': 'Q-Gambit-Public-Guidance-Check/1.0', 'Cache-Control': 'no-cache' } });
        const html = await response.text();
        if (response.status >= 500 && attempt === 1) continue;
        return { route, status: response.status, finalUrl: response.url, html, headerRobots: response.headers.get('x-robots-tag') || '', contentType: response.headers.get('content-type') || '' };
      } catch (error) { if (attempt === 2) return { route, error: errorMessage(error) }; }
    }
  }));
  const pages = fetched.filter(page => SEARCH_ROUTES.includes(page.route));
  const results = pages.map(page => page.error ? { route: page.route, ok: false, category: 'fetch-failure', problems: [page.error] } : inspectPublicPage({...page, requireQube}));
  const problems = fetched.filter(page => page.error).map(page => `${page.route}: fetch failed after retry: ${page.error}`);
  const readablePages = pages.filter(page => !page.error);
  const previewLinked = readablePages.some(page => hrefs(page.html).some(href => {
    try { const url = new URL(href, origin); return url.origin === new URL(origin).origin && url.pathname === GAME_PREVIEW_ASSET && !url.search && !url.hash; }
    catch { return false; }
  }));
  const verifiedAssets = [];
  if (previewLinked) {
    try {
      const response = await fetch(new URL(GAME_PREVIEW_ASSET, origin), {
        method: 'HEAD', signal: AbortSignal.timeout(15000), headers: { 'Cache-Control': 'no-cache' },
      });
      const sameAsset = !response.url || response.url === new URL(GAME_PREVIEW_ASSET, origin).href;
      if (response.status === 200 && sameAsset && /^image\/png(?:;|$)/i.test(response.headers.get('content-type') || '')) verifiedAssets.push(GAME_PREVIEW_ASSET);
      else problems.push(`${GAME_PREVIEW_ASSET}: expected the PNG asset (HTTP 200, image/png); received HTTP ${response.status}`);
    } catch (error) { problems.push(`${GAME_PREVIEW_ASSET}: asset check failed: ${errorMessage(error)}`); }
  }
  problems.push(...inspectInternalLinks(readablePages, origin, verifiedAssets));
  for (const route of ['/robots.txt', '/sitemap.xml']) {
    const page = fetched.find(page => page.route === route);
    if (!page.error && page.status !== 200) problems.push(`${route}: HTTP ${page.status}; expected 200`);
  }
  const robots = fetched.find(page => page.route === '/robots.txt');
  const sitemap = fetched.find(page => page.route === '/sitemap.xml');
  if (!robots.error && !sitemap.error) {
    try { checkSearchFiles(robots.html, sitemap.html); } catch (error) { problems.push(errorMessage(error)); }
  }
  return { schemaVersion: 1, checkedAt: new Date().toISOString(), origin, ok: results.every(result => result.ok) && !problems.length, results, problems,
    scope: 'Initial HTML, public navigation, anchors and search metadata. Editorial accuracy, engagement and AdSense approval require separate assessment.' };
}

async function run() {
  const args = {};
  for (let i = 2; i < process.argv.length; i++) {
    if (process.argv[i] === '--require-qube') { args['--require-qube'] = true; continue; }
    if (!['--origin', '--report'].includes(process.argv[i]) || !process.argv[i + 1]) throw new Error('Usage: node check-public-content.mjs [--origin <url>] [--report <output.json>] [--require-qube]');
    args[process.argv[i]] = process.argv[++i];
  }
  const origin = new URL(args['--origin'] || SEARCH_ORIGIN).origin;
  if (!/^https?:/.test(origin)) throw new Error('An HTTP(S) origin is required');
  const report = await checkPublicSite(origin, {requireQube: !!args['--require-qube']});
  const output = resolve(args['--report'] || 'scratch/public-content-check.json');
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ ok: report.ok, checkedAt: report.checkedAt, pages: report.results.length, problems: report.problems, failedPages: report.results.filter(page => !page.ok), report: output }, null, 2));
  if (!report.ok) process.exitCode = 1;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await run();
