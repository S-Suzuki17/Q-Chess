import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { createTicketSpendStore } from './TicketSpendStore';

const MATCH_ID = '11111111-2222-4333-8444-555555555555';
const HINT_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

function mockClient(data: unknown, error: unknown = null) {
    const rpc = vi.fn((_name: string, _args: Record<string, unknown>) => ({
        abortSignal: vi.fn().mockResolvedValue({ data, error }),
    }));
    return { rpc, client: { rpc } as unknown as SupabaseClient };
}

describe('dormant atomic ticket-spend adapter', () => {
    it('is OFF by default and never calls the database', async () => {
        const { client, rpc } = mockClient(null);
        const store = createTicketSpendStore(client);
        await expect(store.spendRankedAtMatchStart(MATCH_ID, ['Alice']))
            .rejects.toThrow('TICKET_SPENDING_DISABLED');
        expect(rpc).not.toHaveBeenCalled();
    });

    it('accounts for two verified ranked participants in one RPC with no client-supplied amount or pool', async () => {
        const { client, rpc } = mockClient({ eventKind: 'ranked_match_start', eventId: MATCH_ID,
            applied: true, duplicate: false, insufficient: false,
            entries: [{ userId: 'Alice', pool: 'quota' }, { userId: 'Bob', pool: 'paid' }] });
        const store = createTicketSpendStore(client, true);
        const result = await store.spendRankedAtMatchStart(MATCH_ID, ['Bob', 'Alice']);
        expect(result.entries).toHaveLength(2);
        expect(rpc).toHaveBeenCalledExactlyOnceWith('spend_game_tickets', {
            p_event_kind: 'ranked_match_start', p_event_id: MATCH_ID, p_user_ids: ['Alice', 'Bob'],
        });
    });

    it('charges a CPU hint only through the after-delivery entry point', async () => {
        const { client, rpc } = mockClient({ eventKind: 'cpu_hint_delivered', eventId: HINT_ID,
            applied: true, duplicate: false, insufficient: false,
            entries: [{ userId: 'Alice', pool: 'free' }] });
        const result = await createTicketSpendStore(client, true).spendCpuHintAfterDelivery(HINT_ID, 'Alice');
        expect(result.applied).toBe(true);
        expect(rpc).toHaveBeenCalledWith('spend_game_tickets', {
            p_event_kind: 'cpu_hint_delivered', p_event_id: HINT_ID, p_user_ids: ['Alice'],
        });
    });

    it('rejects a quota receipt for a CPU hint', async () => {
        const { client } = mockClient({ eventKind: 'cpu_hint_delivered', eventId: HINT_ID,
            applied: true, duplicate: false, insufficient: false,
            entries: [{ userId: 'Alice', pool: 'quota' }] });
        await expect(createTicketSpendStore(client, true)
            .spendCpuHintAfterDelivery(HINT_ID, 'Alice'))
            .rejects.toThrow('TICKET_SPENDING_UNAVAILABLE');
    });

    it('returns insufficient funds without inventing a partial debit', async () => {
        const { client } = mockClient({ eventKind: 'ranked_match_start', eventId: MATCH_ID,
            applied: false, duplicate: false, insufficient: true, entries: [] });
        const result = await createTicketSpendStore(client, true)
            .spendRankedAtMatchStart(MATCH_ID, ['Alice', 'Bob']);
        expect(result).toMatchObject({ applied: false, insufficient: true, entries: [] });
    });

    it('treats a retry as an idempotent receipt, not a second spend', async () => {
        const { client } = mockClient({ eventKind: 'ranked_match_start', eventId: MATCH_ID,
            applied: false, duplicate: true, insufficient: false,
            entries: [{ userId: 'Alice', pool: 'paid' }] });
        const result = await createTicketSpendStore(client, true)
            .spendRankedAtMatchStart(MATCH_ID, ['Alice']);
        expect(result).toMatchObject({ applied: false, duplicate: true });
    });

    it('rejects invalid events and never reaches the RPC', async () => {
        const { client, rpc } = mockClient(null);
        const store = createTicketSpendStore(client, true);
        await expect(store.spendRankedAtMatchStart('not-a-uuid', ['Alice']))
            .rejects.toThrow('INVALID_TICKET_EVENT');
        await expect(store.spendRankedAtMatchStart(MATCH_ID, ['Alice', 'Alice']))
            .rejects.toThrow('INVALID_TICKET_EVENT');
        await expect(store.spendRankedAtMatchStart(MATCH_ID, ['Guest_1']))
            .rejects.toThrow('INVALID_TICKET_EVENT');
        await expect(store.spendRankedAtMatchStart(MATCH_ID, []))
            .rejects.toThrow('INVALID_TICKET_EVENT');
        expect(rpc).not.toHaveBeenCalled();
    });

    it('fails closed on RPC errors and mismatched or contradictory receipts', async () => {
        const base = { eventKind: 'ranked_match_start', eventId: MATCH_ID,
            applied: true, duplicate: false, insufficient: false,
            entries: [{ userId: 'Alice', pool: 'free' }] };
        for (const [data, error] of [
            [{ ...base, eventId: HINT_ID }, null],
            [{ ...base, duplicate: true }, null],
            [{ ...base, entries: [{ userId: 'Mallory', pool: 'free' }] }, null],
            [{ ...base, entries: [{ userId: 'Alice', pool: 'test' }] }, null],
            [base, { message: 'database unavailable' }],
        ] as const) {
            const { client } = mockClient(data, error);
            await expect(createTicketSpendStore(client, true)
                .spendRankedAtMatchStart(MATCH_ID, ['Alice']))
                .rejects.toThrow('TICKET_SPENDING_UNAVAILABLE');
        }
    });
});
