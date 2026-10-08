import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { createStripeCommercePrerequisites } from './StripeCommerceReadiness';

const protocols = ['stripe_commerce_deletion_protocol_version', 'shared_match_admission_protocol_version'];
function fixture() {
    const replies = new Map<string, { data: unknown; error: unknown }>(protocols.map(name => [name, { data: 1, error: null }]));
    const signals: AbortSignal[] = [];
    const rpc = vi.fn((name: string) => ({ abortSignal: vi.fn(async (signal: AbortSignal) => {
        signals.push(signal); return replies.get(name)!;
    }) }));
    const client = { rpc } as unknown as SupabaseClient;
    const gates = { deletionEnabled: vi.fn(() => true), sharedEntitlementEnabled: vi.fn(() => true),
        sharedAdmissionEnabled: vi.fn(() => true) };
    return { replies, signals, rpc, client, gates, readiness: createStripeCommercePrerequisites(client, gates) };
}

describe('read-only commerce deletion and shared-match protocol prerequisites', () => {
    it('uses only both existing protocol RPCs with bounded reads and exact version 1', async () => {
        const { readiness, rpc, signals } = fixture();
        expect(readiness.enabled()).toBe(true);
        await expect(readiness.check()).resolves.toBe(true);
        expect(rpc.mock.calls).toEqual(protocols.map(name => [name]));
        expect(signals).toHaveLength(2);
        expect(signals.every(signal => signal instanceof AbortSignal && !signal.aborted)).toBe(true);
    });

    it('keeps the actual unreleased source gates dormant without querying absent DB protocols', async () => {
        const { client, rpc } = fixture();
        const readiness = createStripeCommercePrerequisites(client);
        expect(readiness.enabled()).toBe(false);
        await expect(readiness.check()).resolves.toBe(false);
        expect(rpc).not.toHaveBeenCalled();
    });

    it.each(['deletionEnabled', 'sharedEntitlementEnabled', 'sharedAdmissionEnabled'] as const)
    ('requires the actual runtime %s dependency before any protocol read', async name => {
        const { readiness, gates, rpc } = fixture();
        gates[name].mockReturnValue(false);
        expect(readiness.enabled()).toBe(false);
        await expect(readiness.check()).resolves.toBe(false);
        expect(rpc).not.toHaveBeenCalled();
        gates[name].mockImplementation(() => { throw new Error('private gate error'); });
        expect(readiness.enabled()).toBe(false);
        await expect(readiness.check()).resolves.toBe(false);
        expect(rpc).not.toHaveBeenCalled();
    });

    it.each(protocols.flatMap(name => [null, undefined, false, 0, 2, '1', { version: 1 }].map(data => ({ name, data }))))
    ('rejects missing or wrong protocol response $name = $data', async ({ name, data }) => {
        const { readiness, replies } = fixture();
        replies.set(name, { data, error: null });
        await expect(readiness.check()).resolves.toBe(false);
    });

    it.each(protocols)('rejects permission/missing-function errors even with version 1: %s', async name => {
        const { readiness, replies } = fixture();
        replies.set(name, { data: 1, error: { code: '42501', message: 'private DB detail' } });
        await expect(readiness.check()).resolves.toBe(false);
    });

    it('closes on a thrown client error without propagating its details', async () => {
        const { readiness, rpc } = fixture();
        rpc.mockImplementation(() => { throw new Error('private network error'); });
        await expect(readiness.check()).resolves.toBe(false);
    });

    it('rechecks gates after protocol responses arrive', async () => {
        const { readiness, rpc, gates } = fixture();
        rpc.mockImplementation(() => ({ abortSignal: vi.fn(async () => {
            gates.sharedAdmissionEnabled.mockReturnValue(false);
            return { data: 1, error: null };
        }) }));
        await expect(readiness.check()).resolves.toBe(false);
    });
});
