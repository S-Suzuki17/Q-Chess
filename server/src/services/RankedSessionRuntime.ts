import { RankedAuth, type RankedSessionAuthority } from './RankedAuth';
import type { DurableRankedAuth } from './DurableRankedAuth';

// Source gate: changing environment variables is insufficient. Release review
// must resolve lost expired-token evidence before changing this literal.
export const DURABLE_LEGACY_RUNTIME_RELEASE_READY = false;
export function createRankedSessionAuthority(service: {
    verifyLegacyPassword: (id: string, password: string) => Promise<boolean>;
    durableSessionAuthority: () => DurableRankedAuth;
}, mode: string | undefined = process.env.LEGACY_SESSION_MODE): RankedSessionAuthority {
    if (mode === undefined || mode === 'memory') return new RankedAuth((id, password) => service.verifyLegacyPassword(id, password));
    if (mode !== 'durable' || !DURABLE_LEGACY_RUNTIME_RELEASE_READY) throw new Error('Legacy session runtime activation is held');
    // Never fall back to memory after durable mode is selected.
    return service.durableSessionAuthority();
}
