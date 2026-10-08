import type { SupabaseClient } from '@supabase/supabase-js';

// Tested against the Web document and the service-only SQL policy.
export const CURRENT_TICKET_TERMS_VERSION = '2026-10-07.1';
export interface CurrentTermsStatus {
    userId: string;
    currentVersion: string;
    effectiveDate: string | null;
    effective: boolean;
    consent: { version: string; acceptedAt: string } | null;
}
export function parseCurrentTerms(value: unknown, id: string): CurrentTermsStatus {
    const row = value as CurrentTermsStatus | null;
    const date = row?.effectiveDate;
    if (!row || row.userId !== id || row.currentVersion !== CURRENT_TICKET_TERMS_VERSION
        || typeof row.effective !== 'boolean'
        || !(date === null || (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)
            && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date))
        || (row.effective && !date)
        || !(row.consent === null || (row.consent?.version === CURRENT_TICKET_TERMS_VERSION
            && typeof row.consent.acceptedAt === 'string' && Number.isFinite(Date.parse(row.consent.acceptedAt))))) {
        throw new Error('TERMS_UNAVAILABLE');
    }
    return row;
}
export async function readCurrentTerms(client: SupabaseClient, id: string): Promise<CurrentTermsStatus> {
    const { data, error } = await client.rpc('current_account_terms_status', { p_user_id: id })
        .abortSignal(AbortSignal.timeout(5000));
    if (error) throw new Error('TERMS_UNAVAILABLE');
    return parseCurrentTerms(data, id);
}
export async function hasCurrentTicketTerms(client: SupabaseClient, id: string): Promise<boolean> {
    const value = await readCurrentTerms(client, id);
    return value.effective && value.consent !== null;
}
export function createCurrentTermsStore(client: SupabaseClient,
    verifyUser: (token: string) => Promise<string | null>, blocked: (id: string) => Promise<boolean>,
    ensure: (id: string, mayCreate: boolean) => Promise<unknown>) {
    return {
        verifyUser, blocked,
        read: (id: string) => readCurrentTerms(client, id),
        async accept(id: string, mayCreate: boolean) {
            await ensure(id, mayCreate);
            const { data, error } = await client.rpc('accept_current_account_terms', {
                p_user_id: id, p_version: CURRENT_TICKET_TERMS_VERSION,
            }).abortSignal(AbortSignal.timeout(5000));
            if (error) throw new Error('TERMS_UNAVAILABLE');
            const value = parseCurrentTerms(data, id);
            if (!value.effective || !value.consent) throw new Error('TERMS_UNAVAILABLE');
            return value;
        },
    };
}
