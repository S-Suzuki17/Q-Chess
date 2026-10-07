import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {get as httpsGet} from 'node:https';
import {isIP} from 'node:net';
import {checkSearchMetadata, checkSearchFiles} from './search-metadata.mjs';

// Read-only public verification. Never creates users, signs in, or starts a match.
const [originArg, manifestArg, resolvedIp] = process.argv.slice(2);
assert.ok(originArg && manifestArg, 'Usage: node scripts/release/verify-pages.mjs <https-origin> <manifest.json> [verified-DNS-IP]');
if (resolvedIp) assert.ok(isIP(resolvedIp), 'Optional DNS override must be a verified IP, not another host');
const origin = new URL(originArg);
assert.equal(origin.protocol, 'https:');
const manifest = JSON.parse(readFileSync(path.resolve(manifestArg), 'utf8'));
const preview = origin.hostname.endsWith('.pages.dev');
const publisher = 'google.com, pub-1116866075179199, DIRECT, f08c47fec0942fa0';
let checks = 0;
let fullAudioResponses = 0;

async function request(route, init = {}) {
    const url = new URL(route, origin);
    // Optional diagnostic for propagation: use an independently verified DNS IP,
    // but retain the original URL, SNI, Host header, and certificate verification.
    // Never changes machine DNS or disables TLS verification.
    const response = resolvedIp ? await new Promise((resolve, reject) => {
        const req = httpsGet(url, {
            headers: {'Accept-Encoding': 'identity', ...init.headers},
            signal: AbortSignal.timeout(30000),
            lookup: (_host, options, callback) => callback(null,
                options.all ? [{address: resolvedIp, family: isIP(resolvedIp)}] : resolvedIp, isIP(resolvedIp)),
        }, res => {
            if (!res.socket.authorized) { res.destroy(); reject(new Error('TLS authorization failed')); return; }
            const chunks = [];
            res.on('data', chunk => chunks.push(chunk));
            res.on('error', reject);
            res.on('end', () => resolve(new Response(Buffer.concat(chunks), {status: res.statusCode, headers: res.headers})));
        });
        req.on('error', reject);
    }) : await fetch(url, {...init, signal: AbortSignal.timeout(30000)});
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff', route);
    if (preview) assert.equal(response.headers.get('x-robots-tag'), 'noindex', route);
    else assert.ok(!/noindex/i.test(response.headers.get('x-robots-tag') ?? ''), route);
    return response;
}

for (const route of ['/', '/about/', '/rules/', '/contact/', '/privacy/', '/terms/', '/updates/']) {
    const response = await request(route);
    assert.equal(response.status, 200, route);
    assert.match(response.headers.get('content-type'), /text\/html/i, route);
    assert.equal(response.headers.get('x-frame-options'), null, 'Do not break the official itch embed');
    const html = await response.text();
    checkSearchMetadata(html, route);
    assert.match(html, /name="google-adsense-account" content="ca-pub-1116866075179199"/, route);
    assert.doesNotMatch(html, /<script[^>]*src=["'][^"']*(?:googlesyndication|googleadservices|doubleclick)/i, route);
    checks++;
}
checkSearchFiles(await (await request('/robots.txt')).text(), await (await request('/sitemap.xml')).text());
for (const route of ['/ads.txt', '/app-ads.txt']) {
    const response = await request(route);
    assert.equal(response.status, 200, route);
    assert.match(response.headers.get('content-type'), /text\/plain/i, route);
    assert.equal((await response.text()).trim(), publisher, route);
    checks++;
}
for (const route of ['/teaser/', '/teaser2/', '/migration-check-not-found/']) {
    assert.equal((await request(route)).status, 404, route);
    checks++;
}
// Byte equality for executable assets, metadata, models, and one complete reward MP3.
const audio = manifest.filter(file => file.name.startsWith('audio/rewards/') && file.name.endsWith('.mp3'));
const sampleAudio = [...audio].sort((a, b) => a.size - b.size)[0]?.name;
const files = manifest.filter(file => /\.(?:js|css|glb|gltf)$/.test(file.name)
    || ['robots.txt', 'sitemap.xml', sampleAudio].includes(file.name));
for (const file of files) {
    const response = await request(`/${file.name}`);
    assert.equal(response.status, 200, file.name);
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.equal(bytes.length, file.size, file.name);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256, file.name);
    checks++;
}
for (const file of audio) {
    const response = await request(`/${file.name}`, {headers: {Range: 'bytes=0-1023'}});
    assert.match(response.headers.get('content-type'), /audio\/mpeg/i, file.name);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (response.status === 206) {
        assert.equal(response.headers.get('content-range'), `bytes 0-1023/${file.size}`, file.name);
        assert.equal(bytes.length, 1024, file.name);
    } else {
        // Pages documents full 200 responses for Range requests. Validate the entire
        // MP3 instead; report this limitation, not a false claim of byte-range support.
        // https://developers.cloudflare.com/pages/configuration/serving-pages/#behavior
        assert.equal(response.status, 200, file.name);
        assert.equal(bytes.length, file.size, file.name);
        assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256, file.name);
        fullAudioResponses++;
    }
    checks++;
}
console.log(JSON.stringify({origin: origin.origin, checks, rewardTracks: audio.length, assetsHashed: files.length, fullAudioResponses, dnsOverride: resolvedIp ?? null, status: 'passed', productionDataWritten: false}));
