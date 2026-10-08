import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import { once } from 'node:events';
import { io as socketClient } from 'socket.io-client';
import { nativeSessionRpc } from './session-runtime-rpc.mjs';
import { runReconnectPostgresChecks, RECONNECT_CHECKS } from './session-reconnect-postgres.mjs';
import { PASSWORD, account, scalar, recovery, reset, beginDeletion } from './session-postgres-support.mjs';
const require=createRequire(import.meta.url);
const { DurableRankedAuth }=require('../../server/dist/services/DurableRankedAuth.js');
const { LegacySocketAuthority }=require('../../server/dist/services/LegacySocketAuthority.js');
const { GameEngine }=require('../../server/dist/game/GameEngine.js');
const { createInitialBoard }=require('../../server/dist/game/quantumChess.js');
const { createRankedSessionInspectionRouter }=require('../../server/dist/services/RankedSessionInspectionRoutes.js');
const { AccountWriteGate }=require('../../server/dist/services/AccountDeletion.js');
const { Server }=require('../../server/node_modules/socket.io');
const express=require('../../server/node_modules/express');
export const RUNTIME_CHECKS=10+RECONNECT_CHECKS;
const hash=token=>createHash('sha256').update(token).digest('hex');
const live=proof=>({token:proof.token,userId:proof.userId,fence:proof.fence});
// Preserve exact microsecond lifetime by deriving expiry from the SAME timestamp.
const ageSession=async(admin,proof,age='2 hours')=>admin.query(`update qg_private.legacy_sessions set issued_at=v.t,
    expires_at=v.t+interval '1 hour' from (select clock_timestamp()-$2::interval as t) v where token_hash=$1`,[hash(proof.token),age]);
const waiting=(socket,event)=>new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{socket.off(event,listener);reject(Error('Timed out: '+event));},4000);
    const listener=value=>{clearTimeout(timer);resolve(value);};socket.once(event,listener);
});
export async function runSessionRuntimeChecks({check,admin,a,b,open}) {
    await runReconnectPostgresChecks({check,admin,a,b,open});
    const authA=new DurableRankedAuth(nativeSessionRpc(a)),authB=new DurableRankedAuth(nativeSessionRpc(b));
    const issue=async(auth=authA)=>{
        const user=await account(admin,'Runtime'+randomUUID()),proof=await auth.issueLegacySession(user,PASSWORD);
        assert.ok(proof?.token&&proof.fence);return proof;
    };
    await check('runtime: real adapter and two SQL backends share issuance, DB clock, strict protocol and hashed storage',async()=>{
        assert.deepEqual(await authA.protocol(),{version:2,activationReady:false});
        const proof=await issue();const verified=await authB.verifySession(proof.token,proof.userId);
        assert.equal(verified.userId,proof.userId);assert.deepEqual(verified.fence,proof.fence);
        assert.equal(proof.expiresAt-proof.serverNow,3600000);assert.ok(verified.serverNow>=proof.serverNow);
        assert.equal(await scalar(admin,'select count(*)::integer as result from qg_private.legacy_sessions where token_hash=$1',[hash(proof.token)]),1);
        assert.deepEqual(await authB.inspectLiveSessions([live(proof)]),['valid']);
        const original=Date.now;try{Date.now=()=>Date.parse('2099-01-01T00:00:00Z');assert.ok(await authB.verifySession(proof.token));}finally{Date.now=original;}
    });
    await check('runtime: independent restarted process uses the compiled TypeScript adapter against committed SQL',async()=>{
        const proof=await issue();const child=spawn(process.execPath,[fileURLToPath(new URL('./session-runtime-reuse.mjs',import.meta.url)),proof.token,proof.userId],{env:process.env,stdio:['ignore','pipe','pipe']});
        let output='',error='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>error+=b);
        const [code]=await once(child,'exit');assert.equal(code,0,error);const result=JSON.parse(output);
        assert.equal(result.userId,proof.userId);assert.notEqual(result.pid,a.fixturePid);
    });
    await check('runtime: absolute expiry rejects new identity while live inspection distinguishes expired from explicit token logout',async()=>{
        const proof=await issue(),other=await authB.issueLegacySession(proof.userId,PASSWORD);
        await ageSession(admin,proof);assert.equal(await authA.verifySession(proof.token),null);
        assert.deepEqual(await authB.inspectLiveSessions([live(proof),live(other)]),['expired','valid']);
        assert.equal(await authA.revokeSession(proof.token),true);
        assert.deepEqual(await authB.inspectLiveSessions([live(proof),live(other)]),['revoked','valid']);
    });
    await check('runtime: missing expired-token evidence never invents revocation; later account-generation change still revokes',async()=>{
        const proof=await issue();await ageSession(admin,proof,'26 hours');
        await a.query('select public.cleanup_legacy_sessions(1000)');
        assert.deepEqual(await authB.inspectLiveSessions([live(proof)]),['evidence_lost']);
        assert.equal(await authA.revokeSession(proof.token),false,'Known activation blocker: absent token cannot be locally revoked');
        await authA.revokeUserSessions(proof.userId);
        assert.deepEqual(await authB.inspectLiveSessions([live(proof)]),['revoked']);
    });
    await check('runtime: actual password reset and deletion are visible to independent live authority without token rows',async()=>{
        const proof=await issue(),identity=await recovery(admin,proof.userId);
        await ageSession(admin,proof,'26 hours');await a.query('select public.cleanup_legacy_sessions(1000)');
        await reset(a,identity);assert.deepEqual(await authB.inspectLiveSessions([live(proof)]),['revoked']);
        const deleting=await issue(),ticket=hash('deletion-'+randomUUID());await beginDeletion(a,deleting.userId,ticket);assert.deepEqual(await authB.inspectLiveSessions([live(deleting)]),['revoked']);
        await a.query('select public.erase_account_data($1)',[ticket]);
        assert.deepEqual(await authB.inspectLiveSessions([live(deleting)]),['revoked']);
        await a.query('select public.finish_account_deletion($1)',[ticket]);
        await account(admin,deleting.userId);assert.deepEqual(await authB.inspectLiveSessions([live(deleting)]),['revoked']);
    });
    await check('runtime: service-only, READ COMMITTED, pinned invoker batch validates bounded hashes and fences',async()=>{
        const proof=await issue(),input={tokenHash:hash(proof.token),userId:proof.userId,...proof.fence};
        for(const role of ['anon','authenticated']){
            const client=await open(role);
            for(const query of ['select public.legacy_session_runtime_version()',"select public.inspect_legacy_session(repeat('a',64))","select public.inspect_live_legacy_sessions('[]')"])
                await assert.rejects(client.query(query),{code:'42501'});
        }
        for(const bad of [[],Array(201).fill(input),[{...input,tokenHash:proof.token}],[{...input,generation:'9223372036854775808'}]])
            await assert.rejects(a.query('select public.inspect_live_legacy_sessions($1)',[JSON.stringify(bad)]),{code:'22023'});
        await a.query('begin isolation level repeatable read');
        await assert.rejects(a.query('select public.inspect_live_legacy_sessions($1)',[JSON.stringify([input])]),{code:'25000'});await a.query('rollback');
        const funcs=(await admin.query("select prosecdef,proconfig from pg_proc where proname in ('legacy_session_runtime_version','inspect_legacy_session','inspect_live_legacy_sessions')")).rows;
        assert.equal(funcs.length,3);for(const f of funcs){assert.equal(f.prosecdef,false);assert.deepEqual(f.proconfig,['search_path=""']);}
    });
    await check('runtime: unknown issuance response cleans up only the newly attempted token through actual adapter and SQL',async()=>{
        const proof=await issue();const rpc=nativeSessionRpc(b);let attempted;
        const broken=new DurableRankedAuth(async(name,parameters,signal)=>{
            const result=await rpc(name,parameters,signal);
            if(name==='issue_legacy_session'){attempted=parameters.p_token_hash;return{error:null,data:{ok:true,malformed:true}};}return result;
        });
        await assert.rejects(broken.issueLegacySession(proof.userId,PASSWORD),/unavailable/);
        assert.equal(await scalar(admin,'select revoked_at is not null as result from qg_private.legacy_sessions where token_hash=$1',[attempted]),true);
        assert.ok(await authA.verifySession(proof.token));
    });
    await check('runtime: status HTTP response projects DB time without leaking socket incarnation or generation',async()=>{
        const proof=await issue(),app=express();app.use(createRankedSessionInspectionRouter(authA,{blocked:async()=>false},new AccountWriteGate()));
        const server=app.listen(0,'127.0.0.1');await once(server,'listening');
        try{
            const response=await fetch(`http://127.0.0.1:${server.address().port}/auth/ranked-session/status`,{headers:{authorization:'Bearer '+proof.token}});
            assert.equal(response.status,200);const value=await response.json();
            assert.deepEqual(Object.keys(value).sort(),['expiresAt','serverNow','userId']);assert.ok(value.serverNow>=proof.serverNow);
        }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
    });
    await check('runtime: real loopback sockets preserve games on expiry and outage; committed token revocation reaches remote authority',async()=>{
        const proof=await issue();const server=http.createServer(),io=new Server(server);server.listen(0,'127.0.0.1');await once(server,'listening');
        const owners=new Map(),serverSockets=new Map();let outage=false;let stopped=0;
        const engine=new GameEngine('live-native-match',proof.userId,'synthetic-opponent',createInitialBoard(),600,{},0);
        const before=engine.getPublicState(proof.userId);
        const monitor=new LegacySocketAuthority({inspectLiveSessions:entries=>outage?Promise.reject(Error('synthetic outage')):authB.inspectLiveSessions(entries)},io,(id,socketId)=>owners.get(id)===socketId,()=>stopped++);
        io.use(async(socket,next)=>{try{const identity=await authB.verifySession(socket.handshake.auth.token);if(!identity)return next(Error('invalid'));socket.data.userId=identity.userId;socket.data.legacy=true;monitor.capture(socket,socket.handshake.auth.token,identity);next();}catch{next(Error('unavailable'));}});
        io.on('connection',socket=>{owners.set(socket.data.userId,socket.id);serverSockets.set(socket.id,socket);socket.on('game_ping',()=>socket.emit('game_alive',engine.getPublicState(proof.userId)));socket.on('disconnect',()=>{monitor.forget(socket);engine.forfeit(proof.userId);});});
        const client=socketClient(`http://127.0.0.1:${server.address().port}`,{auth:{token:proof.token},transports:['websocket'],reconnection:false,autoConnect:false});
        try{
            const connected=waiting(client,'connect');client.connect();await connected;
            await ageSession(admin,proof);await monitor.poll();assert.equal(client.connected,true);assert.equal(monitor.canAdmit(serverSockets.get(client.id)),false);
            outage=true;await monitor.poll();assert.ok(stopped>=2);assert.equal(client.connected,true);
            const pong=waiting(client,'game_alive');client.emit('game_ping');const preserved=await pong;assert.equal(preserved.gameOver,null);assert.deepEqual(preserved.board,before.board);assert.equal(preserved.version,before.version);
            outage=false;await authA.revokeSession(proof.token);const notice=waiting(client,'session_revoked'),disconnected=waiting(client,'disconnect');await monitor.poll();
            assert.deepEqual(await notice,{reason:'revoked'});assert.equal(await disconnected,'io server disconnect');
        }finally{client.disconnect();await new Promise(resolve=>io.close(resolve));server.closeAllConnections();}
    });
    await check('runtime: delayed live revocation result cannot disconnect a replacement proof or socket owner',async()=>{
        const proof=await issue();let response;
        const socket={id:'original',connected:true,data:{userId:proof.userId,legacy:true},handshake:{auth:{token:proof.token}},emit:()=>assert.fail('stale emit'),disconnect:()=>assert.fail('stale disconnect')};
        const monitor=new LegacySocketAuthority({inspectLiveSessions:async entries=>{const result=await authB.inspectLiveSessions(entries);await new Promise(resolve=>response=resolve);return result;}},{sockets:{sockets:new Map([[socket.id,socket]])}},()=>true,()=>{});
        monitor.capture(socket,proof.token,proof);await authA.revokeSession(proof.token);const pending=monitor.poll();
        while(!response)await new Promise(resolve=>setImmediate(resolve));
        const replacement=await authA.issueLegacySession(proof.userId,PASSWORD);socket.handshake.auth.token=replacement.token;monitor.capture(socket,replacement.token,replacement);
        response();await pending;assert.ok(await authB.verifySession(replacement.token));
    });
}
