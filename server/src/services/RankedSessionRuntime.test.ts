import { describe, expect, it, vi } from 'vitest';
import { createRankedSessionAuthority, DURABLE_LEGACY_RUNTIME_RELEASE_READY } from './RankedSessionRuntime';
import { RankedAuth } from './RankedAuth';
describe('dormant runtime selection', () => {
    const service={verifyLegacyPassword:vi.fn().mockResolvedValue(true),durableSessionAuthority:vi.fn()};
    it('retains the existing memory default',()=>{
        expect(createRankedSessionAuthority(service,'memory')).toBeInstanceOf(RankedAuth);
    });
    it.each(['durable','unknown',''])('rejects environment-only activation or invalid mode %s without a fallback',mode=>{
        expect(DURABLE_LEGACY_RUNTIME_RELEASE_READY).toBe(false);
        expect(()=>createRankedSessionAuthority(service,mode)).toThrow('activation is held');
        expect(service.durableSessionAuthority).not.toHaveBeenCalled();
        expect(service.verifyLegacyPassword).not.toHaveBeenCalled();
    });
});
