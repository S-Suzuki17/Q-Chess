import {expect,it,vi} from 'vitest';
import {createSecurityAudit} from './SecurityAudit';
it('writes only typed minimal audit fields and caps concurrent storage work',async()=>{
    const finish:Array<()=>void>=[],write=vi.fn(()=>new Promise<void>(r=>finish.push(r))),audit=createSecurityAudit(write);
    const pending=Array.from({length:40},()=>audit('login','success','Alice'));
    expect(write).toHaveBeenCalledTimes(32);expect(write).toHaveBeenLastCalledWith('login','success','Alice');
    finish.forEach(r=>r());await Promise.all(pending);
});
it('does not leak an upstream secret or prevent user actions when audit storage fails',async()=>{
    const warn=vi.spyOn(console,'warn').mockImplementation(()=>{});
    try{const audit=createSecurityAudit(async()=>{throw new Error('secret bearer password');});await audit('login','error');await audit('login','error');
        expect(warn).toHaveBeenCalledOnce();expect(warn).toHaveBeenCalledWith('Security audit storage unavailable');
    }finally{warn.mockRestore();}
});
