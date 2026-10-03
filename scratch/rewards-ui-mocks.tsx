import React from 'react';
const mode=new URLSearchParams(location.search).get('state')||'new';
const today=new Date().toISOString().slice(0,10);
const active=['member','native'].includes(mode);
const claimed=['claimed','full','member','native'].includes(mode);
const response=async <T,>(value:T):Promise<T>=>{
    if(mode==='error')throw new Error('UI fixture error');
    if(mode==='loading')return new Promise(()=>{});
    return value;
};
export const useCircuitAccess=()=>({allowed:true,revision:1});
export const circuitAccess={canPlay:()=>true};
export const useAppPlatform=()=>({webContent:mode!=='native',android:mode==='native'});
export const DAILY_LOGIN_REWARDS_ENABLED=true, MEMBER_TICKET_USAGE_ENABLED=true, RANKED_REFUND_BALANCE_ENABLED=true;
export const STRIPE_WEB_MEMBERSHIP_ENABLED=true,STRIPE_WEB_PORTAL_ENABLED=true,STRIPE_WEB_CHECKOUT_ENABLED=true;
export const DAILY_LOGIN_REWARD_CHANGED_EVENT='qa-daily',CURRENT_TERMS_ACCEPTED_EVENT='qa-terms';
export const readDailyLoginStatus=(userId:string)=>response({userId,enabled:true,streakDays:claimed?4:0,
    tickets:{ranked:mode==='full'?20:claimed?6:0,hint:mode==='full'?20:claimed?8:0},lastClaimUtcDay:claimed?today:null,currentUtcDay:today});
export const readMemberTicketStatus=(userId:string)=>response({userId,enabled:true,active,canManageBilling:active,cancelAtPeriodEnd:false,
    periodEnd:active?'2026-11-03T12:00:00Z':null,lastGrantUtcDay:active?today:null,tickets:{ranked:active?12:0,hint:active?18:0}});
export const readStripeMembershipStatus=readMemberTicketStatus;
export const readRankedRefundBalance=(userId:string)=>response({userId,freeRankedRefunds:0,paidRankedRefunds:0});
export const currentAccountTermsStatus=()=>response({accepted:claimed,effective:true});
export const stripeWebMembershipAllowed=(web:boolean,native:boolean)=>web&&!native;
const blocked=async()=>{throw new Error('UI fixture: mutations are disabled');};
export const acceptCurrentAccountTerms=blocked,claimMemberTickets=blocked,prepareStripeCheckout=blocked,prepareStripeBillingPortal=blocked;
export default function Link({href,children,...props}:React.AnchorHTMLAttributes<HTMLAnchorElement>){return <a {...props} href={href}>{children}</a>;}
