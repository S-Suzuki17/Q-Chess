// Build first: npm --prefix server run build. Runs the real service against PostgreSQL.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { createCpuPracticeFixture } from './cpu-practice-fixture.mjs';
const require = createRequire(import.meta.url);
const { CpuPracticeService, hashPracticeState } = require('../../server/dist/services/CpuPracticeService.js');
const { getAllConcreteMoves } = require('../../server/dist/quantum-engine/ai/random.js');
const { applyPracticeMove } = require('../../server/dist/quantum-engine/practice.js');
const { createInitialState } = require('../../server/dist/quantum-engine/initialState.js');
const fixture = await createCpuPracticeFixture();
const {db,client,call,wallet} = fixture;
let searchCalls=0, forcedError=null, forcedMove=undefined;
const search = async state => {
    searchCalls++;
    if (forcedError) throw new Error(forcedError);
    if (forcedMove !== undefined) return forcedMove;
    return getAllConcreteMoves(state)[0] ?? null;
};
const service = new CpuPracticeService(client,true,search);
const open = async (user='Alice',side='white',seconds=600) => service.open(user,randomUUID(),side,1,seconds);
const expectCode = async (run,code) => assert.rejects(run,error=>error.message===code);
const buy = (session,id=randomUUID(),context) => service.requestHint(id,session.userId,session.sessionId,session.revision,context);
const receiptCount = async () => Number((await db.query('select count(*) as n from public.cpu_hint_receipts')).rows[0].n);
const active = async user => db.query("update public.cpu_practice_sessions set status='finished' where user_id=$1",[user]);
try {
    const session=await open();
    const id=randomUUID(), hint=await buy(session,id);
    assert.equal((await wallet('Alice')).hint_tickets,19);
    assert.equal(hint.deliveryState,'paid_retrievable');
    const next=applyPracticeMove(session.state,hint.move);
    assert.equal(next.ply,1);
    const piece=session.state.pieces.find(p=>p.id===hint.move.pieceId);
    assert.deepEqual(hint.hint,{fromRow:piece.position.row,fromCol:piece.position.col,toRow:hint.move.target.row,toCol:hint.move.target.col});
    const calls=searchCalls;
    const retry=await new CpuPracticeService(client,true,search).requestHint(id,'Alice',session.sessionId,0);
    assert.deepEqual(retry,hint); assert.equal(searchCalls,calls); assert.equal((await wallet('Alice')).hint_tickets,19);

    // Distinct IDs submitted in parallel converge on the immutable revision receipt.
    const parallel=await Promise.all(Array.from({length:6},()=>buy(session)));
    assert.ok(parallel.every(value=>JSON.stringify(value)===JSON.stringify(hint)));
    assert.equal(searchCalls,calls); // existing revision receipt also avoids a fresh search for new request IDs
    assert.equal((await wallet('Alice')).hint_tickets,19); assert.equal(await receiptCount(),1);
    await expectCode(()=>service.requestHint(id,'Carol',session.sessionId,0),'REQUEST_MISMATCH');
    await expectCode(()=>service.requestHint(id,'Alice',randomUUID(),0),'REQUEST_MISMATCH');
    await expectCode(()=>service.requestHint(randomUUID(),'Carol',session.sessionId,0),'SESSION_NOT_FOUND');
    await expectCode(()=>service.requestHint(randomUUID(),'Alice',session.sessionId,9),'STALE_REVISION');
    const op=randomUUID(), move=getAllConcreteMoves(session.state)[0];
    const advanced=await service.advance('Alice',session.sessionId,0,op,'human',move);
    assert.equal(advanced.revision,1);
    const operationRetry=await service.advance('Alice',session.sessionId,0,op,'human',move);
    assert.equal(operationRetry.revision,advanced.revision);assert.deepEqual(operationRetry.state,advanced.state);
    assert.deepEqual(operationRetry.history,advanced.history); // clock continues on an idempotent retry
    await expectCode(()=>buy(advanced),'NOT_YOUR_TURN');
    await expectCode(()=>buy(session),'STALE_REVISION');
    assert.deepEqual(await buy(session,id),hint); // previously paid stale revision is recoverable
    await expectCode(()=>service.advance('Alice',session.sessionId,1,randomUUID(),'human',move),'NOT_YOUR_TURN');
    await expectCode(()=>service.advance('Alice',session.sessionId,1,randomUUID(),'cpu',move),'INVALID_REQUEST');

    const noFunds=await open('Bob');
    await expectCode(()=>buy(noFunds),'INSUFFICIENT_FUNDS');
    assert.equal((await wallet('Bob')).hint_tickets,0);
    const invalid=await open('Carol');
    for (const [error,move] of [[null,null],['SEARCH_TIMEOUT',undefined],[null,{pieceId:'b_1',target:{row:4,col:4}}]]) {
        forcedError=error;forcedMove=move;
        await assert.rejects(()=>buy(invalid));
        assert.equal((await wallet('Carol')).hint_tickets,20);
    }
    forcedError=null;forcedMove=undefined;
    const controller=new AbortController();
    const before=new CpuPracticeService(client,true,async state=>{
        controller.abort(); return getAllConcreteMoves(state)[0];
    });
    await assert.rejects(()=>before.requestHint(randomUUID(),'Carol',invalid.sessionId,0,{signal:controller.signal,check(){}}));
    assert.equal((await wallet('Carol')).hint_tickets,20);
    const ranked=new CpuPracticeService(client,true,search);
    await expectCode(()=>ranked.requestHint(randomUUID(),'Carol',invalid.sessionId,0,
        {signal:new AbortController().signal,check(){throw new Error('HINT_UNAVAILABLE_IN_MATCH');}}),'HINT_UNAVAILABLE_IN_MATCH');
    assert.equal((await wallet('Carol')).hint_tickets,20);

    // Inject a transport failure AFTER the actual debit+receipt transaction commits.
    const lostId=randomUUID();
    const lostClient={rpc(name,params){return {async abortSignal(){
        const result=await client.rpc(name,params).abortSignal();
        if(name==='buy_cpu_hint'&&!result.error)return {data:null,error:{message:'lost response'}};
        return result;
    }}}};
    await expectCode(()=>new CpuPracticeService(lostClient,true,search).requestHint(lostId,'Carol',invalid.sessionId,0),'CPU_PRACTICE_UNAVAILABLE');
    assert.equal((await wallet('Carol')).hint_tickets,19);
    const recovered=await buy(invalid,lostId);
    assert.equal((await wallet('Carol')).hint_tickets,19);
    assert.equal(recovered.receiptId,lostId);
    await service.close('Carol',invalid.sessionId);
    assert.deepEqual(await buy(invalid,lostId),recovered);
    await expectCode(()=>buy(invalid),'SESSION_FINISHED');

    const timed=await open('Carol','white',10);
    await db.query("update public.cpu_practice_sessions set turn_started_at=clock_timestamp()-interval '11 seconds' where session_id=$1",[timed.sessionId]);
    await expectCode(()=>buy(timed),'SESSION_FINISHED');
    assert.equal((await wallet('Carol')).hint_tickets,19);
    const finished=await open('Carol');
    await db.query("update public.cpu_practice_sessions set state=jsonb_set(state,'{winner}','\"white\"'::jsonb),status='finished' where session_id=$1",[finished.sessionId]);
    await assert.rejects(()=>buy(finished)); assert.equal((await wallet('Carol')).hint_tickets,19);
    await expectCode(()=>new CpuPracticeService(client,false,search).requestHint(randomUUID(),'Alice',session.sessionId,0),'FEATURE_DISABLED');

    // Real wallet SQL: free first, then only the currently bound live paid pool.
    await active('Bob');
    const price='price_1ULM9fQWzwYDIuXWgs5Uj3yt';
    await db.query("insert into public.stripe_checkout_intents values('co','Bob',$1,true)",[price]);
    await db.query("insert into public.stripe_customer_links values('cu','Bob')");
    await db.query("insert into public.stripe_memberships values('sub','co','cu','Bob','active',clock_timestamp()+interval '1 day',null,$1)",[price]);
    await db.query("update public.ticket_wallets set hint_tickets=1,member_hint_tickets=3,member_ticket_subscription_id='sub' where user_id='Bob'");
    const free=await open('Bob'); await buy(free);
    assert.equal((await wallet('Bob')).hint_tickets,0);assert.equal((await wallet('Bob')).member_hint_tickets,3);
    const paid=await open('Bob'),paidId=randomUUID();await buy(paid,paidId);
    assert.equal((await wallet('Bob')).member_hint_tickets,2);
    for (const update of ["period_end=clock_timestamp()-interval '1 second'","refund_blocked_until=clock_timestamp()+interval '1 day'","current_price_id='off-price'","status='canceled'"]) {
        await db.query("update public.stripe_memberships set status='active',period_end=clock_timestamp()+interval '1 day',refund_blocked_until=null,current_price_id=$1",[price]);
        await db.query("update public.ticket_wallets set member_hint_tickets=3,member_ticket_subscription_id='sub' where user_id='Bob'");
        await db.exec('update public.stripe_memberships set '+update);
        const unavailable=await open('Bob');
        await expectCode(()=>buy(unavailable),'INSUFFICIENT_FUNDS');
        assert.equal((await wallet('Bob')).member_hint_tickets,0); // invalid paid pool expires even when purchase is refused
        assert.equal((await wallet('Bob')).hint_tickets,0);
        assert.equal((await buy(paid,paidId)).receiptId,paidId); // paid receipt survives expiry/reversal
        await service.close('Bob',unavailable.sessionId);
    }
    assert.equal(await call('restore_cpu_hint_credit',{p_receipt_id:paidId,p_user_id:'Bob',p_reason:'unrecoverable_delivery'}),0);
    assert.equal(await call('restore_cpu_hint_credit',{p_receipt_id:hint.receiptId,p_user_id:'Alice',p_reason:'unrecoverable_delivery'}),1);
    assert.equal(await call('restore_cpu_hint_credit',{p_receipt_id:hint.receiptId,p_user_id:'Alice',p_reason:'unrecoverable_delivery'}),0);
    assert.equal((await wallet('Alice')).hint_tickets,20);
    assert.deepEqual(await buy(session,id),hint); // restoration never alters the hint

    // Privilege and RLS checks; direct browser writes/RPCs cannot reach the spend.
    for(const role of ['anon','authenticated']) {
        await db.exec('set role '+role);
        await assert.rejects(()=>db.query('select * from public.cpu_hint_receipts'));
        await assert.rejects(()=>db.query("select public.cpu_practice_read($1,'Alice')",[session.sessionId]));
        await db.exec('reset role');
    }
    await db.exec('set role service_role');
    await assert.rejects(()=>db.query("update public.cpu_hint_receipts set revision=99"));
    await db.exec('reset role');
    const tables=['cpu_practice_sessions','cpu_practice_operations','cpu_hint_receipts','cpu_hint_request_aliases','cpu_hint_restorations'];
    const policies=(await db.query("select relrowsecurity from pg_class where relnamespace='public'::regnamespace and relname=any($1::text[])",[tables])).rows;
    assert.equal(policies.length,5);assert.ok(policies.every(row=>row.relrowsecurity));

    await db.exec("insert into public.account_deletion_jobs values('Carol','requested')");
    await expectCode(()=>buy(invalid,lostId),'ACCOUNT_UNAVAILABLE');
    await db.exec("delete from public.profiles where id='Carol'");
    assert.equal(Number((await db.query("select count(*) as n from public.cpu_practice_sessions where user_id='Carol'")).rows[0].n),0);
    assert.equal(Number((await db.query("select count(*) as n from public.cpu_hint_receipts where user_id='Carol'")).rows[0].n),0);
    assert.equal(Number((await db.query("select count(*) as n from public.cpu_hint_request_aliases where request_id=$1",[lostId])).rows[0].n),0);
    const realSearchSession=await open();
    const realService=new CpuPracticeService(client,true), realId=randomUUID();
    const beforeSearch=(await wallet('Alice')).hint_tickets;
    try {
        const realSearchHint=await realService.requestHint(realId,'Alice',realSearchSession.sessionId,0);
        assert.equal(applyPracticeMove(realSearchSession.state,realSearchHint.move).ply,1);
        assert.equal((await wallet('Alice')).hint_tickets,beforeSearch-1);
        console.log('PASS: default worker opening hint purchased and independently validated.');
    } catch(error) {
        assert.equal(error.message,'SEARCH_TIMEOUT');
        assert.equal((await wallet('Alice')).hint_tickets,beforeSearch);
        assert.equal(await realService.receipt('Alice',realSearchSession.sessionId,0,realId),null);
        console.log('PASS: default worker opening search exhausted its budget; no ticket or receipt spent.');
    }
    // A server-side fixture constrains identities to a valid orthodox assignment.
    // No HTTP endpoint accepts this state. Exercise successful default-worker
    // fulfillment independently of the opening's large superposition branch factor.
    const concreteSession=await open(), initial=createInitialState(), backRank=[8,2,4,16,32,4,2,8];
    const concrete={...initial,pieces:initial.pieces.map(piece=>({...piece,
        state:[1,6].includes(piece.origin.row)?1:backRank[piece.origin.col]}))};
    await db.query('update public.cpu_practice_sessions set state=$1,state_hash=$2 where session_id=$3',
        [JSON.stringify(concrete),hashPracticeState(concrete),concreteSession.sessionId]);
    const concreteBefore=(await wallet('Alice')).hint_tickets;
    const concreteHint=await realService.requestHint(randomUUID(),'Alice',concreteSession.sessionId,0);
    assert.equal(applyPracticeMove(concrete,concreteHint.move).ply,1);
    assert.equal((await wallet('Alice')).hint_tickets,concreteBefore-1);
    console.log('PASS: default worker constrained-position hint purchased and independently validated.');
    console.log('PASS: real service + PostgreSQL ownership/revision, immutable hint, 6 parallel IDs, restart/retry, disconnect before/after commit, free/paid/expiry/reversal, clock/terminal, RLS, one-time restoration and deletion.');
} catch(error) { console.error(error.message,error.where??'');process.exitCode=1; }
finally { await db.close(); }
