import { describe, expect, it, vi } from 'vitest';
import { createCrownEntryController } from './crownEntry';
import type { CrownAuthorization } from './crownAdmission';
import { crownAdmissionEnabled, crownRankKey } from '../config/crownAdmission';
import { crownAdmissionEnabled as serverEnabled, crownRankKey as serverKey } from '../../server/src/protocol/CrownAdmission';

const deferred = <T>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; };
const receipt = { state: 'authorized' as const, userId: 'Alice', rankKey: 'crown:stage:v1:1',
    authorizationId: '00000000-0000-4000-8000-000000000001', source: 'verified_ad' as const, reused: false };
const setup = (enabled = true) => {
    const dependencies = { enabled: () => enabled, authorize: vi.fn(async (): Promise<CrownAuthorization> => receipt),
        legacyPaid: vi.fn(async () => false), legacyInterstitial: vi.fn(async () => 'unavailable') };
    return { dependencies, entry: createCrownEntryController(dependencies) };
};
describe('Crown entry admission', () => {
    it('keeps mapping and provider release gates closed on both client and server', () => {
        expect(crownAdmissionEnabled()).toBe(false); expect(serverEnabled()).toBe(false);
        expect(crownRankKey(1)).toBeNull(); expect(serverKey(1)).toBeNull();
        for (const mapping of ['stage_v1','strength_v1'] as const) {
            for (let stage = 1; stage <= 100; stage++) expect(crownRankKey(stage,mapping)).toBe(serverKey(stage,mapping));
            for (const invalid of [0,101,1.2,'1',null,NaN]) expect(crownRankKey(invalid,mapping)).toBeNull();
        }
        expect(new Set(Array.from({length:100},(_,i)=>crownRankKey(i+1,'stage_v1'))).size).toBe(100);
        expect(new Set(Array.from({length:100},(_,i)=>crownRankKey(i+1,'strength_v1'))).size).toBe(34);
    });
    it('preserves legacy membership exemption and lets unavailable legacy ads keep existing play behavior', async () => {
        const {entry,dependencies}=setup(false);
        expect((await entry.start('Alice',1,()=>true)).state).toBe('ready');
        expect(dependencies.authorize).not.toHaveBeenCalled(); expect(dependencies.legacyInterstitial).toHaveBeenCalledOnce();
        dependencies.legacyPaid.mockResolvedValue(true);
        expect((await entry.start('Alice',1,()=>true)).state).toBe('ready');
        expect(dependencies.legacyInterstitial).toHaveBeenCalledOnce();
    });
    it('never starts twice for repeated clicks', async () => {
        const {entry,dependencies}=setup(), gate=deferred<typeof receipt>(); dependencies.authorize.mockReturnValue(gate.promise);
        const first=entry.start('Alice',1,()=>true);
        expect(await entry.start('Alice',1,()=>true)).toEqual({state:'busy'});
        gate.resolve(receipt); const ready=await first;
        expect(ready.state).toBe('ready'); expect(dependencies.authorize).toHaveBeenCalledOnce();
    });
    it.each(['Back','Cancel','unmount','stage switch','side switch','popstate'])('discards completion after %s and retains a later valid receipt', async () => {
        const {entry,dependencies}=setup(), gate=deferred<typeof receipt>(); dependencies.authorize.mockReturnValueOnce(gate.promise);
        const pending=entry.start('Alice',1,()=>true); entry.cancel();
        gate.resolve(receipt); expect(await pending).toEqual({state:'cancelled'});
        dependencies.authorize.mockResolvedValue({...receipt,reused:true});
        expect((await entry.start('Alice',1,()=>true)).state).toBe('ready');
        expect(dependencies.legacyInterstitial).not.toHaveBeenCalled();
    });
    it.each([true,false])('discards revoked permission and same-account reauthentication before activation (enabled=%s)', async enabled => {
        const {entry,dependencies}=setup(enabled); let revision=1;
        const gate=deferred<any>(); if(enabled) dependencies.authorize.mockReturnValue(gate.promise); else dependencies.legacyPaid.mockReturnValue(gate.promise);
        const captured=revision, pending=entry.start('Alice',1,()=>captured===revision);
        revision++; gate.resolve(enabled?receipt:false);
        expect(await pending).toEqual({state:'cancelled'}); expect(dependencies.legacyInterstitial).not.toHaveBeenCalled();
    });
    it('does not let an older cancelled request clear a newer pending entry', async () => {
        const {entry,dependencies}=setup(), old=deferred<typeof receipt>(), newer=deferred<typeof receipt>();
        dependencies.authorize.mockReturnValueOnce(old.promise).mockReturnValueOnce(newer.promise);
        const previous=entry.start('Alice',1,()=>true); entry.cancel(); const next=entry.start('Alice',1,()=>true);
        old.resolve(receipt); await previous; expect(entry.pending).toBe(true);
        newer.resolve(receipt); const result=await next; expect(result.state).toBe('ready');
        entry.cancel(); if(result.state==='ready')expect(result.canActivate()).toBe(false);
    });
    it('does not interpret absent evidence or another account receipt as authorization', async () => {
        const {entry,dependencies}=setup();
        dependencies.authorize.mockResolvedValueOnce({state:'reward_required',userId:'Alice',rankKey:receipt.rankKey});
        expect(await entry.start('Alice',1,()=>true)).toEqual({state:'reward_required'});
        dependencies.authorize.mockResolvedValueOnce({...receipt,userId:'Bob'});
        expect(await entry.start('Alice',1,()=>true)).toEqual({state:'unavailable'});
        expect(dependencies.legacyInterstitial).not.toHaveBeenCalled();
    });
});
