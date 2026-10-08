import {afterEach,describe,expect,it} from 'vitest';
import {acceptAdEntitlement,canShowVerifiedAccountAds,resetAdEntitlement,verifiedAccountEntitlement} from './sharedAdEligibility';
afterEach(resetAdEntitlement);
describe('canonical no-ad consumers',()=>{
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
