import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const h=vi.hoisted(()=>({native:false,date:null as string|null,consent:vi.fn(),fetch:vi.fn()}));
vi.mock('@capacitor/core',()=>({Capacitor:{isNativePlatform:()=>h.native}}));
vi.mock('../lib/supabaseClient',()=>({supabase:{auth:{getSession:vi.fn()}}}));
vi.mock('../lib/rankedSession',()=>({gameServerUrl:()=> 'https://game.example',readRankedSession:()=>({token:'verified-proof'})}));
vi.mock('../lib/currentAccountTerms',()=>({requireCurrentAccountTerms:h.consent}));
vi.mock('./currentTerms',async original=>({...await original<typeof import('./currentTerms')>(),get CURRENT_TERMS_EFFECTIVE_DATE(){return h.date;}}));
const names=['DAILY_LOGIN_REWARDS_ENABLED','STRIPE_WEB_MEMBERSHIP_ENABLED','STRIPE_WEB_CHECKOUT_ENABLED','STRIPE_WEB_PORTAL_ENABLED',
    'MEMBER_TICKET_USAGE_ENABLED','CPU_HINT_TICKETS_ENABLED','RANKED_REFUND_BALANCE_ENABLED','WEB_COMMERCE_SALES_RELEASE_READY'];
const set=(name:string,value:string|undefined)=>vi.stubEnv('NEXT_PUBLIC_QG_'+name,value);
const enable=()=>names.forEach(name=>set(name,'true'));
const modules=async()=>({daily:await import('../lib/dailyLoginRewards'),stripe:await import('../lib/stripeMembership'),
    cpu:await import('../lib/cpuPractice'),refund:await import('../lib/rankedRefundBalance'),commerce:await import('./webCommerce')});
const values=(m:Awaited<ReturnType<typeof modules>>)=>[m.daily.DAILY_LOGIN_REWARDS_ENABLED,m.stripe.STRIPE_WEB_MEMBERSHIP_ENABLED,
    m.stripe.STRIPE_WEB_CHECKOUT_ENABLED,m.stripe.STRIPE_WEB_PORTAL_ENABLED,m.stripe.MEMBER_TICKET_USAGE_ENABLED,
    m.cpu.CPU_HINT_TICKETS_ENABLED,m.refund.RANKED_REFUND_BALANCE_ENABLED,m.commerce.WEB_COMMERCE_SALES_RELEASE_READY];
const member={userId:'Alice',enabled:true,active:true,canManageBilling:true,cancelAtPeriodEnd:false,
    periodEnd:'2099-01-01T00:00:00Z',lastGrantUtcDay:null,tickets:{ranked:60,hint:60}};
beforeEach(()=>{
 vi.resetModules();names.forEach(name=>set(name,undefined));vi.stubEnv('NEXT_PUBLIC_APP_TARGET','web');
 h.native=false;h.date=null;h.consent.mockReset().mockResolvedValue(undefined);h.fetch.mockReset();vi.stubGlobal('fetch',h.fetch);
 h.fetch.mockImplementation(async (url:URL)=>Response.json(url.pathname.endsWith('/portal')?{url:'https://billing.stripe.com/p/session/owned_123456'}:
    url.pathname.endsWith('/checkout')?{url:'https://checkout.stripe.com/c/pay/owned'}:
    url.pathname.endsWith('/ranked-refunds')?{userId:'Alice',enabled:true,freeRankedRefunds:25,paidRankedRefunds:64}:
    url.pathname.includes('/daily-login')?{userId:'Alice',enabled:true,streakDays:1,lastClaimUtcDay:'2026-10-03',tickets:{ranked:1,hint:2},credited:{ranked:1,hint:2}}:member));
});
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
it.each([undefined,'false','1','TRUE','yes',' true'])('defaults OFF unless the exact public value is true (%s)',async(value)=>{
 names.forEach(name=>set(name,value));expect(values(await modules())).toEqual(names.map(()=>false));expect(h.fetch).not.toHaveBeenCalled();
});
it('independently enables all requested Web flags but keeps Checkout behind publication and consent',async()=>{
 enable();const m=await modules();expect(values(m)).toEqual(names.map(()=>true));
 expect(m.commerce.webCommerceCheckoutReady()).toBe(false);await expect(m.stripe.prepareStripeCheckout('Alice')).rejects.toThrow('DISABLED');expect(h.fetch).not.toHaveBeenCalled();
 h.date='2026-01-01';expect(m.commerce.webCommerceCheckoutReady()).toBe(true);
 h.consent.mockRejectedValueOnce(new Error('CURRENT_TERMS_REQUIRED'));
 await expect(m.stripe.prepareStripeCheckout('Alice')).rejects.toThrow('UNAVAILABLE');expect(h.fetch).not.toHaveBeenCalled();
 await expect(m.stripe.prepareStripeCheckout('Alice')).resolves.toBe('https://checkout.stripe.com/c/pay/owned');
 await expect(m.daily.claimDailyLoginReward('Alice')).resolves.toMatchObject({tickets:{ranked:1,hint:2}});
 await expect(m.refund.readRankedRefundBalance('Alice')).resolves.toMatchObject({freeRankedRefunds:25,paidRankedRefunds:64});
 expect(h.consent).toHaveBeenCalledWith('Alice',undefined);
});
it('keeps existing billing and ticket use available when Checkout and offers are independently OFF',async()=>{
 set('STRIPE_WEB_PORTAL_ENABLED','true');set('MEMBER_TICKET_USAGE_ENABLED','true');const m=await modules();
 await expect(m.stripe.prepareStripeCheckout('Alice')).rejects.toThrow('DISABLED');
 await expect(m.stripe.readStripeMembershipStatus('Alice')).resolves.toMatchObject({canManageBilling:true});
 await expect(m.stripe.prepareStripeBillingPortal('Alice')).resolves.toBe('https://billing.stripe.com/p/session/owned_123456');expect(h.consent).not.toHaveBeenCalled();
 await expect(m.stripe.readMemberTicketStatus('Alice')).resolves.toMatchObject({tickets:{ranked:60,hint:60}});
 await expect(m.stripe.claimMemberTickets('Alice')).resolves.toMatchObject({active:true});expect(h.consent).toHaveBeenCalledOnce();
});
it.each(['android-build','native-runtime'])('blocks purchase, portal and offers with all flags ON on %s, while member use remains independent',async(boundary)=>{
 enable();h.date='2026-01-01';if(boundary==='android-build')vi.stubEnv('NEXT_PUBLIC_APP_TARGET','android');else h.native=true;
 const m=await modules();expect(m.stripe.stripeWebMembershipAllowed(true,h.native)).toBe(false);
 if(boundary==='android-build'){
  expect([m.stripe.STRIPE_WEB_MEMBERSHIP_ENABLED,m.stripe.STRIPE_WEB_CHECKOUT_ENABLED,m.stripe.STRIPE_WEB_PORTAL_ENABLED,m.commerce.WEB_COMMERCE_SALES_RELEASE_READY]).toEqual([false,false,false,false]);
  expect(m.commerce.webCommerceCheckoutReady(true,undefined,undefined,'2026-01-01')).toBe(false);
 }
 for(const action of [m.stripe.prepareStripeCheckout,m.stripe.prepareStripeBillingPortal,m.stripe.readStripeMembershipStatus]) await expect(action('Alice')).rejects.toThrow('DISABLED');
 expect(h.fetch).not.toHaveBeenCalled();
 await expect(m.stripe.readMemberTicketStatus('Alice')).resolves.toMatchObject({active:true});
 await expect(m.stripe.claimMemberTickets('Alice')).resolves.toMatchObject({active:true});
});


it.each(['on','checkout-off','offers-off','publication-pending'])('checks actual rendered Web disclosure for %s',async(mode)=>{
 enable();if(mode!=='publication-pending')h.date='2026-01-01';
 if(mode==='checkout-off')set('STRIPE_WEB_CHECKOUT_ENABLED','false');
 if(mode==='offers-off')set('STRIPE_WEB_MEMBERSHIP_ENABLED','false');
 const {createElement}=await import('react');const {renderToStaticMarkup}=await import('react-dom/server');
 const {CommerceDisclosureDocument}=await import('../components/CommerceDisclosureDocument');
 const {checkCommerceExport}=await import('../../scripts/qa/check-commerce-export.mjs');
 const html=renderToStaticMarkup(createElement(CommerceDisclosureDocument,{lang:'ja'}));
 checkCommerceExport('web',mode==='on'?'on':'off',html);
});
it.each(['android-build','native-runtime'])('renders no commercial route, seller, price or purchase links on %s even with all flags ON',async(boundary)=>{
 enable();h.date='2026-01-01';if(boundary==='android-build')vi.stubEnv('NEXT_PUBLIC_APP_TARGET','android');else h.native=true;
 const {createElement}=await import('react');const {renderToStaticMarkup}=await import('react-dom/server');
 const {CommercePage}=await import('../components/CommercePage');
 const {checkCommerceExport}=await import('../../scripts/qa/check-commerce-export.mjs');
 const html=renderToStaticMarkup(createElement(CommercePage));
 expect(html).toBe('');checkCommerceExport('android','off',html);
});
