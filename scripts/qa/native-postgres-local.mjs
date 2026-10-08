// One fresh, disposable loopback-only PostgreSQL 17 cluster per suite.
// Does not install a service, accept a database URL, or reuse existing PGDATA.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, lstat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, isAbsolute, resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';
import { once } from 'node:events';
import pg from 'pg';
const [bin, suite] = process.argv.slice(2);
assert.equal(process.argv.length, 4, 'Usage: native-postgres-local.mjs <absolute PostgreSQL bin> <sessions|commerce|commerce-ledger|commerce-http|hint-origins|shared|shared-runtime|crown>');
assert.ok(bin && isAbsolute(bin));
const suites = {sessions:['legacy_session_upgrade','session-postgres.test.mjs'],commerce:['commerce_upgrade','commerce-postgres.test.mjs'],
    'commerce-ledger':['commerce_upgrade','commerce-source-ledger-postgres.test.mjs'],
    'commerce-http':['commerce_upgrade','commerce-postgrest.test.mjs'],
    shared:['commerce_upgrade','shared-match-admission-postgres.test.mjs'],
    'shared-runtime':['commerce_upgrade','shared-match-runtime-postgres.test.mjs'],
    'hint-origins':['commerce_upgrade','hint-origin-postgres.test.mjs'],crown:['commerce_upgrade','crown-postgres.test.mjs']};
assert.ok(Object.hasOwn(suites,suite),'Unknown suite');
const [database,testScript] = suites[suite];
const root = fileURLToPath(new URL('../../', import.meta.url));
const tempRoot = resolve(tmpdir());
const cluster = await mkdtemp(join(tempRoot,'qg-native-verification-'));
const assertDisposable = async () => {
    const target = resolve(cluster);
    assert.equal(dirname(target),tempRoot);
    assert.ok(basename(target).startsWith('qg-native-verification-'));
    assert.ok(!(await lstat(target)).isSymbolicLink());
};
const listener = net.createServer(); listener.listen(0,'127.0.0.1'); await once(listener,'listening');
const port = listener.address().port; await new Promise(resolveClose=>listener.close(resolveClose));
const command = (name,args) => {
    const executable=join(bin,name+(process.platform==='win32'?'.exe':''));
    const result=spawnSync(executable,args,{encoding:'utf8',timeout:60_000,windowsHide:true});
    assert.equal(result.status,0,`${name} failed: ${result.error?.message??''}\n${result.stdout}\n${result.stderr}`);
    return result.stdout;
};
let running=false;
try {
    assert.match(command('postgres',['--version']),/PostgreSQL\) 17\./);
    command('initdb',['-D',cluster,'--username=postgres','--auth=trust','--encoding=UTF8','--locale=C']);
    command('pg_ctl',['-D',cluster,'-l',join(cluster,'server.log'),'-o',`-h 127.0.0.1 -p ${port} -c unix_socket_directories=`,'-w','start']);
    running=true;
    const bootstrap=new pg.Client({host:'127.0.0.1',port,user:'postgres',database:'postgres',password:'qgambit-ephemeral-only',ssl:false,connectionTimeoutMillis:5000});
    await bootstrap.connect();
    try {await bootstrap.query(`create database ${database}`);} finally {await bootstrap.end();}
    const child=spawn(process.execPath,['--test','--test-timeout=240000',`scripts/qa/${testScript}`],{
        cwd:root,env:{...process.env,
            PATH:process.platform==='win32'?`${bin};${process.env.PATH}`:process.env.PATH,
            QG_SESSION_TEST_PG_PORT:String(port),QG_TEST_PG_PORT:String(port)},stdio:'inherit',windowsHide:true});
    const code=await new Promise((resolveExit,reject)=>{child.on('error',reject);child.on('exit',resolveExit);});
    process.exitCode=code===0?0:1;
} catch(error) {
    const log=await readFile(join(cluster,'server.log'),'utf8').catch(()=> '');
    if(log)console.error(log);
    throw error;
} finally {
    await assertDisposable();
    // A failed pg_ctl startup can still leave a server running. Stop only the
    // freshly created cluster identified by its own pid file before removal.
    const pid=await readFile(join(cluster,'postmaster.pid'),'utf8').catch(()=>null);
    if(running || pid!==null)command('pg_ctl',['-D',cluster,'-w','stop','-m','immediate']);
    await assertDisposable();
    await rm(cluster,{recursive:true,force:true});
}
