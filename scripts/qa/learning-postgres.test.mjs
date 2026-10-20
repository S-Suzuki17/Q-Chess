import assert from 'node:assert/strict';
import {test} from 'node:test';
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {connect,account,contended,scalar,wallet} from './commerce-postgres-support.mjs';
import {setupBaseline} from './fixtures/commerce-postgres-baseline.mjs';
import {applyHintPolicyRelease,applyRelease22Forward,applySessionFile,learningMigrations} from './fixtures/session-postgres-baseline.mjs';

test('learning forward upgrade and independent PostgreSQL transactions',{timeout:120000},async t=>{
 const clients=[];const open=async role=>{const c=await connect(role);clients.push(c);return c;};
 const admin=await open();t.after(async()=>{await Promise.allSettled(clients.map(c=>c.end()));});
 const passed=[];const check=async(name,fn)=>t.test(name,async()=>{await fn();passed.push(name);});
 await setupBaseline(admin);await applyHintPolicyRelease(admin);await applyRelease22Forward(admin);
 const preserved=await account(admin,{ranked:7}),before=await wallet(admin,preserved);
 for(const file of learningMigrations)await applySessionFile(admin,file);
 assert.deepEqual(await wallet(admin,preserved),before);
 const a=await open('service_role'),b=await open('service_role');
 const tutorial=(c,user,id)=>scalar(c,"select public.complete_learning($1,'tutorial',$2,null,null) as result",[user,id]);
 const weekly=(c,user,week,n)=>scalar(c,"select public.complete_learning($1,'weekly',null,$2,$3) as result",[user,week,n]);
 const now=new Date(),utc=Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()-((now.getUTCDay()+5)%7),5);
 const opens=utc>Date.now()?utc-604800000:utc,week=new Date(opens).toISOString().slice(0,10);
 // Synthetic storage payloads: engine mate validation is covered by LearningRoutes and learning.test.ts.
 const problems=prefix=>Array.from({length:10},(_,i)=>({id:String(i+1),positionKey:`fixture:${prefix}:${i}`,state:{pieces:[]}}));
 const publish=(c,w,rows)=>scalar(c,'select public.publish_learning_week($1,$2) as result',[w,JSON.stringify(rows)]);
 await check('same lesson in two backends credits once',async()=>{
  const user=await account(admin);
  const [left,right]=await contended(admin,a,b,()=>tutorial(a,user,'pawn-step'),()=>tutorial(b,user,'pawn-step'));
  assert.equal(left.firstClear,true);assert.equal(right.firstClear,false);
  assert.equal((await wallet(admin,user)).ranked_tickets,1);
 });
 await check('different first clears serialize the alternating reward',async()=>{
  const user=await account(admin);
  const [left,right]=await contended(admin,a,b,()=>tutorial(a,user,'pawn-step'),()=>tutorial(b,user,'rook'));
  assert.equal(left.reward,'ranked');assert.equal(right.reward,'hint');
  const saved=await wallet(admin,user);assert.equal(saved.ranked_tickets,1);assert.equal(saved.hint_tickets,1);
 });
 await check('complete publication is immutable and atomic across workers',async()=>{
  const [left,right]=await contended(admin,a,b,()=>publish(a,week,problems(week)),()=>publish(b,week,problems('other')));
  assert.equal(left,true);assert.equal(right,false);
  assert.equal(await scalar(admin,'select count(*)::integer as result from public.learning_problems where week=$1',[week]),10);
  const future=new Date(opens+604800000).toISOString().slice(0,10);
  await assert.rejects(publish(a,future,problems(week)));
  assert.equal(await scalar(admin,'select count(*)::integer as result from public.learning_weeks where week=$1',[future]),0);
 });
 await check('fifth and tenth ads and final reward never repeat across tabs',async()=>{
  const user=await account(admin);
  for(let i=1;i<10;i++){const receipt=await weekly(a,user,week,i);assert.equal(receipt.adCheckpoint,i===5?5:0);assert.equal(receipt.reward,null);}
  const [left,right]=await contended(admin,a,b,()=>weekly(a,user,week,10),()=>weekly(b,user,week,10));
  assert.equal(left.adCheckpoint,10);assert.equal(left.reward,'ranked');
  assert.equal(right.adCheckpoint,0);assert.equal(right.reward,null);
  assert.equal((await wallet(admin,user)).ranked_tickets,1);
 });
 await check('rollback leaves no receipt and the next claimant earns the first reward',async()=>{
  const user=await account(admin);
  const [,right]=await contended(admin,a,b,()=>tutorial(a,user,'pawn-step'),()=>tutorial(b,user,'pawn-step'),{rollback:true});
  assert.equal(right.firstClear,true);assert.equal(right.reward,'ranked');
  assert.equal((await wallet(admin,user)).ranked_tickets,1);
 });
 await check('account erasure cascades completions and browser roles cannot access them',async()=>{
  const user=await account(admin);await tutorial(a,user,'pawn-step');
  await admin.query('delete from public.profiles where id=$1',[user]);
  assert.equal(await scalar(admin,'select count(*)::integer as result from public.tutorial_completions where user_id=$1',[user]),0);
  for(const role of ['anon','authenticated']){
   const client=await open(role);
   await assert.rejects(tutorial(client,preserved,'pawn-step'));
   await assert.rejects(client.query('select * from public.tutorial_completions'));
   await assert.rejects(publish(client,week,problems('forged')));
  }
 });
 await writeFile(join(tmpdir(),'learning-postgres-results.json'),JSON.stringify({passed,postgres:17,externalRequests:false},null,2));
});
