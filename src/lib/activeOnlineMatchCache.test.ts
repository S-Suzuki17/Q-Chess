import { afterEach, expect, it, vi } from 'vitest';
import { rememberActiveOnlineMatch, forgetActiveOnlineMatch } from './activeOnlineMatchCache';
const match={userId:'alice',roomId:'matched',role:'white' as const,matchMode:'ranked' as const,tc:'10m' as const,timestamp:123};
afterEach(()=>vi.unstubAllGlobals());
it.each(['QuotaExceededError','SecurityError'])('keeps cache failure optional (%s)',name=>{
    const failure=()=>{throw Object.assign(new Error('unavailable'),{name});};
    vi.stubGlobal('window',{localStorage:{setItem:failure,removeItem:failure}});
    expect(rememberActiveOnlineMatch(match)).toBe(false);
    expect(forgetActiveOnlineMatch()).toBe(false);
});
it('handles browser storage access denial itself, without substituting admission authority',()=>{
    vi.stubGlobal('window',Object.defineProperty({},'localStorage',{get(){throw new Error('denied');}}));
    expect(rememberActiveOnlineMatch(match)).toBe(false);
    expect(forgetActiveOnlineMatch()).toBe(false);
});
it('stores the identity-scoped restore record and clears only that cache',()=>{
    const setItem=vi.fn(),removeItem=vi.fn();
    vi.stubGlobal('window',{localStorage:{setItem,removeItem}});
    expect(rememberActiveOnlineMatch(match)).toBe(true);
    expect(JSON.parse(setItem.mock.calls[0][1])).toEqual(match);
    expect(forgetActiveOnlineMatch()).toBe(true);
    expect(removeItem).toHaveBeenCalledExactlyOnceWith('qg_active_online_match');
});
