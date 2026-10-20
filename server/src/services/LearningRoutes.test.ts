import express from 'express';
import http from 'node:http';
import type {AddressInfo} from 'node:net';
import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import {RankedAuth} from './RankedAuth';
import {AccountWriteGate} from './AccountDeletion';
import {createLearningRouter} from './LearningRoutes';
import type {LearningStore} from './LearningStore';
import {tutorialCourse,tutorialReferenceMove} from '../learning/tutorialCourse';
import {generateWeeklyProblems,mateSolutions} from '../learning/weeklyProblems';
import {createLearningMaintenance} from './LearningMaintenance';
describe('learning reward HTTP authorization and proof validation',()=>{
 let server:http.Server,base:string,token:string,enabled:boolean,auth:RankedAuth,clock:number;
 let store:{[K in keyof LearningStore]:ReturnType<typeof vi.fn>};
 const state={tutorial:[],weekly:[],weeklyRewarded:false,tickets:{ranked:0,hint:0}};
 const lesson=tutorialCourse[0];
 const body={kind:'tutorial',lessonId:lesson.id,moves:[tutorialReferenceMove(lesson.create(),lesson.tasks[0])]};
 const post=(value:unknown,proof=token)=>fetch(base+'/learning/complete',{method:'POST',headers:{Authorization:`Bearer ${proof}`,'Content-Type':'application/json'},body:JSON.stringify(value)});
 beforeEach(async()=>{
  enabled=true;clock=Date.parse('2026-10-20T05:00:00Z');
  store={verifyUser:vi.fn().mockResolvedValue(null),blocked:vi.fn().mockResolvedValue(false),hasCurrentTerms:vi.fn().mockResolvedValue(true),
    week:vi.fn().mockResolvedValue(null),progress:vi.fn().mockResolvedValue(state),
    complete:vi.fn().mockResolvedValue({...state,firstClear:true,reward:'ranked',adCheckpoint:0}),
    previousPositions:vi.fn().mockResolvedValue(new Set()),publish:vi.fn().mockResolvedValue(undefined)};
  auth=new RankedAuth(async(id,pw)=>['Alice','Bob'].includes(id)&&pw==='right');
  token=(await auth.issueLegacySession('Alice','right'))!.token;
  const app=express();app.use(createLearningRouter(auth,store,new AccountWriteGate(),()=>enabled,()=>clock));
  server=http.createServer(app);await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  base=`http://127.0.0.1:${(server.address() as AddressInfo).port}`;
 });
 afterEach(async()=>{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));});
 it('only credits a replayed full lesson under the authenticated owner',async()=>{
  expect((await post(body)).status).toBe(200);
  expect(store.complete).toHaveBeenCalledWith('Alice',body);
  store.complete.mockClear();
  for(const bad of [{...body,userId:'Bob'},{...body,amount:99},{...body,moves:[]},{...body,moves:[{...body.moves[0],target:{row:0,col:0}}]}]){
    expect((await post(bad)).status).toBe(400);
  }
  expect(store.complete).not.toHaveBeenCalled();
 });
 it('denies forged/revoked sessions, old consent, deletion and disabled rollout',async()=>{
  expect((await post(body,'GUEST-forged')).status).toBe(401);
  store.hasCurrentTerms.mockResolvedValue(false);expect((await post(body)).status).toBe(403);
  store.hasCurrentTerms.mockResolvedValue(true);store.blocked.mockResolvedValue(true);expect((await post(body)).status).toBe(423);
  store.blocked.mockResolvedValue(false);await auth.revokeUserSessions('Alice');expect((await post(body)).status).toBe(401);
  enabled=false;expect((await post(body)).status).toBe(503);
  expect(store.complete).not.toHaveBeenCalled();
 });
 it('does not let unauthenticated traffic consume a shared proxy learning allowance',async()=>{
  for(let i=0;i<121;i++)expect((await fetch(base+'/learning')).status).toBe(401);
  expect((await post(body)).status).toBe(200);
  expect(store.complete).toHaveBeenCalledTimes(1);
 });
 it('limits both routes per verified account across sessions and expires the window',async()=>{
  const read=(proof:string)=>fetch(base+'/learning',{headers:{Authorization:`Bearer ${proof}`}});
  for(let i=0;i<120;i++)expect((await read(token)).status).toBe(200);
  const limited=await post(body);
  expect(limited.status).toBe(429);expect(limited.headers.get('Retry-After')).toBe('60');
  const secondAlice=(await auth.issueLegacySession('Alice','right'))!.token;
  expect((await read(secondAlice)).status).toBe(429);
  const bob=(await auth.issueLegacySession('Bob','right'))!.token;
  expect((await post(body,bob)).status).toBe(200);
  expect(store.complete).toHaveBeenCalledWith('Bob',body);
  clock+=60000;
  expect((await read(secondAlice)).status).toBe(200);
 });
 it('validates the stored weekly board, without accepting a client-chosen position',async()=>{
  const set=await generateWeeklyProblems(Date.parse('2026-10-20T05:00:00Z'));
  store.week.mockResolvedValue(set);
  const submission={kind:'weekly',week:set.week,problemId:1,moves:[mateSolutions(set.problems[0].state)[0]]};
  expect((await post(submission)).status).toBe(200);
  store.complete.mockClear();
  expect((await post({...submission,state:set.problems[0].state})).status).toBe(400);
  expect((await post({...submission,moves:[{...submission.moves[0],pieceId:'forged'}]})).status).toBe(400);
  expect(store.complete).not.toHaveBeenCalled();
 },15000);
 it('maintenance catches up after restart and retries a failed atomic publication',async()=>{
  const generate=vi.fn().mockResolvedValue({week:'2026-10-20',problems:[]});
  store.publish.mockRejectedValueOnce(new Error('temporary'));
  const tick=createLearningMaintenance(store,()=>Date.parse('2026-10-20T02:00:00Z'),generate);
  await expect(tick()).rejects.toThrow('temporary');
  await tick();await tick();
  expect(store.publish).toHaveBeenCalledTimes(2);
 });
});
