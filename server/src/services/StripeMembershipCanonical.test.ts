import { describe, expect, it, vi } from 'vitest';
import { StripeMembershipApi, type StripeEvent } from './StripeMembership';
import { invoiceFixture, paymentFixture } from './StripeTestFixtures';
import { stripeDeploymentModeAllowed } from './StripeDeploymentMode';

const config = { secretKey:'sk_test_FAKEKEY12345',webhookSecret:'whsec_FAKESECRET12345',
    priceId:'price_ABCDEFGH',successUrl:'https://q-gambit.com/',cancelUrl:'https://q-gambit.com/' };
const baseSubscription = { id:'sub_ABCDEFGH',customer:'cus_ABCDEFGH',livemode:false,status:'active',
    latest_invoice:'in_ABCDEFGH',cancel_at_period_end:false,automatic_tax:{enabled:false},
    items:{has_more:false,data:[{price:{id:config.priceId},quantity:1,current_period_end:1900000000}]} };
const baseCheckout = { id:'cs_test_ABCDEFGH',customer:'cus_ABCDEFGH',subscription:'sub_ABCDEFGH',
    livemode:false,mode:'subscription',client_reference_id:'Alice',status:'complete',payment_status:'paid' };
const event: StripeEvent = { id:'evt_ABCDEFGH',type:'invoice.paid',created:100,livemode:false,
    payloadHash:'a'.repeat(64),data:{object:{id:'in_ABCDEFGH',parent:invoiceFixture().parent}} };
function fixture({checkout=baseCheckout,subscription=baseSubscription,invoice=invoiceFixture(),
    transform=(data:unknown,_url:string)=>data}={}) {
    const request=vi.fn(async(url:string)=>Response.json(transform(
        url.includes('/subscriptions/')?subscription
            :url.includes('/checkout/sessions?')?{has_more:false,data:[checkout]}
                :paymentFixture(url)??invoice,url)));
    return {api:new StripeMembershipApi(config,request as unknown as typeof fetch),request};
}
describe('current-schema payment evidence and asynchronous Checkout',()=>{
    it('reads item period_end and grants without removed invoice.paid fields',async()=>{
        const {api}=fixture();
        expect(invoiceFixture()).not.toHaveProperty('paid');
        expect(await api.snapshot(event)).toMatchObject({status:'active',paidNewPeriod:true,
            periodEnd:new Date(1900000000*1000).toISOString()});
    });
    it('acknowledges a completed asynchronous pending/failed Checkout with no paid rights',async()=>{
        const {api,request}=fixture({checkout:{...baseCheckout,payment_status:'unpaid'}});
        for(const type of ['checkout.session.completed','checkout.session.async_payment_failed']) {
            expect(await api.snapshot({...event,type,data:{object:baseCheckout}})).toMatchObject({status:'unpaid',paidNewPeriod:false});
        }
        expect(request.mock.calls.every(([url])=>!url.includes('/invoices/'))).toBe(true);
    });
    it('uses canonical paid evidence when async succeeded arrives before an older completion',async()=>{
        const {api}=fixture();
        const success={...event,type:'checkout.session.async_payment_succeeded',data:{object:baseCheckout}};
        expect((await api.snapshot(success))?.status).toBe('active');
        expect((await api.snapshot({...success,type:'checkout.session.completed',created:1}))?.status).toBe('active');
    });
    it('retries pre-completion subscription notifications, then reconciles the same event',async()=>{
        const checkout={...baseCheckout,status:'open'};
        const {api}=fixture({checkout});
        const created={...event,type:'customer.subscription.created',data:{object:{id:baseSubscription.id}}};
        await expect(api.snapshot(created)).rejects.toThrow();
        checkout.status='complete';
        expect((await api.snapshot(created))?.status).toBe('active');
    });
    for(const [name,transform] of [
        ['discounted total',(d:any,url:string)=>url.includes('/invoices/')?{...d,total:298}:d],
        ['outside-Stripe payment',(d:any,url:string)=>url.includes('/invoices/')?{...d,amount_paid_off_stripe:299}:d],
        ['unpaid invoice',(d:any,url:string)=>url.includes('/invoices/')?{...d,status:'open'}:d],
        ['extra InvoicePayment',(d:any,url:string)=>url.includes('/invoice_payments?')?{...d,data:[...d.data,...d.data]}:d],
        ['foreign PaymentIntent customer',(d:any,url:string)=>url.includes('/payment_intents/')?{...d,customer:'cus_ATTACKER1'}:d],
        ['refunded Charge',(d:any,url:string)=>url.includes('/charges/')?{...d,amount_refunded:299}:d],
        ['disputed Charge',(d:any,url:string)=>url.includes('/charges/')?{...d,disputed:true}:d],
    ] as const) it(`withholds paid rights for ${name}`,async()=>{
        expect(await fixture({transform}).api.snapshot(event)).toMatchObject({status:'unpaid',paidNewPeriod:false});
    });
    it('requires explicit registration confirmation before automatic tax can be enabled',()=>{
        expect(()=>new StripeMembershipApi({...config,automaticTaxEnabled:true})).toThrow('STRIPE_CONFIG_REQUIRED');
        expect(()=>new StripeMembershipApi({...config,automaticTaxEnabled:true,taxRegistrationConfirmed:true})).not.toThrow();
    });
    it('fixes production to live and confines test QA to a separate sandbox deployment',()=>{
        expect(stripeDeploymentModeAllowed('production','live')).toBe(true);
        expect(stripeDeploymentModeAllowed('sandbox','test')).toBe(true);
        for(const [environment,mode] of [['production','test'],['sandbox','live'],[undefined,'test']]) {
            expect(stripeDeploymentModeAllowed(environment,mode)).toBe(false);
        }
    });
});
