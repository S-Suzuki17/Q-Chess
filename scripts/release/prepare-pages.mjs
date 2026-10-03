import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const root = fileURLToPath(new URL('../../', import.meta.url));
const source = path.join(root, 'out');
const sha = file => createHash('sha256').update(readFileSync(file)).digest('hex');

export function checkFiles(files, read) {
    assert.ok(files.length > 0 && files.length + 1 <= 1000, 'Exceeds Pages dashboard upload limit (1000 files)');
    for (const {name, size} of files) {
        assert.ok(size <= 25 * 1024 * 1024, `Exceeds Pages 25 MiB limit: ${name}`);
        assert.ok(!/(^|\/)(?:\.env[^/]*|\.git|node_modules|_worker\.js|functions)(\/|$)|\.(?:jks|keystore|pem|map)$/i.test(name), `Forbidden release file: ${name}`);
        if (/\.(?:html|js|json|txt)$/i.test(name)) {
            const content = read(name);
            assert.ok(!/sb_secret_[\w-]+|\b(?:sk|rk)_(?:live|test)_[\w-]+|\bwhsec_[\w-]+|-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/.test(content), `Secret material in ${name}`);
            for (const jwt of content.match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g) ?? []) {
                let payload;
                try { payload = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString()); } catch { continue; }
                assert.notEqual(payload.role, 'service_role', `Privileged key in ${name}`);
            }
        }
    }
}

export function inventory(dir, prefix = '') {
    return readdirSync(dir).flatMap(name => {
        const full = path.join(dir, name);
        const stat = lstatSync(full);
        assert.ok(!stat.isSymbolicLink(), `Symlinks cannot be deployed: ${name}`);
        const relative = `${prefix}${name}`;
        return stat.isDirectory() ? inventory(full, `${relative}/`) : [{name: relative, size: stat.size}];
    });
}

function prepare() {
    const review = spawnSync(process.execPath, ['scripts/release/check-web-review.mjs'], {cwd: root, stdio: 'inherit'});
    assert.equal(review.status, 0, 'Existing Web review guard failed');
    // Next may emit framework debug maps. Keep originals locally, exclude maps from delivery.
    const files = inventory(source).filter(file => !file.name.endsWith('.map'));
    checkFiles(files, name => readFileSync(path.join(source, name), 'utf8'));
    const publisher = 'google.com, pub-1116866075179199, DIRECT, f08c47fec0942fa0';
    for (const name of ['ads.txt', 'app-ads.txt']) {
        assert.equal(readFileSync(path.join(source, name), 'utf8').trim(), publisher, name);
    }
    assert.ok(existsSync(path.join(source, '404.html')), 'A real 404 page is required; no SPA catch-all');
    for (const {name, size} of inventory(path.join(root, 'public/audio/rewards'))) {
        assert.ok(size > 44, `Empty reward audio: ${name}`);
        assert.equal(sha(path.join(source, 'audio/rewards', name)), sha(path.join(root, 'public/audio/rewards', name)), `Reward audio changed: ${name}`);
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const destination = path.join(root, 'build', `cloudflare-pages-${stamp}`);
    assert.ok(!existsSync(destination), 'Never overwrite a previous release');
    mkdirSync(path.dirname(destination), {recursive: true});
    cpSync(source, destination, {recursive: true, errorOnExist: true, force: false, filter: file => !file.endsWith('.map')});
    cpSync(path.join(root, 'scripts/release/cloudflare/_headers'), path.join(destination, '_headers'));
    // Evidence remains next to, never inside, the deployable directory.
    const manifest = inventory(destination).map(file => ({...file, sha256: sha(path.join(destination, file.name))}));
    writeFileSync(`${destination}.manifest.json`, JSON.stringify(manifest, null, 2) + '\n');
    console.log(JSON.stringify({directory: destination, files: manifest.length, bytes: manifest.reduce((n, f) => n + f.size, 0), uploaded: false}));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) prepare();
