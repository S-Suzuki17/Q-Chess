// Fresh native loopback fixture only. No existing PGDATA or database URL.
// node scripts/qa/hint-origin-postgres-local.mjs /absolute/postgres/bin
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';
import { once } from 'node:events';
import pg from 'pg';
const bin = process.argv[2]; assert.ok(bin && isAbsolute(bin), 'Provide trusted native PostgreSQL 17 binaries as an absolute directory');
assert.equal(process.argv.length, 3, 'Only the trusted PostgreSQL bin directory is accepted');
const database = 'commerce_upgrade';
const testScript = 'scripts/qa/hint-origin-postgres.test.mjs';
const root = fileURLToPath(new URL('../../', import.meta.url));
const cluster = await mkdtemp(join(tmpdir(), 'qg-hint-origin-native-'));
const listener = net.createServer(); listener.listen(0, '127.0.0.1'); await once(listener, 'listening');
const port = listener.address().port; await new Promise(resolve => listener.close(resolve));
function command(name, args) {
    const r = spawnSync(join(bin, name), args, { encoding: 'utf8', timeout: 30000 });
    assert.equal(r.status, 0, `${name} failed: ${r.error?.message ?? ''}\n${r.stdout}\n${r.stderr}`);
}
let running = false;
try {
    command('initdb', ['-D',cluster,'--username=postgres','--auth=trust','--encoding=UTF8','--locale=C']);
    command('pg_ctl', ['-D',cluster,'-l',join(cluster,'server.log'),'-o',`-h 127.0.0.1 -p ${port} -c unix_socket_directories=`,'-w','start']); running = true;
    const bootstrap = new pg.Client({ host: '127.0.0.1', port, user: 'postgres', database: 'postgres',
        password: 'qgambit-ephemeral-only', ssl: false, connectionTimeoutMillis: 5000 });
    await bootstrap.connect();
    try { await bootstrap.query(`create database ${database}`); } finally { await bootstrap.end(); }
    const child = spawn(process.execPath, ['--test','--test-timeout=180000',testScript],
        { cwd: root, env: { ...process.env, QG_SESSION_TEST_PG_PORT: String(port), QG_TEST_PG_PORT: String(port) }, stdio: 'inherit' });
    const code = await new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', resolve); });
    process.exitCode = code === 0 ? 0 : 1;
} catch (error) {
    const log = await readFile(join(cluster, 'server.log'), 'utf8').catch(() => '');
    if (log) console.error(log);
    throw error;
} finally {
    if (running) command('pg_ctl', ['-D',cluster,'-w','stop','-m','immediate']);
    await rm(cluster, { recursive: true, force: true });
}
