import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const policy=vi.hoisted(()=>({effective:true,date:'2026-10-03' as string|null}));
vi.mock('../config/currentTerms',()=>({CURRENT_TERMS_VERSION:'2026-10-03.1',get CURRENT_TERMS_EFFECTIVE_DATE(){return policy.date;},currentTermsEffective:()=>policy.effective}));
vi.mock('./accountProfile',()=>({requestAccountProfile:vi.fn()}));
import {requestAccountProfile} from './accountProfile';
import {acceptCurrentAccountTerms,currentAccountTermsStatus,requireCurrentAccountTerms,CURRENT_TERMS_ACCEPTED_EVENT} from './currentAccountTerms';
const value={userId:'Alice',currentVersion:'2026-10-03.1',effectiveDate:'2026-10-03',effective:true,consent:null as {version:string;acceptedAt:string}|null};
beforeEach(()=>{vi.clearAllMocks();policy.date='2026-10-03';policy.effective=true;vi.stubGlobal('window',new EventTarget());vi.mocked(requestAccountProfile).mockResolvedValue({...value});});
afterEach(()=>vi.unstubAllGlobals());
it('does not convert old or absent consent into new consent',async()=>{
 expect(await currentAccountTermsStatus('Alice')).toEqual({effective:true,accepted:false});
 await expect(requireCurrentAccountTerms('Alice')).rejects.toThrow('CURRENT_TERMS_REQUIRED');
 vi.mocked(requestAccountProfile).mockResolvedValue({...value,consent:{version:'2026-09-25.1',acceptedAt:'2026-10-03T00:00:00Z'}});
 await expect(requireCurrentAccountTerms('Alice')).rejects.toThrow('TERMS_UNAVAILABLE');
});
it('accepts explicitly with only version and acceptance and announces server-confirmed owner',async()=>{
 vi.mocked(requestAccountProfile).mockResolvedValue({...value,consent:{version:'2026-10-03.1',acceptedAt:'2026-10-03T00:00:00Z'}});
 const event=vi.fn();window.addEventListener(CURRENT_TERMS_ACCEPTED_EVENT,event);
 await acceptCurrentAccountTerms('Alice');
 expect(requestAccountProfile).toHaveBeenCalledExactlyOnceWith('/account/current-terms','Alice',{version:'2026-10-03.1',accepted:true},undefined);
 expect(event).toHaveBeenCalledOnce();expect(event.mock.calls[0][0].detail).toEqual({userId:'Alice'});
});
it('fails closed for unpublished or mismatched publication dates and never sends acceptance while unpublished',async()=>{
 policy.effective=false;policy.date=null;await expect(acceptCurrentAccountTerms('Alice')).rejects.toThrow('TERMS_NOT_EFFECTIVE');expect(requestAccountProfile).not.toHaveBeenCalled();
 policy.effective=true;policy.date='2026-10-04';await expect(currentAccountTermsStatus('Alice')).rejects.toThrow('TERMS_UPDATED');
});
it('does not announce acceptance from an absent server record or aborted account request',async()=>{
 const event=vi.fn();window.addEventListener(CURRENT_TERMS_ACCEPTED_EVENT,event);
 await expect(acceptCurrentAccountTerms('Alice')).rejects.toThrow('TERMS_UNAVAILABLE');
 const controller=new AbortController();controller.abort();vi.mocked(requestAccountProfile).mockResolvedValue({...value,consent:{version:'2026-10-03.1',acceptedAt:'2026-10-03T00:00:00Z'}});
 await expect(acceptCurrentAccountTerms('Alice',controller.signal)).rejects.toThrow();expect(event).not.toHaveBeenCalled();
});
