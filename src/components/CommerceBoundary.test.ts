import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ReactElement, ReactNode } from 'react';
import type { StripeMembershipStatus } from '../lib/stripeMembership';
import { renderToStaticMarkup } from 'react-dom/server';

const harness = vi.hoisted(() => ({ native: false, web: true, membership: true, portal: true, checkout: true, ready: true, cursor: 0,
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
vi.mock('next/link', async () => { const react = await import('react'); return { default: ({href,children}: {href:string;children:ReactNode}) => react.createElement('a',{href},children) }; });
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => harness.native } }));
vi.mock('../hooks/useAppPlatform', () => ({ useAppPlatform: () => ({ webContent: harness.web }) }));
vi.mock('../hooks/useCircuitAccess', () => ({ useCircuitAccess: () => ({ allowed: true, revision: 1 }) }));
vi.mock('../lib/circuitAccess', () => ({ circuitAccess: { canPlay: () => true } }));
vi.mock('../lib/dailyLoginRewards', () => ({ DAILY_LOGIN_REWARDS_ENABLED:true, DAILY_LOGIN_REWARD_CHANGED_EVENT:'daily-changed', readDailyLoginStatus:harness.rewardRead }));
vi.mock('../config/webCommerce', async original => ({ ...await original<typeof import('../config/webCommerce')>(),
    MEMBER_TICKET_CAP: {ranked:20,hint:20}, webCommerceCheckoutReady: () => harness.ready }));
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

const user = { id:'Alice', name:'Alice', type:'registered' as const };
const status: StripeMembershipStatus = { userId:'Alice', enabled:true, active:true, canManageBilling:true, cancelAtPeriodEnd:true,
    periodEnd:'2026-11-03T12:00:00Z', lastGrantUtcDay:'2026-10-03', tickets:{ranked:4,hint:5} };
const panelStates = (member = status, accepted = false) => [true,{revision:1,status:member},null,false,accepted,false];
const html = (element: ReactElement|null) => element ? renderToStaticMarkup(element) : '';
const elements = (node: ReactNode): ReactElement[] => {
    if (!node || typeof node !== 'object') return [];
    if (Array.isArray(node)) return node.flatMap(elements);
    const element = node as ReactElement<{children?:ReactNode}>;
    return [element,...elements(element.props?.children)];
};
beforeEach(() => {
    harness.native=false; harness.web=true; harness.membership=true; harness.portal=true; harness.checkout=true; harness.ready=true;
    harness.cursor=0; harness.states=panelStates(); harness.cleanups=[];
    for (const mock of [harness.read,harness.memberRead,harness.rewardRead,harness.prepare,harness.billing,harness.claim]) mock.mockReset();
    harness.read.mockResolvedValue(status); harness.memberRead.mockResolvedValue(status); harness.prepare.mockResolvedValue('https://checkout.stripe.com/c/pay/test');
    harness.claim.mockResolvedValue(status);
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
    expect(harness.prepare).toHaveBeenCalledWith('Alice',expect.any(AbortSignal));
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
    button.props.onClick(); harness.cleanups.forEach(cleanup=>cleanup());
    complete('https://checkout.stripe.com/c/pay/stale'); await Promise.resolve(); await Promise.resolve();
    expect(window.location.assign).not.toHaveBeenCalled();
});
