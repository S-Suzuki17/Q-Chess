import {describe,it,expect} from 'vitest';
import {parsePlayCommerceHistoricalOrder} from './PlayCommercePaidOrder';
const token='bound-historical-token',orderId='GPA.1234-5678-9012-34567..0',now=Date.parse('2026-10-13T00:00:00Z');
const context={packageName:'com.qgambit.app' as const,purchaseToken:token,orderId,test:false,now};
const money={currencyCode:'JPY',units:'900',nanos:0};
const order=()=>({orderId,purchaseToken:token,state:'PROCESSED',createTime:'2026-08-01T00:00:00Z',lastEventTime:'2026-08-01T00:00:01Z',total:money,
 lineItems:[{productId:'qg_plus_monthly',listingPrice:money,total:money,subscriptionDetails:{basePlanId:'monthly',offerPhaseDetails:{baseDetails:{}},servicePeriodStartTime:'2026-08-01T00:00:00Z',servicePeriodEndTime:'2026-09-01T00:00:00Z'}}],orderHistory:{processedEvent:{eventTime:'2026-08-01T00:00:01Z'}}});
describe('historical Orders proof separate from current purchase access',()=>{
 it('uses only the requested immutable order and token, with its actual paid period',()=>{expect(parsePlayCommerceHistoricalOrder('plus_monthly',order(),context)).toMatchObject({paid:true,candidateHints:10,paidPeriod:{start:'2026-08-01T00:00:00.000000000Z',end:'2026-09-01T00:00:00.000000000Z'}});});
 it.each(['token','order','product','test'] as const)('rejects invalid historical %s binding',field=>{
  const raw:any=order(),ctx:any={...context};if(field==='token')raw.purchaseToken='another-bound-token';if(field==='order')ctx.orderId=orderId+'1';if(field==='product')raw.lineItems[0].productId='qg_standard_monthly';if(field==='test')ctx.test=undefined;
  expect(()=>parsePlayCommerceHistoricalOrder('plus_monthly',raw,ctx)).toThrow('INVALID_PURCHASE');
 });
 it('holds refunded historical orders and preserves exact order identity',()=>{const raw=order();raw.state='REFUNDED';expect(parsePlayCommerceHistoricalOrder('plus_monthly',raw,context)).toMatchObject({paid:false,candidateHints:0,orderKey:'com.qgambit.app:play-order:'+orderId});});
});
