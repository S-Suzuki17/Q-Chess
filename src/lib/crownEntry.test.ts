import { describe, expect, it, vi } from 'vitest';
import { createCrownEntryController } from './crownEntry';
import type { CrownAuthorization } from './crownAdmission';
import { crownAdmissionEnabled, crownRankKey } from '../config/crownAdmission';
import { crownAdmissionEnabled as serverEnabled, crownRankKey as serverKey } from '../../server/src/protocol/CrownAdmission';
import { CIRCUIT_STAGES } from '../config/circuitStages';

const deferred = <T>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; };
const receipt = { state: 'authorized' as const, userId: 'Alice', rankKey: 'crown:stage:v1:1',
    authorizationId: '00000000-0000-4000-8000-000000000001', source: 'verified_ad' as const, reused: false };
const setup = (enabled = true) => {
    const dependencies = { enabled: () => enabled, authorize: vi.fn(async (): Promise<CrownAuthorization> => receipt),
        legacyPaid: vi.fn(async () => false), legacyInterstitial: vi.fn(async () => 'unavailable') };
    return { dependencies, entry: createCrownEntryController(dependencies) };
};
describe('Crown entry admission', () => {
    it('selects strength grouping without opening either provider release gate', () => {
        expect(crownAdmissionEnabled()).toBe(false); expect(serverEnabled()).toBe(false);
        expect(crownRankKey(1)).toBe('crown:strength:v1:1');
        expect(serverKey(1)).toBe('crown:strength:v1:1');
        for (const mapping of ['stage_v1','strength_v1'] as const) {
            for (let stage = 1; stage <= 100; stage++) expect(crownRankKey(stage,mapping)).toBe(serverKey(stage,mapping));
            for (const invalid of [0,101,1.2,'1',null,NaN]) expect(crownRankKey(invalid,mapping)).toBeNull();
        }
        expect(new Set(Array.from({length:100},(_,i)=>crownRankKey(i+1,'stage_v1'))).size).toBe(100);
        expect(new Set(Array.from({length:100},(_,i)=>crownRankKey(i+1,'strength_v1'))).size).toBe(34);
    });
    it('maps the actual 100 stages to exactly 34 CPU strengths, not 100 ad requests', () => {
        expect(CIRCUIT_STAGES).toHaveLength(100);
        const groups = new Map<number, Set<string>>();
        for (const stage of CIRCUIT_STAGES) {
            const key = `crown:strength:v1:${stage.strength}`;
            expect(crownRankKey(stage.id)).toBe(key);
            expect(serverKey(stage.id)).toBe(key);
            const clocks = groups.get(stage.strength) ?? new Set<string>();
            clocks.add(stage.timeControl);
            groups.set(stage.strength, clocks);
        }
        expect(groups.size).toBe(34);
        for (let strength = 1; strength <= 33; strength++) {
            expect(groups.get(strength)).toEqual(new Set(['10m', '3m', '10s']));
        }
        expect(groups.get(34)).toEqual(new Set(['10m']));
        expect(crownRankKey(100)).toBe('crown:strength:v1:34');
        for (const invalid of [0, 101, 1.2, '1', null, NaN, Infinity]) {
            expect(crownRankKey(invalid)).toBeNull();
            expect(serverKey(invalid)).toBeNull();
        }
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
    it('keeps closed-gate play available when membership or the optional ad SDK fails', async () => {
        const {entry,dependencies}=setup(false);
        dependencies.legacyPaid.mockRejectedValue(new Error('membership service unavailable'));
        dependencies.legacyInterstitial.mockRejectedValue(new Error('ad provider unavailable'));
        const result=await entry.start('Alice',1,()=>true);
        expect(result.state).toBe('ready');
        if(result.state==='ready')expect(result.canActivate()).toBe(true);
        expect(entry.pending).toBe(false);
        expect(dependencies.authorize).not.toHaveBeenCalled();
    });
    it('still cancels a delayed optional ad failure after leaving or revoking permission', async () => {
        const {entry,dependencies}=setup(false), ad=deferred<unknown>();
        dependencies.legacyInterstitial.mockImplementation(async()=>{await ad.promise;throw new Error('ad failed');});
        let allowed=true;
        const pending=entry.start('Alice',1,()=>allowed);
        await vi.waitFor(()=>expect(dependencies.legacyInterstitial).toHaveBeenCalledOnce());
        allowed=false;entry.cancel();ad.resolve('unavailable');
        expect(await pending).toEqual({state:'cancelled'});
        expect(entry.pending).toBe(false);
    });
    it('never bypasses failed verified authorization when the release gate is enabled', async () => {
        const {entry,dependencies}=setup(true);
        dependencies.authorize.mockRejectedValue(new Error('authorization unavailable'));
        expect(await entry.start('Alice',1,()=>true)).toEqual({state:'unavailable'});
        expect(dependencies.legacyPaid).not.toHaveBeenCalled();
        expect(dependencies.legacyInterstitial).not.toHaveBeenCalled();
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
