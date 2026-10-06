import { priceFixture, checkoutLineFixture, checkoutEvidenceFixture } from './StripeTestFixtures';
import { describe, expect, it, vi } from 'vitest';
import { StripeMembershipApi, type StripeEvent } from './StripeMembership';
import { invoiceFixture, paymentFixture } from './StripeTestFixtures';
import { stripeDeploymentModeAllowed } from './StripeDeploymentMode';

const config = { secretKey:'sk_test_FAKEKEY12345',webhookSecret:'whsec_FAKESECRET12345',
    priceId:'price_ABCDEFGH',successUrl:'https://q-gambit.com/',cancelUrl:'https://q-gambit.com/' };
const baseSubscription = { id:'sub_ABCDEFGH',customer:'cus_ABCDEFGH',livemode:false,status:'active',
    latest_invoice:'in_ABCDEFGH',cancel_at_period_end:false,automatic_tax:{enabled:false},
    items:{has_more:false,data:[{price:priceFixture(),quantity:1,current_period_end:1900000000}]} };
const baseCheckout = { id:'cs_test_ABCDEFGH',customer:'cus_ABCDEFGH',subscription:'sub_ABCDEFGH',
    livemode:false,mode:'subscription',client_reference_id:'Alice',status:'complete',payment_status:'paid',...checkoutEvidenceFixture() };
const event: StripeEvent = { id:'evt_ABCDEFGH',type:'invoice.paid',created:100,livemode:false,
    payloadHash:'a'.repeat(64),data:{object:{id:'in_ABCDEFGH',parent:invoiceFixture().parent}} };
function fixture({checkout=baseCheckout,subscription=baseSubscription,invoice=invoiceFixture(false, config.priceId, 299, 1900000000),
    transform=(data:unknown,_url:string)=>data}={}) {
    const request=vi.fn(async(url:string)=>Response.json(transform(
        url.includes('/subscriptions/')?subscription
            :url.includes('/checkout/sessions?')?{has_more:false,data:[checkout]}
                :url.includes('/line_items?')?checkoutLineFixture():paymentFixture(url)??invoice,url)));
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
        ['subscription 300 cents',(d:any,url:string)=>url.includes('/subscriptions/')?{...d,items:{...d.items,data:[{...d.items.data[0],price:{...d.items.data[0].price,unit_amount:300}}]}}:d],
        ['subscription foreign price',(d:any,url:string)=>url.includes('/subscriptions/')?{...d,items:{...d.items,data:[{...d.items.data[0],price:{...d.items.data[0].price,id:'price_OTHER123'}}]}}:d],
        ['subscription wrong interval',(d:any,url:string)=>url.includes('/subscriptions/')?{...d,items:{...d.items,data:[{...d.items.data[0],price:{...d.items.data[0].price,recurring:{interval:'year',interval_count:1}}}]}}:d],
        ['subscription exclusive tax',(d:any,url:string)=>url.includes('/subscriptions/')?{...d,items:{...d.items,data:[{...d.items.data[0],price:{...d.items.data[0].price,tax_behavior:'exclusive'}}]}}:d],
        ['Checkout changed total',(d:any,url:string)=>url.includes('/checkout/sessions?')?{...d,data:[{...d.data[0],amount_total:300}]}:d],
        ['Checkout changed currency',(d:any,url:string)=>url.includes('/checkout/sessions?')?{...d,data:[{...d.data[0],currency:'jpy'}]}:d],
        ['Checkout exclusive Price',(d:any,url:string)=>url.includes('/line_items?')?{...d,data:[{...d.data[0],price:{...d.data[0].price,tax_behavior:'exclusive'}}]}:d],
        ['Checkout foreign Price',(d:any,url:string)=>url.includes('/line_items?')?{...d,data:[{...d.data[0],price:{...d.data[0].price,id:'price_OTHER123'}}]}:d],
        ['Checkout line amount',(d:any,url:string)=>url.includes('/line_items?')?{...d,data:[{...d.data[0],amount_total:600}]}:d],
        ['Checkout line discount',(d:any,url:string)=>url.includes('/line_items?')?{...d,data:[{...d.data[0],amount_discount:1}]}:d],
        ['Checkout extra line',(d:any,url:string)=>url.includes('/line_items?')?{...d,data:[...d.data,...d.data]}:d],
        ['Checkout partial pagination',(d:any,url:string)=>url.includes('/line_items?')?{...d,has_more:true}:d],
        ['invoice foreign Price',(d:any,url:string)=>url.includes('/invoices/')?{...d,lines:{...d.lines,data:[{...d.lines.data[0],pricing:{type:'price_details',price_details:{price:'price_OTHER123'}}}]}}:d],
        ['invoice extra line',(d:any,url:string)=>url.includes('/invoices/')?{...d,lines:{...d.lines,data:[...d.lines.data,...d.lines.data]}}:d],
        ['invoice partial pagination',(d:any,url:string)=>url.includes('/invoices/')?{...d,lines:{...d.lines,has_more:true}}:d],
        ['invoice fractional quantity',(d:any,url:string)=>url.includes('/invoices/')?{...d,lines:{...d.lines,data:[{...d.lines.data[0],quantity_decimal:'1.5'}]}}:d],
        ['invoice proration',(d:any,url:string)=>url.includes('/invoices/')?{...d,lines:{...d.lines,data:[{...d.lines.data[0],parent:{...d.lines.data[0].parent,subscription_item_details:{subscription:'sub_ABCDEFGH',proration:true}}}]}}:d],
        ['invoice for another period',(d:any,url:string)=>url.includes('/invoices/')?{...d,lines:{...d.lines,data:[{...d.lines.data[0],period:{start:1800000000,end:1800000001}}]}}:d],
        ['invoice exclusive tax',(d:any,url:string)=>url.includes('/invoices/')?{...d,lines:{...d.lines,data:[{...d.lines.data[0],taxes:[{tax_behavior:'exclusive',amount:1}]}]}}:d],
        ['invoice 300 cent total',(d:any,url:string)=>url.includes('/invoices/')?{...d,total:300,amount_paid:300}:d],
        ['InvoicePayment 300 cents',(d:any,url:string)=>url.includes('/invoice_payments?')?{...d,data:[{...d.data[0],amount_paid:300}]}:d],
        ['PaymentIntent 600 cents',(d:any,url:string)=>url.includes('/payment_intents/')?{...d,amount:600,amount_received:600}:d],
        ['uncaptured Charge',(d:any,url:string)=>url.includes('/charges/')?{...d,captured:false}:d],
        ['Charge 600 cents',(d:any,url:string)=>url.includes('/charges/')?{...d,amount:600}:d],
        ['Charge partial capture',(d:any,url:string)=>url.includes('/charges/')?{...d,amount_captured:298}:d],

        ['outside-Stripe payment',(d:any,url:string)=>url.includes('/invoices/')?{...d,amount_paid_off_stripe:300}:d],
        ['unpaid invoice',(d:any,url:string)=>url.includes('/invoices/')?{...d,status:'open'}:d],
        ['extra InvoicePayment',(d:any,url:string)=>url.includes('/invoice_payments?')?{...d,data:[...d.data,...d.data]}:d],
        ['foreign PaymentIntent customer',(d:any,url:string)=>url.includes('/payment_intents/')?{...d,customer:'cus_ATTACKER1'}:d],
        ['refunded Charge',(d:any,url:string)=>url.includes('/charges/')?{...d,amount_refunded:300}:d],
        ['disputed Charge',(d:any,url:string)=>url.includes('/charges/')?{...d,disputed:true}:d],
    ] as const) it(`withholds paid rights for ${name}`,async()=>{
        expect(await fixture({transform}).api.snapshot(event)).toMatchObject({status:'unpaid',paidNewPeriod:false});
    });
    it('retains legacy299 entitlement when its Price is archived and nullable tax/discount arrays are empty', async()=>{
        const {api}=fixture({transform:(d:any,url:string)=>url.includes('/subscriptions/')
            ? {...d,items:{...d.items,data:[{...d.items.data[0],price:{...d.items.data[0].price,active:false}}]}}
            : url.includes('/invoices/') ? {...d,lines:{...d.lines,data:[{...d.lines.data[0],taxes:null,discount_amounts:null}]}} : d});
        expect(await api.snapshot(event)).toMatchObject({status:'active',paidNewPeriod:true,priceId:config.priceId});
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
