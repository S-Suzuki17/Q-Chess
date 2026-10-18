import {describe,it,expect,vi} from 'vitest';
import {startNativeCommerceRecovery} from './nativeCommerceRecovery';
const settle=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
function fixture(reconcile=vi.fn(async()=>{})){
 const listeners:Partial<Record<'pause'|'resume',()=>void>>={};let valid=true;
 const remove=vi.fn(async()=>{});
 const app={addListener:vi.fn(async(name:'pause'|'resume',callback:()=>void)=>{listeners[name]=callback;return{remove};})};
 const recovery=startNativeCommerceRecovery({app,current:()=>valid,reconcile});
 return {recovery,reconcile,remove,active:(value:boolean)=>listeners[value?'resume':'pause']?.(),revoke:()=>{valid=false;}};
}
describe('foreground commerce recovery',()=>{
 it('queries at login and once for a real background/foreground transition',async()=>{
  const f=fixture();await settle();expect(f.reconcile).toHaveBeenCalledTimes(1);
  f.active(true);f.active(true);await settle();expect(f.reconcile).toHaveBeenCalledTimes(1);
  f.active(false);f.active(true);await settle();expect(f.reconcile).toHaveBeenCalledTimes(2);
  f.recovery.dispose();await settle();expect(f.remove).toHaveBeenCalledTimes(2);
 });
 it('coalesces repeated triggers while one query runs; never overlaps',async()=>{
  let finish=()=>{};const reconcile=vi.fn(()=>new Promise<void>(resolve=>{finish=resolve;}));
  const f=fixture(reconcile);f.active(false);f.active(true);f.recovery.refresh();f.recovery.refresh();
  expect(reconcile).toHaveBeenCalledTimes(1);finish();await settle();expect(reconcile).toHaveBeenCalledTimes(2);
  finish();await settle();expect(reconcile).toHaveBeenCalledTimes(2);f.recovery.dispose();
 });
 it('offline failure retries on the next foreground/online request, not in a busy loop',async()=>{
  const f=fixture(vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined));
  await settle();expect(f.reconcile).toHaveBeenCalledTimes(1);f.recovery.refresh();await settle();expect(f.reconcile).toHaveBeenCalledTimes(2);f.recovery.dispose();
 });
 it('does not query while backgrounded and discards queued work when identity is revoked',async()=>{
  const f=fixture();await settle();f.active(false);f.recovery.refresh();await settle();expect(f.reconcile).toHaveBeenCalledTimes(1);
  f.revoke();f.active(true);await settle();expect(f.reconcile).toHaveBeenCalledTimes(1);f.recovery.dispose();
 });
 it('a late listener after disposal is removed and cannot query',async()=>{
  const finishes:((value:{remove:()=>Promise<void>})=>void)[]=[];const remove=vi.fn(async()=>{}),reconcile=vi.fn(async()=>{});
  const recovery=startNativeCommerceRecovery({app:{addListener:()=>new Promise(resolve=>{finishes.push(resolve);})},current:()=>true,reconcile});
  recovery.dispose();finishes.forEach(finish=>finish({remove}));await settle();recovery.refresh();await settle();expect(remove).toHaveBeenCalledTimes(2);expect(reconcile).toHaveBeenCalledTimes(1);
 });
});
