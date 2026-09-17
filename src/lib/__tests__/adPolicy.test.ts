import {describe,it,expect} from 'vitest';
import {AD_POLICY,emptyAllowance,remainingAllowance,consumeAllowance,applyVerifiedReward,requestCircuitInterstitial} from '../adPolicy';
describe('disabled ads and future allowance model',()=>{
 const today=Date.UTC(2026,8,17,23,59),tomorrow=today+60000;
 it('does not enforce limits or pretend banners are rewarded ads',async()=>{
  expect(Object.values(AD_POLICY)).toEqual([false,false,false]);
  expect(await requestCircuitInterstitial('match-1')).toBe('unavailable');
 });
 it('counts categories independently, charges once and adds exactly three',()=>{
  let state=emptyAllowance(today);
  for(let i=0;i<3;i++)state=consumeAllowance(state,'hint','hint-'+i,today)!;
  expect(remainingAllowance(state,'hint',today)).toBe(0);
  expect(remainingAllowance(state,'online',today)).toBe(3);
  expect(consumeAllowance(state,'hint','hint-2',today)).toBe(state);
  expect(consumeAllowance(state,'hint','hint-3',today)).toBeNull();
  state=applyVerifiedReward(state,'hint','verified-receipt');
  expect(remainingAllowance(state,'hint',today)).toBe(3);
  expect(applyVerifiedReward(state,'online','verified-receipt')).toBe(state);
  state=consumeAllowance(state,'hint','hint-3',today)!;
  expect(remainingAllowance(state,'hint',tomorrow)).toBe(5);
  expect(consumeAllowance(state,'hint','hint-3',tomorrow)).toBe(state);
 });
});
