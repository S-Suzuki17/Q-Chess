import { beforeEach, expect, it, vi } from 'vitest';
const driver=vi.hoisted(()=>({slots:[] as unknown[],cursor:0,cleanups:[] as (()=>void)[],buy:vi.fn(),recover:vi.fn(),attempt:null as null|{contextId:string;revision:number;requestId:string}}));
vi.mock('react',()=>({
    useRef:(value:unknown)=>{const i=driver.cursor++;return driver.slots[i]??={current:value};},
    useState:(value:unknown)=>{const i=driver.cursor++;if(!(i in driver.slots))driver.slots[i]=value;return[driver.slots[i],(next:unknown)=>{driver.slots[i]=typeof next==='function'?(next as (old:unknown)=>unknown)(driver.slots[i]):next;}];},
    useMemo:(value:()=>unknown,deps:unknown[])=>{const i=driver.cursor++,old=driver.slots[i] as {deps:unknown[];value:unknown}|undefined;if(!old||deps.some((dep,j)=>dep!==old.deps[j]))driver.slots[i]={deps,value:value()};return(driver.slots[i] as {value:unknown}).value;},
    useEffect:(effect:()=>undefined|(()=>void),deps:unknown[])=>{const i=driver.cursor++,old=driver.slots[i] as {deps:unknown[];cleanup?:()=>void}|undefined;if(!old||deps.some((dep,j)=>dep!==old.deps[j])){old?.cleanup?.();const cleanup=effect();driver.slots[i]={deps,cleanup};if(cleanup)driver.cleanups.push(cleanup);}},
    useLayoutEffect:(effect:()=>undefined|(()=>void),deps:unknown[])=>{const i=driver.cursor++,old=driver.slots[i] as {deps:unknown[];cleanup?:()=>void}|undefined;if(!old||deps.some((dep,j)=>dep!==old.deps[j])){old?.cleanup?.();const cleanup=effect();driver.slots[i]={deps,cleanup};if(cleanup)driver.cleanups.push(cleanup);}},
}));
vi.mock('../lib/paidHints',()=>({
    PaidHintError:class extends Error{constructor(public code:string){super(code);}},
    PaidHintClient:class{constructor(readonly userId:string,readonly context:unknown){}buy=(...args:unknown[])=>driver.buy(...args);recover=(...args:unknown[])=>driver.recover(...args);latestAttempt=()=>driver.attempt;},
}));
import { useTicketHint } from './useTicketHint';
import type { HintReceipt, PaidHintContext } from '../lib/paidHints';
const context:PaidHintContext={kind:'match',mode:'ranked',contextId:'11111111-1111-4111-8111-111111111111',matchId:'ROOM',rulesVersion:'match-hint-v1'};
const paid:HintReceipt={receiptId:'22222222-2222-4222-8222-222222222222',contextId:context.contextId,kind:'match',mode:'ranked',revision:0,stateHash:'hash',rulesVersion:'match-hint-v1',deliveryState:'paid_retrievable',hint:{fromRow:6,fromCol:0,toRow:5,toCol:0},move:{pieceId:'w_17',target:{row:5,col:0}}};
const defaults={userId:'Alice',context,revision:0,eligible:true,onDelivered:vi.fn()};
// Deterministic slots drive real hook effects/abort logic without a DOM renderer.
// eslint-disable-next-line react-hooks/rules-of-hooks
const render=(overrides:Partial<Parameters<typeof useTicketHint>[0]>={})=>{driver.cursor=0;return useTicketHint({...defaults,...overrides});};
beforeEach(()=>{driver.cleanups.forEach(cleanup=>cleanup());driver.slots=[];driver.cleanups=[];driver.attempt=null;driver.buy.mockReset();driver.recover.mockReset();defaults.onDelivered.mockClear();});
it('makes no paid request before eligibility, including opponent turn, spectator and finished state',async()=>{await render({eligible:false}).request();expect(driver.buy).not.toHaveBeenCalled();expect(render({eligible:false}).hintMove).toBeNull();});
it('reports missing identity without any paid or free request',async()=>{await render({userId:undefined}).request();expect(driver.buy).not.toHaveBeenCalled();expect(render({userId:undefined}).error).toMatchObject({code:'AUTH_REQUIRED'});});
it('blocks immediate double clicks and counts a recovered receipt only once',async()=>{
    let complete!:(value:HintReceipt)=>void;driver.buy.mockImplementation(()=>new Promise(resolve=>{complete=resolve;}));
    const first=render().request();await render().request();expect(driver.buy).toHaveBeenCalledOnce();complete(paid);await first;
    expect(render().hintMove).toEqual(paid.hint);expect(defaults.onDelivered).toHaveBeenCalledOnce();
    driver.attempt={contextId:paid.contextId,revision:0,requestId:crypto.randomUUID()};driver.recover.mockResolvedValue(paid);
    await render().recover();expect(defaults.onDelivered).toHaveBeenCalledOnce();
});
it.each(['account','context','revision','finished'] as const)('discards a late purchase after %s changes',async change=>{
    let complete!:(value:HintReceipt)=>void;driver.buy.mockImplementation(()=>new Promise(resolve=>{complete=resolve;}));
    const pending=render().request();const next=change==='account'?{userId:'Bob'}:change==='context'?{context:{...context,contextId:crypto.randomUUID()}}:change==='revision'?{revision:1}:{eligible:false};
    render(next);complete(paid);await pending;expect(render(next).hintMove).toBeNull();expect(defaults.onDelivered).not.toHaveBeenCalled();
});
it('retrieves a lost-response receipt via GET and shows older positions only as historical text',async()=>{
    driver.attempt={contextId:context.contextId,revision:0,requestId:crypto.randomUUID()};driver.recover.mockResolvedValue(paid);
    await render({revision:2}).recover();const result=render({revision:2});expect(result.hintMove).toBeNull();expect(result.recovered).toEqual(paid);expect(driver.buy).not.toHaveBeenCalled();expect(defaults.onDelivered).not.toHaveBeenCalled();
});
it('does not overlay an old context even if the new context uses the same revision',async()=>{
    driver.attempt={contextId:context.contextId,revision:0,requestId:crypto.randomUUID()};driver.recover.mockResolvedValue(paid);
    const next={context:{...context,contextId:crypto.randomUUID()}};await render(next).recover();expect(render(next).hintMove).toBeNull();expect(render(next).recovered).toEqual(paid);
});
it('does not remain busy or expose another account’s late recovery after account switch',async()=>{
    driver.attempt={contextId:context.contextId,revision:0,requestId:crypto.randomUUID()};let complete!:(value:HintReceipt)=>void;driver.recover.mockImplementation(()=>new Promise(resolve=>{complete=resolve;}));
    const pending=render().recover();expect(render().pending).toBe(true);const bob=render({userId:'Bob'});expect(bob.pending).toBe(false);
    complete(paid);await pending;expect(render({userId:'Bob'}).recovered).toBeNull();expect(render({userId:'Bob'}).hintMove).toBeNull();
});
it('keeps a retrieved receipt visible when reconnect makes the same position eligible during GET',async()=>{
    driver.attempt={contextId:context.contextId,revision:0,requestId:crypto.randomUUID()};
    let complete!:(value:HintReceipt)=>void;driver.recover.mockImplementation(()=>new Promise(resolve=>{complete=resolve;}));
    const pending=render({eligible:false}).recover();render({eligible:true});complete(paid);await pending;
    const result=render({eligible:true});expect(result.hintMove).toBeNull();expect(result.recovered).toEqual(paid);expect(result.pending).toBe(false);expect(driver.buy).not.toHaveBeenCalled();
    expect(defaults.onDelivered).toHaveBeenCalledOnce();
});
it('keeps a server refusal visible without requesting a local free hint',async()=>{driver.buy.mockRejectedValue({code:'INSUFFICIENT_FUNDS'});await render().request();expect(render().error).toEqual({code:'INSUFFICIENT_FUNDS'});expect(render().failed).toBe(true);expect(render().hintMove).toBeNull();});
