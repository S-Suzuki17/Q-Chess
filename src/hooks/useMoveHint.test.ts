import { beforeEach, expect, it, vi } from 'vitest';
// Minimal hook harness for deterministic worker replies and effect cleanup.
const hooks=vi.hoisted(()=>({slots:[] as unknown[],cursor:0,cleanups:[] as (()=>void)[]}));
vi.mock('react',()=>({
    useRef:(value:unknown)=>{const i=hooks.cursor++; return hooks.slots[i] ??= {current:value};},
    useState:(value:unknown)=>{const i=hooks.cursor++; if (!(i in hooks.slots)) hooks.slots[i]=value; return [hooks.slots[i],(next:unknown)=>{hooks.slots[i]=next;}];},
    useEffect:(effect:()=>()=>void,deps:unknown[])=>{
        const i=hooks.cursor++, previous=hooks.slots[i] as {deps:unknown[];cleanup:()=>void}|undefined;
        if (!previous || deps.some((value,j)=>value!==previous.deps[j])) {
            previous?.cleanup(); const cleanup=effect(); hooks.slots[i]={deps,cleanup}; hooks.cleanups.push(cleanup);
        }
    },
}));
import { useMoveHint } from './useMoveHint';
const move={fromRow:6,fromCol:4,toRow:4,toCol:4};
const renderHook=(key='white:0')=>{hooks.cursor=0;return useMoveHint(key);};
beforeEach(()=>{hooks.cleanups.forEach(cleanup=>cleanup());hooks.slots=[];hooks.cleanups=[];});

it('stores both endpoints on a successful search',async()=>{
    await renderHook().request(async()=>move);
    expect(renderHook().hintMove).toEqual(move); expect(renderHook().pending).toBe(false);
});
it('aborts a pending worker and rejects its late result when the position changes',async()=>{
    let reply!:(value:typeof move)=>void, signal!:AbortSignal;
    const pending=renderHook().request(input=>{signal=input;return new Promise(resolve=>{reply=resolve;});});
    expect(renderHook().pending).toBe(true);
    expect(renderHook('black:1').hintMove).toBeNull(); expect(signal.aborted).toBe(true);
    reply(move); await pending;
    expect(renderHook('black:1').hintMove).toBeNull(); expect(renderHook('black:1').pending).toBe(false);
});
it('closing advice cancels a worker and removes both endpoints',async()=>{
    let reply!:(value:typeof move)=>void;
    const pending=renderHook().request(()=>new Promise(resolve=>{reply=resolve;}));
    renderHook().clear(); reply(move); await pending;
    expect(renderHook().hintMove).toBeNull(); expect(renderHook().pending).toBe(false);
});
it('reports failures and malformed target coordinates instead of displaying partial advice',async()=>{
    await renderHook().request(async()=>{throw new Error('worker failed');}); expect(renderHook().failed).toBe(true);
    await renderHook().request(async()=>({...move,toRow:NaN}));
    expect(renderHook().hintMove).toBeNull(); expect(renderHook().failed).toBe(true);
});
