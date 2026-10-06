// Fresh disposable native PostgreSQL only; no hosted connection or existing data.
// LD_LIBRARY_PATH=/trusted/native/lib node scripts/qa/crown-postgres-local.mjs /trusted/native/bin
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';
import { once } from 'node:events';
import pg from 'pg';
const bin=process.argv[2]; assert.ok(bin&&isAbsolute(bin)&&process.argv.length===3,'Provide trusted PostgreSQL 17 binary directory');
const cluster=await mkdtemp(join(tmpdir(),'qg-crown-native-'));
const listener=net.createServer(); listener.listen(0,'127.0.0.1');await once(listener,'listening');
const port=listener.address().port;await new Promise(resolve=>listener.close(resolve));
function command(name,args) {
    const result=spawnSync(join(bin,name),args,{encoding:'utf8',timeout:30000});
    assert.equal(result.status,0,`${name}: ${result.error?.message??''}\n${result.stdout}\n${result.stderr}`);
}
let running=false;
try {
    command('initdb',['-D',cluster,'--username=postgres','--auth=trust','--encoding=UTF8','--locale=C']);
    command('pg_ctl',['-D',cluster,'-l',join(cluster,'server.log'),'-o',`-h 127.0.0.1 -p ${port} -c unix_socket_directories=`,'-w','start']);running=true;
    const bootstrap=new pg.Client({host:'127.0.0.1',port,user:'postgres',database:'postgres',ssl:false});
    await bootstrap.connect();try{await bootstrap.query('create database commerce_upgrade');}finally{await bootstrap.end();}
    const child=spawn(process.execPath,['--test','--test-timeout=180000','scripts/qa/crown-postgres.test.mjs'],{
        cwd:fileURLToPath(new URL('../../',import.meta.url)),env:{...process.env,QG_TEST_PG_PORT:String(port)},stdio:'inherit'});
    process.exitCode=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',code=>resolve(code===0?0:1));});
}catch(error){const log=await readFile(join(cluster,'server.log'),'utf8').catch(()=>'');if(log)console.error(log);throw error;}
finally{if(running)command('pg_ctl',['-D',cluster,'-w','stop','-m','immediate']);await rm(cluster,{recursive:true,force:true});}
