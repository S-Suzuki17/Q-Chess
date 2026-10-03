// Only started by ranked-admission-native.mjs, against its disposable loopback DB.
import { createRequire } from 'node:module';
import { Worker } from 'node:worker_threads';
import { admissionSql,settlementSql } from './ranked-admission-fixture.mjs';
const require=createRequire(new URL('../../scratch/ranked-postgres/package.json',import.meta.url));
const {Client}=require('pg');
const {GameEngine}=require('../../server/dist/game/GameEngine.js');
const {createInitialBoard}=require('../../server/dist/game/quantumChess.js');
const {cpuProfileForRating}=require('../../server/dist/game/RankCpuSearch.js');
const [portText,owner,id,human,phase]=process.argv.slice(2);
const port=Number(portText);
if(!Number.isInteger(port)||port<1024||!process.send)throw new Error('Fixture-only child');
const client=new Client({host:'127.0.0.1',port,database:'postgres',user:'fixtureadmin'});
await client.connect();await client.query('set role service_role');
const stop=async()=>{process.send({phase});await new Promise(()=>{});};
await client.query('select public.renew_ranked_server_lease($1)',[owner]);
if(phase==='before_admission')await stop();
const cpu='ai:'+id;
await client.query(admissionSql,[id,human,cpu,600,owner,cpu,1200,4]);
if(phase==='after_commit')await stop();
const engine=new GameEngine(id,human,cpu,createInitialBoard(),600);
if(phase==='before_match_start')await stop();
process.send({clientEvent:'match_start',state:engine.getPublicState(human)});
if(phase==='after_match_start')await stop();
if(phase==='human_action') {
    engine.processAction({actionId:'move',version:0,playerId:human,action:{type:'MOVE',payload:{pieceId:1,toX:0,toY:2}}});
    await stop();
}
if(phase==='cpu_move') {
    engine.processAction({actionId:'move',version:0,playerId:human,action:{type:'MOVE',payload:{pieceId:1,toX:0,toY:2}}});
    new Worker(require.resolve('../../server/dist/game/rankCpuWorker.js'),{
        workerData:{state:engine.getPublicState(cpu),profile:cpuProfileForRating(1200,600)},
    });
    await stop(); // Actual CPU worker in flight, with no durable engine snapshot.
}
if(phase==='during_settlement') {
    process.send({phase:'admitted'});
    await new Promise(resolve=>process.once('message',resolve));
    const saving=client.query(settlementSql,[id,human,cpu,'WHITE',600,cpu,1200,4,'[]',owner]);
    void saving.catch(()=>{});await stop(); // Parent holds the human profile lock.
}
if(phase==='after_settlement_commit') {
    await client.query(settlementSql,[id,human,cpu,'WHITE',600,cpu,1200,4,'[]',owner]);
    await stop(); // DB acknowledged only to this child, no client result delivered.
}
throw new Error('Unknown crash phase');
