import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ReactElement, ReactNode } from 'react';
import type { StripeMembershipStatus } from '../lib/stripeMembership';
import { renderToStaticMarkup } from 'react-dom/server';

const harness = vi.hoisted(() => ({ native: false, web: true, membership: true, portal: true, checkout: true, ready: true, revision: 1, account: 'Alice', cursor: 0,
    states: [] as unknown[], cleanups: [] as Array<()=>void>, read: vi.fn(), memberRead: vi.fn(), rewardRead: vi.fn(), prepare: vi.fn(), billing: vi.fn(), claim: vi.fn() }));
vi.mock('react', async original => {
    const react = await original<typeof import('react')>();
    const useState = (initial: unknown) => {
        const index = harness.cursor++; if (index >= harness.states.length) harness.states[index] = initial;
        return [harness.states[index], (value: unknown) => { harness.states[index] = value; }];
    };
    const useEffect = (effect: ()=>void|(()=>void)) => { const cleanup = effect(); if (cleanup) harness.cleanups.push(cleanup); };
    const useRef = () => ({ current: null });
    return { ...react, useState, useEffect, useRef, default: { ...react, useState, useEffect, useRef } };
});
vi.mock('../lib/currentAccountTerms', () => ({ CURRENT_TERMS_ACCEPTED_EVENT:'terms-accepted', acceptCurrentAccountTerms:vi.fn().mockResolvedValue(undefined) }));
vi.mock('next/link', async () => { const react = await import('react'); return { default: ({href,children}: {href:string;children:ReactNode}) => react.createElement('a',{href},children) }; });
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => harness.native } }));
vi.mock('../hooks/useAppPlatform', () => ({ useAppPlatform: () => ({ webContent: harness.web }) }));
vi.mock('../hooks/useCircuitAccess', () => ({ useCircuitAccess: () => ({ allowed: true, revision: harness.revision }) }));
vi.mock('../lib/circuitAccess', () => ({ circuitAccess: { canPlay: (user: {id:string}) => user.id === harness.account, getSnapshot: () => ({revision:harness.revision}) } }));
vi.mock('../lib/dailyLoginRewards', () => ({ DAILY_LOGIN_REWARDS_ENABLED:true, DAILY_LOGIN_REWARD_CHANGED_EVENT:'daily-changed', readDailyLoginStatus:harness.rewardRead }));
vi.mock('../config/webCommerce', async original => ({ ...await original<typeof import('../config/webCommerce')>(),
    MEMBER_TICKET_CAP: {ranked:60,hint:60}, webCommerceCheckoutReady: () => harness.ready }));
vi.mock('../lib/stripeMembership', () => ({
    get STRIPE_WEB_MEMBERSHIP_ENABLED() { return harness.membership; }, get STRIPE_WEB_PORTAL_ENABLED() { return harness.portal; },
    get STRIPE_WEB_CHECKOUT_ENABLED() { return harness.checkout; }, MEMBER_TICKET_USAGE_ENABLED: true,
    stripeWebMembershipAllowed: (web:boolean,native:boolean) => web && !native && (harness.membership || harness.portal),
    readStripeMembershipStatus: harness.read, readMemberTicketStatus: harness.memberRead, claimMemberTickets: harness.claim,
    prepareStripeCheckout: harness.prepare, prepareStripeBillingPortal: harness.billing,
}));
import { StripeMembershipPanel } from './StripeMembershipPanel';
import { MemberTicketsPanel, MemberTicketClaimController } from './MemberTicketsPanel';
import { CommercePage } from './CommercePage';
import { DailyLoginRewardsPanel } from './DailyLoginRewardsPanel';
import { stripeMembershipText } from '../locales/stripeMembershipText';
import { rewardsHubText } from '../locales/rewardsHubText';
import { LANGUAGES } from '../locales/dict';
import { commerceStatusText } from '../locales/commerceStatusText';
import { ticketWalletText } from '../locales/ticketWalletText';
import { acceptCurrentAccountTerms } from '../lib/currentAccountTerms';
import { DAILY_LOGIN_REWARD_CHANGED_EVENT } from '../lib/dailyLoginRewards';

const user = { id:'Alice', name:'Alice', type:'registered' as const };
const status: StripeMembershipStatus = { userId:'Alice', enabled:true, active:true, canManageBilling:true, cancelAtPeriodEnd:true,
    availableCheckoutSkus:['standard_monthly','plus_monthly','hints_1'], periodEnd:'2026-11-03T12:00:00Z', lastGrantUtcDay:'2026-10-03', tickets:{ranked:4,hint:5} };
const panelStates = (member = status, accepted = false, sku: string | null = 'standard_monthly') => [true,{revision:1,status:member},null,false,sku,accepted,false];
const html = (element: ReactElement|null) => element ? renderToStaticMarkup(element) : '';
const elements = (node: ReactNode): ReactElement[] => {
    if (!node || typeof node !== 'object') return [];
    if (Array.isArray(node)) return node.flatMap(elements);
    const element = node as ReactElement<{children?:ReactNode}>;
    return [element,...elements(element.props?.children)];
};
beforeEach(() => {
    harness.native=false; harness.web=true; harness.membership=true; harness.portal=true; harness.checkout=true; harness.ready=true;
    harness.revision=1; harness.account='Alice';
    harness.cursor=0; harness.states=panelStates(); harness.cleanups=[];
    for (const mock of [harness.read,harness.memberRead,harness.rewardRead,harness.prepare,harness.billing,harness.claim]) mock.mockReset();
    harness.read.mockResolvedValue(status); harness.memberRead.mockResolvedValue(status); harness.prepare.mockResolvedValue('https://checkout.stripe.com/c/pay/test');
    harness.claim.mockResolvedValue(status);
    vi.mocked(acceptCurrentAccountTerms).mockReset().mockResolvedValue(undefined);
    vi.stubGlobal('window', Object.assign(new EventTarget(), {location:{assign:vi.fn()}}));
});
afterEach(() => { harness.cleanups.forEach(cleanup=>cleanup()); vi.unstubAllGlobals(); });

it('renders no purchase, portal, commercial page or external payment link on either Android boundary even with future flags ON', () => {
    for (const [web,native] of [[false,false],[true,true]]) {
        harness.web=web; harness.native=native; harness.cursor=0; harness.states=panelStates();
        expect(StripeMembershipPanel({user,lang:'ja'})).toBeNull();
        harness.cursor=0; harness.states=['ja']; expect(CommercePage()).toBeNull();
    }
    expect(harness.read).not.toHaveBeenCalled(); expect(harness.prepare).not.toHaveBeenCalled(); expect(harness.billing).not.toHaveBeenCalled();
});
it('renders existing member tickets on Android without price, payment, portal or links', () => {
    harness.web=false; harness.native=true; harness.states=[{revision:1,userId:'Alice',status},null];
    const markup=html(MemberTicketsPanel({user,lang:'ja'}));
    expect(markup).toContain('会員券'); expect(markup).toContain('4'); expect(markup).toContain('5');
    expect(markup).not.toMatch(/href=|Stripe|2\.99|決済に進む|支払い方法の変更・解約/);
    expect(harness.memberRead).toHaveBeenCalledWith('Alice',expect.any(AbortSignal));
});
it('claims existing member tickets on Android only after verified access and terms readiness', () => {
    harness.native=true; harness.web=false; harness.states=[];
    MemberTicketClaimController({user,termsReady:false});
    MemberTicketClaimController({user:null,termsReady:true});
    expect(harness.claim).not.toHaveBeenCalled();
    MemberTicketClaimController({user,termsReady:true});
    expect(harness.claim).toHaveBeenCalledWith('Alice',expect.any(AbortSignal));
    expect(harness.prepare).not.toHaveBeenCalled(); expect(harness.billing).not.toHaveBeenCalled();
});
it('keeps billing management visible after new Checkout and membership offers are stopped', () => {
    harness.checkout=false; harness.membership=false; harness.ready=false;
    const markup=html(StripeMembershipPanel({user,lang:'en'}));
    expect(markup).toContain(stripeMembershipText('en').manage);
    expect(markup).not.toContain(stripeMembershipText('en').purchase);
    expect(markup).toContain('UTC');
});
it('requires explicit pre-purchase acknowledgement and reviewed disclosure before preparing Checkout', async () => {
    const inactive={...status,active:false,canManageBilling:false,cancelAtPeriodEnd:false,periodEnd:null};
    harness.states=panelStates(inactive);
    let tree=StripeMembershipPanel({user,lang:'en'});
    let button=elements(tree).find(element=>element.type==='button') as ReactElement<{disabled:boolean;onClick:()=>void}>;
    expect(button.props.disabled).toBe(true); button.props.onClick();
    expect(harness.prepare).not.toHaveBeenCalled();
    expect(html(tree)).toContain('/commerce/');
    harness.cursor=0; harness.states=panelStates(inactive,true); tree=StripeMembershipPanel({user,lang:'en'});
    button=elements(tree).find(element=>element.type==='button') as typeof button;
    expect(button.props.disabled).toBe(false); button.props.onClick(); await Promise.resolve();
    expect(harness.prepare).toHaveBeenCalledWith('Alice','standard_monthly',expect.any(AbortSignal));
    harness.cursor=0; harness.ready=false; harness.states=panelStates(inactive,true);
    expect(html(StripeMembershipPanel({user,lang:'en'}))).not.toContain('/commerce/');
});
it('hides a server-disabled daily reward panel', async () => {
    harness.states=[null,null,null];
    harness.rewardRead.mockRejectedValue({code:'DISABLED'});
    DailyLoginRewardsPanel({user,lang:'en'}); await Promise.resolve(); await Promise.resolve();
    harness.cursor=0;
    expect(DailyLoginRewardsPanel({user,lang:'en'})).toBeNull();
});
it('keeps real daily reward service failures visible', async () => {
    harness.states=[null,null,null]; harness.rewardRead.mockRejectedValue({code:'UNAVAILABLE'});
    DailyLoginRewardsPanel({user,lang:'en'}); await Promise.resolve(); await Promise.resolve();
    harness.cursor=0;
    expect(html(DailyLoginRewardsPanel({user,lang:'en'}))).toContain('Rewards are unavailable right now.');
});
it('does not navigate to a stale Checkout response after the account screen unmounts', async () => {
    let complete!: (url:string)=>void; harness.prepare.mockReturnValue(new Promise(resolve=>{complete=resolve;}));
    harness.states=panelStates({...status,active:false,canManageBilling:false,cancelAtPeriodEnd:false,periodEnd:null},true);
    const tree=StripeMembershipPanel({user,lang:'en'});
    const button=elements(tree).find(element=>element.type==='button') as ReactElement<{onClick:()=>void}>;
    button.props.onClick(); await Promise.resolve(); harness.cleanups.forEach(cleanup=>cleanup());
    complete('https://checkout.stripe.com/c/pay/stale'); await Promise.resolve(); await Promise.resolve();
    expect(window.location.assign).not.toHaveBeenCalled();
});

it('keeps Checkout and billing closed to consent side effects until explicit acceptance succeeds', async () => {
    const { acceptCurrentAccountTerms }=await import('../lib/currentAccountTerms');
    vi.mocked(acceptCurrentAccountTerms).mockRejectedValueOnce(new Error('TERMS_UNAVAILABLE'));
    harness.states=panelStates({...status,active:false,canManageBilling:false,cancelAtPeriodEnd:false,periodEnd:null},true);
    const button=elements(StripeMembershipPanel({user,lang:'en'})).find(element=>element.type==='button') as ReactElement<{onClick:()=>void}>;
    button.props.onClick();await Promise.resolve();await Promise.resolve();expect(harness.prepare).not.toHaveBeenCalled();
    const before=vi.mocked(acceptCurrentAccountTerms).mock.calls.length;
    harness.cursor=0;harness.states=panelStates(status);harness.checkout=false;harness.ready=false;
    const billingButton=elements(StripeMembershipPanel({user,lang:'en'})).find(element=>element.type==='button') as ReactElement<{onClick:()=>void}>;
    harness.billing.mockResolvedValue('https://billing.stripe.com/p/session/owned');billingButton.props.onClick();await Promise.resolve();
    expect(harness.billing).toHaveBeenCalled();expect(vi.mocked(acceptCurrentAccountTerms).mock.calls.length).toBe(before);
});

it('makes the offer a closed disclosure without preparing a purchase or preselecting consent', () => {
    harness.states=panelStates({...status,active:false,canManageBilling:false,periodEnd:null},false,null);
    const tree=StripeMembershipPanel({user,lang:'ja'});
    const disclosure=elements(tree).find(element=>element.type==='details') as ReactElement<{open?:boolean}>;
    const checkbox=elements(tree).find(element=>element.type==='input' && (element.props as {type?:string}).type==='checkbox') as ReactElement<{checked:boolean}>;
    expect(disclosure.props.open).toBeUndefined(); expect(checkbox).toBeUndefined();
    const markup=html(tree);
    expect(markup).toContain(rewardsHubText('ja').optional);
    expect(markup).toContain(rewardsHubText('ja').review);
    expect(markup).toContain('$3.00'); expect(markup).not.toContain('$2.99');
    expect(harness.prepare).not.toHaveBeenCalled(); expect(harness.billing).not.toHaveBeenCalled();
});

it('labels capped rewards as zero credit, not a reward the account cannot receive', () => {
    const reward={userId:'Alice',enabled:true,streakDays:7,tickets:{ranked:20,hint:20},lastClaimUtcDay:'2026-10-03',currentUtcDay:'2026-10-03'};
    harness.rewardRead.mockResolvedValue(reward); harness.states=[{revision:1,status:reward},null,null];
    const markup=html(DailyLoginRewardsPanel({user,lang:'ja'}));
    expect(markup).toContain(rewardsHubText('ja').full);
    expect(markup).toContain('2026-10-04');
    expect(markup).toContain('ランク戦チケット +0'); expect(markup).toContain('ヒントチケット +0');
    expect(markup).not.toContain('+3'); expect(markup).not.toContain('+5');
});

it('does not display a reward preview when the server has disabled rewards', () => {
    harness.states=[{revision:1,status:{userId:'Alice',enabled:false,streakDays:0,tickets:{ranked:0,hint:0},lastClaimUtcDay:null}},null,null];
    harness.rewardRead.mockReturnValue(new Promise(()=>{}));
    const markup=html(DailyLoginRewardsPanel({user,lang:'en'}));
    expect(markup).toContain('Rewards are unavailable right now.');
    expect(markup).not.toContain(rewardsHubText('en').today);
});

it('provides the navigation and disclosure copy for all twelve supported languages', () => {
    expect(LANGUAGES).toHaveLength(12);
    for (const {code} of LANGUAGES) {
        for (const value of Object.values(rewardsHubText(code))) expect(value.trim()).toBeTruthy();
    }
    expect(new Set(LANGUAGES.map(({code})=>rewardsHubText(code).title)).size).toBe(12);
});
it('keeps planned products unavailable when the authenticated server advertises no released SKUs', () => {
    harness.states=panelStates({...status,active:false,canManageBilling:false,periodEnd:null,availableCheckoutSkus:[]},true);
    const tree=StripeMembershipPanel({user,lang:'en'});
    expect(html(tree)).toContain('cannot be purchased yet');
    expect(elements(tree).filter(element=>element.type==='button')).toHaveLength(0);
    expect(harness.prepare).not.toHaveBeenCalled();
    const products=elements(tree).filter(element=>element.type==='input');
    expect(products).toHaveLength(8);
    for(const product of products) expect((product.props as {disabled:boolean}).disabled).toBe(true);
});
it('resets explicit purchase consent when the selected product changes', () => {
    harness.states=panelStates({...status,active:false,canManageBilling:false,periodEnd:null},true);
    const tree=StripeMembershipPanel({user,lang:'en'});
    const product=elements(tree).find(element=>element.type==='input' && (element.props as {value?:string}).value==='plus_monthly') as ReactElement<{onChange:()=>void}>;
    product.props.onChange();
    expect(harness.states[4]).toBe('plus_monthly');expect(harness.states[5]).toBe(false);
    expect(harness.prepare).not.toHaveBeenCalled();
});

const newStatus: StripeMembershipStatus = { ...status, active: false, cancelAtPeriodEnd: false, periodEnd: null,
    tickets: { ranked: 0, hint: 0 }, lastGrantUtcDay: null,
    commerce: { userId: 'Alice', livemode: true, active: true, sku: 'plus_monthly', periodEnd: '2099-11-03T12:00:00Z',
        cancelAtPeriodEnd: false, unlimitedRanked: true, adFree: true, balances: { purchased: 13, subscription: 10 } } };

it.each(['standard_monthly', 'plus_monthly'] as const)('shows the owned %s product without legacy price or expiry and prevents a second monthly subscription', sku => {
    harness.states=panelStates({...newStatus,commerce:{...newStatus.commerce!,sku}},true,sku);
    const tree=StripeMembershipPanel({user,lang:'en'}), markup=html(tree);
    expect(markup).toContain(sku==='standard_monthly' ? 'Standard · USD $3.00/month' : 'Plus · USD $6.00/month');
    expect(markup).not.toContain('2.99'); expect(markup).not.toContain(ticketWalletText('en').expiry);
    expect(markup).toContain('Purchased hints'); expect(markup).toContain('Earned subscription hints');
    expect(markup).not.toContain('data-purchase-review');
    const products=elements(tree).filter(element=>element.type==='input') as ReactElement<{value:string;disabled:boolean}>[];
    expect(products.find(product=>product.props.value==='standard_monthly')?.props.disabled).toBe(true);
    expect(products.find(product=>product.props.value==='plus_monthly')?.props.disabled).toBe(true);
    expect(products.find(product=>product.props.value==='hints_1')?.props.disabled).toBe(false);
    expect(harness.prepare).not.toHaveBeenCalled(); expect(acceptCurrentAccountTerms).not.toHaveBeenCalled();
});

it('keeps legacy billing and ticket expiry confined to the actual legacy contract', () => {
    harness.states=panelStates({...status,commerce:newStatus.commerce});
    const markup=html(StripeMembershipPanel({user,lang:'en'}));
    expect(markup).toContain('data-legacy-membership-terms'); expect(markup).toContain('2.99');
    expect(markup).toContain(ticketWalletText('en').expiry);
    expect(markup).toContain('data-commerce-entitlements');
    harness.cursor=0; harness.states=[{revision:1,userId:'Alice',status:{...status,commerce:newStatus.commerce}},null];
    const wallet=html(MemberTicketsPanel({user,lang:'en'}));
    expect(wallet).toContain('data-legacy-member-tickets'); expect(wallet).toContain('>4<'); expect(wallet).toContain('>5<');
    expect(wallet).toContain('>13<'); expect(wallet).toContain('>10<');
});

it('shows earned and purchased hints after membership ends on Android without purchase or legacy-expiry text', () => {
    const ended={...newStatus,commerce:{...newStatus.commerce!,active:false,sku:null,periodEnd:null,unlimitedRanked:false,adFree:false}};
    harness.web=false; harness.native=true; harness.states=[{revision:1,userId:'Alice',status:ended},null];
    const markup=html(MemberTicketsPanel({user,lang:'en'}));
    expect(markup).toContain('Purchased hints'); expect(markup).toContain('Earned subscription hints');
    expect(markup).toContain('>13<'); expect(markup).toContain('>10<');
    expect(markup).not.toContain(ticketWalletText('en').expiry);
    expect(markup).not.toMatch(/href=|Stripe|USD|\$|data-legacy-member-tickets|data-purchase-review/);
    expect(acceptCurrentAccountTerms).not.toHaveBeenCalled(); expect(harness.claim).not.toHaveBeenCalled();
});

it('labels sandbox membership and stock without claiming live benefits on Android', () => {
    const sandbox={...newStatus,commerce:{...newStatus.commerce!,livemode:false,unlimitedRanked:false,adFree:false}};
    harness.web=false; harness.native=true; harness.states=[{revision:1,userId:'Alice',status:sandbox},null];
    const markup=html(MemberTicketsPanel({user,lang:'en'}));
    expect(markup).toContain('data-commerce-mode="test"'); expect(markup).toContain(commerceStatusText('en').testNotice);
    expect(markup).not.toContain(commerceStatusText('en').benefits);
    expect(markup).not.toMatch(/href=|Stripe|USD|\$|data-legacy-member-tickets/);
});

it('keeps independently selected packs behind release readiness and explicit consent while a plan is active', async () => {
    harness.states=panelStates(newStatus,true,'hints_1');
    const tree=StripeMembershipPanel({user,lang:'en'});
    const button=elements(tree).find(element=>element.type==='button') as ReactElement<{onClick:()=>void}>;
    button.props.onClick(); button.props.onClick(); await Promise.resolve();
    expect(acceptCurrentAccountTerms).toHaveBeenCalledTimes(1); expect(harness.prepare).toHaveBeenCalledTimes(1);
    expect(harness.prepare).toHaveBeenCalledWith('Alice','hints_1',expect.any(AbortSignal));
    harness.cursor=0; harness.ready=false; harness.states=panelStates(newStatus,true,'hints_1');
    const closed=StripeMembershipPanel({user,lang:'en'});
    expect(html(closed)).not.toContain('data-purchase-review');
    for (const radio of elements(closed).filter(element=>element.type==='input')) expect((radio.props as {disabled:boolean}).disabled).toBe(true);
});

it('rejects old-account and old-revision loaded stock and selections', () => {
    for (const [account,revision] of [['Bob',1],['Alice',2]] as const) {
        harness.account=account; harness.revision=revision; harness.cursor=0; harness.states=panelStates(newStatus,true,'hints_1');
        const replacement={...user,id:account};
        expect(html(StripeMembershipPanel({user:replacement,lang:'en'}))).not.toContain('data-commerce-entitlements');
        harness.cursor=0; harness.states=[{revision:1,userId:'Alice',status:newStatus},null];
        expect(html(MemberTicketsPanel({user:replacement,lang:'en'}))).not.toContain('data-commerce-entitlements');
    }
    expect(harness.prepare).not.toHaveBeenCalled();
});

it('blocks stale checkout and portal continuations when access changes before effect cleanup', async () => {
    let accepted!:()=>void;
    vi.mocked(acceptCurrentAccountTerms).mockReturnValueOnce(new Promise(resolve=>{accepted=resolve;}));
    harness.states=panelStates(newStatus,true,'hints_1');
    const checkout=elements(StripeMembershipPanel({user,lang:'en'})).find(element=>element.type==='button') as ReactElement<{onClick:()=>void}>;
    checkout.props.onClick(); harness.revision=2; accepted(); await Promise.resolve();
    expect(harness.prepare).not.toHaveBeenCalled();
    harness.revision=1; harness.cursor=0; harness.states=panelStates(newStatus);
    let complete!:(url:string)=>void;
    harness.billing.mockReturnValue(new Promise(resolve=>{complete=resolve;}));
    const billing=elements(StripeMembershipPanel({user,lang:'en'})).find(element=>element.type==='button') as ReactElement<{onClick:()=>void}>;
    billing.props.onClick(); billing.props.onClick(); expect(harness.billing).toHaveBeenCalledTimes(1);
    harness.revision=2; complete('https://billing.stripe.com/p/session/stale'); await Promise.resolve();
    expect(window.location.assign).not.toHaveBeenCalled();
});

it('provides complete stock and test-mode labels without purchase prices for every supported language', () => {
    for (const {code} of LANGUAGES) {
        for (const value of Object.values(commerceStatusText(code))) {
            expect(value.trim()).toBeTruthy(); expect(value).not.toMatch(/USD|\$/);
        }
    }
});

it('refreshes member stock after same-account ticket changes and ignores other accounts or missing owner details', () => {
    harness.states=[{revision:1,userId:'Alice',status:newStatus},null];
    MemberTicketsPanel({user,lang:'en'});
    expect(harness.memberRead).toHaveBeenCalledTimes(1);
    for (const channel of [DAILY_LOGIN_REWARD_CHANGED_EVENT, 'qg-member-tickets-changed']) {
        window.dispatchEvent(new Event(channel));
        window.dispatchEvent(new CustomEvent(channel, { detail: { userId: 'Bob' } }));
    }
    expect(harness.memberRead).toHaveBeenCalledTimes(1);
    const initialSignal=harness.memberRead.mock.calls[0][1] as AbortSignal;
    window.dispatchEvent(new CustomEvent(DAILY_LOGIN_REWARD_CHANGED_EVENT, { detail: { userId: 'Alice' } }));
    expect(initialSignal.aborted).toBe(true);
    expect(harness.memberRead).toHaveBeenCalledTimes(2);
    expect(harness.memberRead).toHaveBeenLastCalledWith('Alice',expect.any(AbortSignal));
    window.dispatchEvent(new CustomEvent('qg-member-tickets-changed', { detail: { userId: 'Alice' } }));
    expect(harness.memberRead).toHaveBeenCalledTimes(3);
    harness.cleanups.forEach(cleanup=>cleanup());
    window.dispatchEvent(new CustomEvent(DAILY_LOGIN_REWARD_CHANGED_EVENT, { detail: { userId: 'Alice' } }));
    expect(harness.memberRead).toHaveBeenCalledTimes(3);
    expect(harness.claim).not.toHaveBeenCalled(); expect(acceptCurrentAccountTerms).not.toHaveBeenCalled();
});
