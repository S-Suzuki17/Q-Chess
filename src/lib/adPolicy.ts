/** Owner decision, 2026-09-17: ordinary AdSense only. Do not gate play until
 * authenticated quotas AND a real rewarded provider have been integrated.
 * Banners, adBreakDone/afterAd and elapsed time are never reward evidence. */
export const AD_POLICY={dailyLimitsEnabled:false,rewardedReady:false,circuitInterstitialReady:false} as const;
export const DAILY_FREE_USES=3;
export const REWARDED_EXTRA_USES=3;
export type AllowanceKind='hint'|'online';
export type AllowanceLedger={day:string;used:Record<AllowanceKind,number>;bonus:Record<AllowanceKind,number>;consumed:string[];receipts:string[]};
export const utcDay=(now:number)=>new Date(now).toISOString().slice(0,10);
export const emptyAllowance=(now:number):AllowanceLedger=>({day:utcDay(now),used:{hint:0,online:0},bonus:{hint:0,online:0},consumed:[],receipts:[]});
/** Server-side transaction model for the future provider. Not a client trust boundary.
 * Keep receipt/action IDs in durable storage, with unique constraints. */
export function remainingAllowance(state:AllowanceLedger,kind:AllowanceKind,now:number) {
    return Math.max(0,DAILY_FREE_USES-(state.day===utcDay(now)?state.used[kind]:0))+state.bonus[kind];
}
export function consumeAllowance(state:AllowanceLedger,kind:AllowanceKind,actionId:string,now:number):AllowanceLedger|null {
    const key=kind+':'+actionId;
    if(!actionId)return null;
    if(state.consumed.includes(key))return state;
    if(remainingAllowance(state,kind,now)<=0)return null;
    const next={...state,day:utcDay(now),used:state.day===utcDay(now)?{...state.used}:{hint:0,online:0},bonus:{...state.bonus},consumed:[...state.consumed,key]};
    if(next.used[kind]<DAILY_FREE_USES)next.used[kind]++;
    else next.bonus[kind]--;
    return next;
}
/** Call ONLY after server-side provider signature / receipt / user binding checks.
 * This pure function deliberately does not claim to verify an advertisement. */
export function applyVerifiedReward(state:AllowanceLedger,kind:AllowanceKind,receiptId:string):AllowanceLedger {
    if(!receiptId||state.receipts.includes(receiptId))return state;
    return {...state,bonus:{...state.bonus,[kind]:state.bonus[kind]+REWARDED_EXTRA_USES},receipts:[...state.receipts,receiptId]};
}
/** Natural break integration seam. Currently a no-op, never a fake ad/countdown. */
export async function requestCircuitInterstitial(_matchKey:string):Promise<'unavailable'> {return 'unavailable';}
