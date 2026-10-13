import {describe,it,expect,vi} from 'vitest';
import {createServiceOperations,createOAuthAdmissionHandler} from './ServiceOperations';
const baseline={maintenance:false,minimumAndroidBuild:0,minimumProtocol:0,announcement:{},revision:'fixture'};
function response(){const res={setHeader:vi.fn(),status:vi.fn(),json:vi.fn()};res.status.mockReturnValue(res);res.json.mockReturnValue(res);return res;}
const request={headers:{authorization:'Bearer aaa.bbb.ccc','x-qg-protocol':'1'},query:{}};
describe('explicit OAuth new admission',()=>{
 it('rejects provider callback during maintenance before profile admission',async()=>{
  const operations=createServiceOperations(async()=>baseline,()=>Date.parse('2026-10-13T02:00:00Z')),verify=vi.fn(async()=> 'oauth-user'),res=response();
  await createOAuthAdmissionHandler(operations,verify)(request as never,res as never,vi.fn());expect(res.status).toHaveBeenCalledWith(503);expect(res.json).toHaveBeenCalledWith({code:'MAINTENANCE'});expect(verify).not.toHaveBeenCalled();
 });
 it('rechecks after provider await crosses the start boundary',async()=>{
  let now=Date.parse('2026-10-13T01:59:59.999Z');const operations=createServiceOperations(async()=>baseline,()=>now),res=response();
  await createOAuthAdmissionHandler(operations,async()=>{now++;return 'oauth-user';})(request as never,res as never,vi.fn());expect(res.json).toHaveBeenCalledWith({code:'MAINTENANCE'});
 });
 it('returns only verified identity after the end boundary',async()=>{
  const operations=createServiceOperations(async()=>baseline,()=>Date.parse('2026-10-13T05:00:00Z')),res=response();
  await createOAuthAdmissionHandler(operations,async()=> 'oauth-user')(request as never,res as never,vi.fn());expect(res.json).toHaveBeenCalledWith({userId:'oauth-user',admitted:true});
 });
 it('fails closed on identity failure and leaves inspection/recovery routes outside loginGuard',async()=>{
  const operations=createServiceOperations(async()=>baseline,()=>Date.parse('2026-10-13T05:00:00Z')),res=response();
  await createOAuthAdmissionHandler(operations,async()=>null)(request as never,res as never,vi.fn());expect(res.status).toHaveBeenCalledWith(401);
  const stopped=createServiceOperations(async()=>({...baseline,maintenance:true}));
  for(const path of ['/auth/ranked-session/inspect','/account/recovery','/account/deletion']){const next=vi.fn();await stopped.loginGuard({path} as never,response() as never,next);expect(next).toHaveBeenCalledOnce();}
 });
});
