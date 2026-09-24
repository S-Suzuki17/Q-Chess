import {expect,it,vi} from 'vitest';
import {createServiceOperations,parseServiceStatus} from './ServiceOperations';
const normal=()=>parseServiceStatus({maintenance_mode:false});
it('normalizes a public status without exposing unrelated fields or HTML',()=>{
    expect(normal()).toEqual({maintenance:false,minimumAndroidBuild:0,minimumProtocol:0,announcement:{},revision:''});
    const value=parseServiceStatus({maintenance_mode:true,announcement_en:'Old',announcements:{en:' Updated ',ja:'更新',unknown:'x'},secret:'never'});
    expect(value.announcement).toEqual({en:'Updated',ja:'更新'});expect(JSON.stringify(value)).not.toContain('secret');
    for(const invalid of [null,{}, {maintenance_mode:false,minimum_android_build:-1}])expect(()=>parseServiceStatus(invalid)).toThrow();
});
it('coalesces reads, expires success and fails closed when upstream is unavailable',async()=>{
    let now=0;const load=vi.fn(async()=>normal()),ops=createServiceOperations(load,()=>now);
    expect(ops.acceptingNewMatches()).toBe(false);
    await Promise.all([ops.read(),ops.read(),ops.read()]);expect(load).toHaveBeenCalledTimes(1);expect(ops.acceptingNewMatches()).toBe(true);
    now=5001;load.mockRejectedValue(new Error('private detail'));
    expect(await ops.admission()).toBe('SERVICE_UNAVAILABLE');expect(ops.acceptingNewMatches()).toBe(false);
});
it('blocks new entry during maintenance and gates only configured versions',async()=>{
    expect(await createServiceOperations(async()=>({...normal(),maintenance:true})).admission()).toBe('MAINTENANCE');
    expect(await createServiceOperations(async()=>normal()).admission()).toBeNull();
    const ops=createServiceOperations(async()=>({...normal(),minimumProtocol:1,minimumAndroidBuild:20}));
    expect(await ops.admission()).toBe('UPDATE_REQUIRED');
    expect(await ops.admission({protocol:1,platform:'android',build:19})).toBe('UPDATE_REQUIRED');
    expect(await ops.admission({protocol:1,platform:'android',build:20})).toBeNull();
    expect(await ops.admission({protocol:1,platform:'web'})).toBeNull();
});
it('login guard keeps deletion, password recovery and existing-session access available',async()=>{
    const ops=createServiceOperations(async()=>({...normal(),maintenance:true}));
    for(const path of ['/account/delete','/account/recovery','/auth/ranked-session/revoke']){
        const next=vi.fn();await ops.loginGuard({path} as any,{} as any,next);expect(next).toHaveBeenCalledOnce();
    }
    for(const path of ['/auth/register','/auth/ranked-session']){
        const next=vi.fn(),res:any={setHeader:vi.fn(),status:vi.fn().mockReturnThis(),json:vi.fn()};
        await ops.loginGuard({path,headers:{}} as any,res,next);expect(next).not.toHaveBeenCalled();expect(res.status).toHaveBeenCalledWith(503);expect(res.json).toHaveBeenCalledWith({code:'MAINTENANCE'});
    }
});
