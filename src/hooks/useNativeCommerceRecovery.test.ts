import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
const h=vi.hoisted(()=>({allowed:true,revision:1,enabled:true,valid:true,read:vi.fn(),restore:vi.fn(),effects:[] as (()=>void|(()=>void))[],refresh:vi.fn(),dispose:vi.fn(),options:null as null|{current:()=>boolean;reconcile:()=>Promise<unknown>}}));
vi.mock('react',()=>({useEffect:(effect:()=>void|(()=>void))=>h.effects.push(effect)}));
vi.mock('@capacitor/app',()=>({App:{}}));
vi.mock('./useCircuitAccess',()=>({useCircuitAccess:()=>({allowed:h.allowed,revision:h.revision})}));
vi.mock('../lib/circuitAccess',()=>({circuitAccess:{permit:()=>()=>h.valid}}));
vi.mock('../lib/nativeCommerce',()=>({nativeCommerceEnabled:()=>h.enabled,readNativeCommerce:h.read,restoreNativeCommerce:h.restore}));
vi.mock('../lib/nativeCommerceRecovery',()=>({startNativeCommerceRecovery:(options:typeof h.options)=>{h.options=options;return{refresh:h.refresh,dispose:h.dispose};}}));
import {useNativeCommerceRecovery} from './useNativeCommerceRecovery';
const user={id:'alice',name:'Alice',type:'registered' as const};
function Mount(){useNativeCommerceRecovery(user);return h.effects.splice(0).map(effect=>effect()).find(Boolean) as (()=>void)|undefined;}
beforeEach(()=>{vi.clearAllMocks();h.effects=[];h.options=null;h.allowed=true;h.valid=true;h.enabled=true;h.read.mockResolvedValue({ready:true,enabled:false});h.restore.mockResolvedValue('done');vi.stubGlobal('window',new EventTarget());});
afterEach(()=>vi.unstubAllGlobals());
describe('native recovery account and sales boundaries',()=>{
 it('recovers an existing purchase while new sales are disabled',async()=>{const cleanup=Mount();await h.options!.reconcile();expect(h.restore).toHaveBeenCalledWith('alice',expect.any(Function));cleanup?.();});
 it('does not query on Web, guest/revoked access, or an unready server',async()=>{
  h.enabled=false;Mount();expect(h.options).toBe(null);h.enabled=true;h.allowed=false;Mount();expect(h.options).toBe(null);
  h.allowed=true;const cleanup=Mount();h.read.mockResolvedValue({ready:false});await h.options!.reconcile();expect(h.restore).not.toHaveBeenCalled();cleanup?.();
 });
 it('ignores a status response after account revocation and removes online retry on unmount',async()=>{
  const cleanup=Mount();h.read.mockImplementation(async()=>{h.valid=false;return{ready:true};});await h.options!.reconcile();expect(h.restore).not.toHaveBeenCalled();
  window.dispatchEvent(new Event('online'));expect(h.refresh).toHaveBeenCalledTimes(1);cleanup?.();window.dispatchEvent(new Event('online'));expect(h.refresh).toHaveBeenCalledTimes(1);expect(h.dispose).toHaveBeenCalledTimes(1);expect(h.options!.current()).toBe(false);
 });
});
