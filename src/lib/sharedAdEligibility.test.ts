import {afterEach,describe,expect,it,vi} from 'vitest';
import {acceptAdEntitlement,canShowVerifiedAccountAds,resetAdEntitlement,verifiedAccountEntitlement,subscribeAdEntitlement} from './sharedAdEligibility';
afterEach(()=>{resetAdEntitlement();vi.useRealTimers();});
describe('canonical no-ad consumers',()=>{
    it('notifies mounted reward controls when verification arrives, expires or is reset',()=>{
        vi.useFakeTimers();const states:boolean[]=[];
        const unsubscribe=subscribeAdEntitlement(()=>states.push(canShowVerifiedAccountAds()));
        acceptAdEntitlement('Alice',{plan:'free',noAds:false,unlimitedOnlineRanked:false,periodEnd:null});
        vi.advanceTimersByTime(60_000);expect(states).toEqual([true,false]);
        resetAdEntitlement();expect(states.at(-1)).toBe(false);unsubscribe();
        acceptAdEntitlement('Alice',{plan:'free',noAds:false,unlimitedOnlineRanked:false,periodEnd:null});expect(states).toHaveLength(3);
    });
    it('unknown, stale and signed-out eligibility do not request ads',()=>{
        expect(canShowVerifiedAccountAds()).toBe(false);
        acceptAdEntitlement('Alice',{plan:'free',noAds:false,unlimitedOnlineRanked:false,periodEnd:null},1000);
        expect(canShowVerifiedAccountAds(1001)).toBe(true);expect(canShowVerifiedAccountAds(61000)).toBe(false);
        expect(verifiedAccountEntitlement('Bob',1001)).toBeNull();resetAdEntitlement();expect(canShowVerifiedAccountAds(1001)).toBe(false);
    });
    it.each(['standard','plus'])('%s suppresses all ad consumers',plan=>{
        acceptAdEntitlement('Alice',{plan,noAds:true,unlimitedOnlineRanked:true,periodEnd:'2099-01-01'},1000);
        expect(canShowVerifiedAccountAds(1001)).toBe(false);
    });
});
