import type { SupabaseClient } from '@supabase/supabase-js';

export type TicketSpendEventKind = 'ranked_match_start' | 'cpu_hint_delivered';
export type TicketSpendPool = 'quota' | 'free' | 'paid';
export interface TicketSpendResult {
    eventKind: TicketSpendEventKind;
    eventId: string;
    applied: boolean;
    duplicate: boolean;
    insufficient: boolean;
    entries: { userId: string; pool: TicketSpendPool }[];
}

const eventIdPattern = /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i;
const disallowedUserPrefix = /^(guest([-_]|$)|anon(ymous)?([-_]|$)|cpu([-_]|$)|ai(:|$)|supabase-)/i;
const object = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === 'object' && !Array.isArray(value);

function validUserId(value: unknown): value is string {
    return typeof value === 'string' && value.length >= 1 && value.length <= 256
        && Buffer.byteLength(value, 'utf8') <= 256 && value.trim() === value
        && !/[\u0000-\u001f\u007f]/.test(value) && !disallowedUserPrefix.test(value);
}

function parseResult(value: unknown, eventKind: TicketSpendEventKind, eventId: string,
    userIds: readonly string[]): TicketSpendResult | null {
    if (!object(value) || value.eventKind !== eventKind
        || typeof value.eventId !== 'string' || value.eventId.toLowerCase() !== eventId.toLowerCase()
        || typeof value.applied !== 'boolean' || typeof value.duplicate !== 'boolean'
        || typeof value.insufficient !== 'boolean' || !Array.isArray(value.entries)) return null;
    const flags = [value.applied, value.duplicate, value.insufficient].filter(Boolean);
    if (flags.length !== 1) return null;
    const entries = value.entries;
    if (value.insufficient ? entries.length !== 0 : entries.length !== userIds.length) return null;
    const found = new Set<string>();
    for (const entry of entries) {
        if (!object(entry) || typeof entry.userId !== 'string'
            || !userIds.includes(entry.userId) || found.has(entry.userId)
            || (entry.pool !== 'quota' && entry.pool !== 'free' && entry.pool !== 'paid')
            || (eventKind === 'cpu_hint_delivered' && entry.pool === 'quota')) return null;
        found.add(entry.userId);
    }
    return value as unknown as TicketSpendResult;
}

/**
 * Dormant trusted-server adapter. The caller must derive participants from its
 * authenticated match record, never from a client payload. Create an event UUID
 * once per match start or actually delivered hint, then reuse it on retries.
 * No gameplay route calls this adapter and it is disabled by default.
 */
export function createTicketSpendStore(client: SupabaseClient, enabled = false) {
    async function spend(eventKind: TicketSpendEventKind, eventId: string,
        participants: readonly string[]): Promise<TicketSpendResult> {
        if (!enabled) throw new Error('TICKET_SPENDING_DISABLED');
        if (!eventIdPattern.test(eventId) || !Array.isArray(participants)
            || participants.length < 1 || participants.length > 2
            || (eventKind === 'cpu_hint_delivered' && participants.length !== 1)
            || participants.some(userId => !validUserId(userId))
            || new Set(participants).size !== participants.length) {
            throw new Error('INVALID_TICKET_EVENT');
        }
        const userIds = [...participants].sort();
        const { data, error } = await client.rpc('spend_game_tickets', {
            p_event_kind: eventKind,
            p_event_id: eventId,
            p_user_ids: userIds,
        }).abortSignal(AbortSignal.timeout(5000));
        const result = !error && parseResult(data, eventKind, eventId, userIds);
        if (!result) throw new Error('TICKET_SPENDING_UNAVAILABLE');
        return result;
    }

    return {
        spendRankedAtMatchStart(eventId: string, verifiedUserIds: readonly string[]) {
            return spend('ranked_match_start', eventId, verifiedUserIds);
        },
        spendCpuHintAfterDelivery(eventId: string, verifiedUserId: string) {
            return spend('cpu_hint_delivered', eventId, [verifiedUserId]);
        },
    };
}
