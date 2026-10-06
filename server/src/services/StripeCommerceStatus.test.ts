import type { SupabaseClient } from '@supabase/supabase-js';
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createStripeCommerceStatusStore } from './StripeCommerceStatus';
import { applyMigrations, historicalCommerceDatabase, releaseCommerceMigrations } from './fixtures/commerceDatabaseFixture';

const future = () => new Date(Date.now() + 86400_000).toISOString();
const activeRow = () => ({ userId: 'Alice', active: true, sku: 'plus_monthly', periodEnd: future(),
    cancelAtPeriodEnd: false, unlimitedRanked: true, adFree: true,
    purchasedHintTickets: 13, subscriptionHintTickets: 10 });
const inactiveRow = () => ({ ...activeRow(), active: false, sku: null, periodEnd: null,
    unlimitedRanked: false, adFree: false });
function fixture(data: unknown, error: unknown = null) {
    const abortSignal = vi.fn().mockResolvedValue({ data, error });
    const rpc = vi.fn(() => ({ abortSignal }));
    const subject = createStripeCommerceStatusStore({ rpc } as unknown as SupabaseClient);
    return { subject, rpc, abortSignal };
}

describe('read-only commerce status boundary', () => {
    it.each([false, true])('reads only the bounded owner/mode status RPC for livemode=%s', async livemode => {
        const row = activeRow(); const f = fixture(row);
        const result = await f.subject.status('Alice', livemode);
        expect(f.rpc).toHaveBeenCalledExactlyOnceWith('stripe_commerce_status', {
            p_user_id: 'Alice', p_livemode: livemode,
        });
        expect(f.abortSignal).toHaveBeenCalledExactlyOnceWith(expect.any(AbortSignal));
        expect(result).toEqual({ userId: 'Alice', livemode, active: true, sku: 'plus_monthly',
            periodEnd: row.periodEnd, cancelAtPeriodEnd: false, unlimitedRanked: livemode, adFree: livemode,
            balances: { purchased: 13, subscription: 10 } });
    });
    it('sets a five-second database deadline', async () => {
        const timeout = vi.spyOn(AbortSignal, 'timeout');
        try {
            await fixture(activeRow()).subject.status('Alice', false);
            expect(timeout).toHaveBeenCalledWith(5000);
        } finally { timeout.mockRestore(); }
    });
    it('preserves each uncapped exact-integer balance without adding them together', async () => {
        const f = fixture({ ...inactiveRow(), purchasedHintTickets: Number.MAX_SAFE_INTEGER,
            subscriptionHintTickets: Number.MAX_SAFE_INTEGER });
        await expect(f.subject.status('Alice', false)).resolves.toMatchObject({ active: false, sku: null,
            balances: { purchased: Number.MAX_SAFE_INTEGER, subscription: Number.MAX_SAFE_INTEGER } });
    });
    it('preserves scheduled cancellation while the paid subscription is active', async () => {
        await expect(fixture({ ...activeRow(), cancelAtPeriodEnd: true }).subject.status('Alice', true))
            .resolves.toMatchObject({ active: true, cancelAtPeriodEnd: true });
    });
    it.each(['2020-01-01T00:00:00Z', '2040-01-01T00:00:00Z'])(
        'preserves database-confirmed activity and balances when the host clock reads %s', async hostTime => {
            const row = { ...activeRow(), periodEnd: '2030-01-01T00:00:00.123456+00:00' };
            const now = vi.spyOn(Date, 'now').mockReturnValue(Date.parse(hostTime));
            try {
                await expect(fixture(row).subject.status('Alice', true)).resolves.toMatchObject({
                    active: true, sku: 'plus_monthly', periodEnd: row.periodEnd,
                    unlimitedRanked: true, adFree: true, balances: { purchased: 13, subscription: 10 },
                });
                await expect(fixture(inactiveRow()).subject.status('Alice', true)).resolves.toMatchObject({
                    active: false, sku: null, periodEnd: null, unlimitedRanked: false, adFree: false,
                    balances: { purchased: 13, subscription: 10 },
                });
            } finally { now.mockRestore(); }
        });
    it.each([null, undefined, [], {}, 'active', { ...activeRow(), userId: 'Bob' },
        { ...activeRow(), active: 'true' }, { ...activeRow(), sku: 'legacy_monthly' },
        { ...activeRow(), sku: 'hints_13' }, { ...activeRow(), sku: null },
        { ...activeRow(), periodEnd: null }, { ...activeRow(), periodEnd: 'infinity' },
        { ...activeRow(), periodEnd: 20300101 }, { ...activeRow(), periodEnd: '2030-01-01' },
        { ...activeRow(), periodEnd: '2030-02-30T00:00:00Z' },
        { ...activeRow(), cancelAtPeriodEnd: 1 }, { ...activeRow(), unlimitedRanked: false },
        { ...activeRow(), adFree: 'true' }, { ...inactiveRow(), sku: 'standard_monthly' },
        { ...inactiveRow(), periodEnd: future() }, { ...inactiveRow(), cancelAtPeriodEnd: true },
        { ...inactiveRow(), unlimitedRanked: true }])('rejects malformed or contradictory status %j', async data => {
        await expect(fixture(data).subject.status('Alice', false)).rejects.toThrow('COMMERCE_STATUS_UNAVAILABLE');
    });
    it.each(['purchasedHintTickets', 'subscriptionHintTickets'])('validates the complete %s number boundary', async field => {
        for (const value of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '10', null, undefined]) {
            await expect(fixture({ ...inactiveRow(), [field]: value }).subject.status('Alice', false))
                .rejects.toThrow('COMMERCE_STATUS_UNAVAILABLE');
        }
    });
    it.each(['', ' Alice', 'Alice ', 'A\nB', 'A'.repeat(257), 'あ'.repeat(86)])(
        'rejects an invalid account without a database read', async userId => {
            const f = fixture(activeRow());
            await expect(f.subject.status(userId, false)).rejects.toThrow('COMMERCE_STATUS_UNAVAILABLE');
            expect(f.rpc).not.toHaveBeenCalled();
        });
    it('requires an explicit boolean mode before reading', async () => {
        const f = fixture(activeRow());
        await expect(f.subject.status('Alice', undefined as unknown as boolean)).rejects.toThrow('COMMERCE_STATUS_UNAVAILABLE');
        expect(f.rpc).not.toHaveBeenCalled();
    });
    it('does not convert database failures or aborted reads into empty membership', async () => {
        const f = fixture(inactiveRow(), new Error('ownership check failed'));
        await expect(f.subject.status('Alice', false)).rejects.toThrow('COMMERCE_STATUS_UNAVAILABLE');
        f.abortSignal.mockRejectedValue(new DOMException('deadline', 'TimeoutError'));
        await expect(f.subject.status('Alice', false)).rejects.toThrow('deadline');
    });
});

// Only the PostgREST transport is simulated. The account/ownership, mode,
// paid-period, refund and pool-isolation checks execute the existing SQL RPC.
describe('commerce status over the real isolated PostgreSQL contract', () => {
    let db: PGlite;
    beforeAll(async () => {
        db = await historicalCommerceDatabase();
        await applyMigrations(db, releaseCommerceMigrations);
    }, 60_000);
    afterAll(async () => { await db?.close(); });
    beforeEach(async () => {
        await db.exec("begin; insert into public.profiles(id) values('Alice'),('Bob'); set role service_role;");
    });
    afterEach(async () => { await db.exec('rollback; reset role'); });
    const scalar = async (sql: string, values: unknown[] = []) =>
        (await db.query<{ result: unknown }>(sql, values)).rows[0]?.result;
    async function owner(sql: string, values: unknown[] = []) {
        await db.exec('reset role');
        const result = await db.query(sql, values);
        await db.exec('set role service_role');
        return result;
    }
    const subject = () => createStripeCommerceStatusStore({
        rpc(name: string, args: { p_user_id: string; p_livemode: boolean }) {
            expect(name).toBe('stripe_commerce_status');
            return { async abortSignal(signal: AbortSignal) {
                expect(signal).toBeInstanceOf(AbortSignal);
                await db.exec('savepoint status_read');
                try {
                    const data = await scalar('select public.stripe_commerce_status($1,$2) as result',
                        [args.p_user_id, args.p_livemode]);
                    return { data, error: null };
                } catch (error) {
                    await db.exec('rollback to savepoint status_read');
                    return { data: null, error };
                } finally { await db.exec('release savepoint status_read'); }
            } };
        },
    } as unknown as SupabaseClient);
    async function seed(sku = 'plus_monthly', livemode = false) {
        const checkout = `cs_${livemode ? 'live' : 'test'}_StatusFixture`;
        const end = future();
        await owner('insert into public.stripe_commerce_price_bindings values($1,$2,$3)',
            [sku, 'price_StatusFixture', livemode]);
        await owner(`insert into public.stripe_checkout_intents(checkout_id,user_id,price_id,livemode,expires_at)
            values($1,'Alice','price_StatusFixture',$2,clock_timestamp()+interval '1 hour')`, [checkout, livemode]);
        await owner(`insert into public.stripe_commerce_checkout_intents(checkout_id,user_id,sku,price_id,amount_total,currency,livemode,expires_at)
            values($1,'Alice',$2,'price_StatusFixture',$3,'usd',$4,clock_timestamp()+interval '1 hour')`,
        [checkout, sku, sku === 'plus_monthly' ? 600 : 300, livemode]);
        await owner("insert into public.stripe_customer_links values('cus_StatusFixture','Alice')");
        await owner(`insert into public.stripe_memberships(subscription_id,checkout_id,customer_id,user_id,current_price_id,status,period_end,event_created,observed_at)
            values('sub_StatusFixture',$1,'cus_StatusFixture','Alice','price_StatusFixture','active',$2,1,clock_timestamp())`,
        [checkout, end]);
        await owner(`insert into public.stripe_commerce_event_receipts(event_id,payload_hash,operation,business_key)
            values('evt_StatusFixture',$1,'paid_period','status-fixture')`, ['a'.repeat(64)]);
        await owner(`insert into public.stripe_commerce_paid_periods(subscription_id,livemode,period_start,period_end,sku,hint_quantity,first_event_id)
            values('sub_StatusFixture',$1,$2::timestamptz-interval '30 days',$2,$3,$4,'evt_StatusFixture')`,
        [livemode, end, sku, sku === 'plus_monthly' ? 10 : 0]);
    }
    const stock = () => owner(`insert into public.ticket_wallets(user_id,ranked_tickets,hint_tickets,
        member_ranked_tickets,member_hint_tickets,member_ticket_subscription_id,
        test_member_ranked_tickets,test_member_hint_tickets,test_member_ticket_subscription_id,
        purchased_hint_tickets,subscription_hint_tickets,
        test_purchased_hint_tickets,test_subscription_hint_tickets)
        values('Alice',3,4,7,8,'sub_LegacyFixture',5,6,'sub_TestLegacyFixture',77,30,13,10)`);

    it('returns zero for a missing wallet without creating one', async () => {
        await expect(subject().status('Alice', false)).resolves.toEqual({ userId: 'Alice', livemode: false,
            active: false, sku: null, periodEnd: null, cancelAtPeriodEnd: false, unlimitedRanked: false, adFree: false,
            balances: { purchased: 0, subscription: 0 } });
        expect(await scalar('select count(*)::integer as result from public.ticket_wallets')).toBe(0);
    });
    it.each([['standard_monthly', false], ['plus_monthly', false], ['standard_monthly', true], ['plus_monthly', true]] as const)(
        'reads exact paid %s state and isolated pools for livemode=%s', async (sku, livemode) => {
            await seed(sku, livemode); await stock();
            const before = await scalar("select to_jsonb(w) as result from public.ticket_wallets w where user_id='Alice'");
            await expect(subject().status('Alice', livemode)).resolves.toMatchObject({ active: true, sku, livemode,
                unlimitedRanked: livemode, adFree: livemode,
                balances: livemode ? { purchased: 77, subscription: 30 } : { purchased: 13, subscription: 10 } });
            expect(await scalar("select to_jsonb(w) as result from public.ticket_wallets w where user_id='Alice'")).toEqual(before);
            await expect(subject().status('Bob', livemode)).resolves.toMatchObject({ active: false,
                balances: { purchased: 0, subscription: 0 } });
        });
    it('does not read sandbox membership or pools as live billing', async () => {
        await seed(); await stock();
        await expect(subject().status('Alice', true)).resolves.toMatchObject({ active: false, livemode: true,
            balances: { purchased: 77, subscription: 30 } });
    });
    it('rejects sandbox status against a live-pinned database', async () => {
        await seed('plus_monthly', true);
        await expect(subject().status('Alice', false)).rejects.toThrow('COMMERCE_STATUS_UNAVAILABLE');
    });
    it.each(['stripe_checkout_intents', 'stripe_commerce_checkout_intents', 'stripe_customer_links'])(
        'rejects an owner mismatch in %s as an active membership', async table => {
            await seed();
            await owner(`update public.${table} set user_id='Bob'`);
            await expect(subject().status('Alice', false)).resolves.toMatchObject({ active: false, sku: null });
        });
    it.each([
        "update public.stripe_memberships set current_price_id='price_Different'",
        "update public.stripe_memberships set refund_blocked_until=clock_timestamp()-interval '1 day'",
        "update public.stripe_memberships set period_end=clock_timestamp()-interval '1 day'",
        "update public.stripe_memberships set status='canceled'",
        "update public.stripe_memberships set status='past_due'",
        'delete from public.stripe_commerce_paid_periods',
        "update public.stripe_commerce_paid_periods set sku='standard_monthly'",
        'update public.stripe_commerce_paid_periods set livemode=true',
        "insert into public.stripe_retired_subscriptions(subscription_id,livemode) values('sub_StatusFixture',false)",
    ])('withholds active status without changing balances: %s', async sql => {
        await seed(); await stock(); await owner(sql);
        await expect(subject().status('Alice', false)).resolves.toMatchObject({ active: false, sku: null,
            balances: { purchased: 13, subscription: 10 } });
    });
    it('does not reinterpret a legacy subscription as a new SKU', async () => {
        await seed();
        await owner('delete from public.stripe_commerce_checkout_intents');
        await expect(subject().status('Alice', false)).resolves.toMatchObject({ active: false, sku: null });
    });
    it.each([
        "insert into public.account_restrictions values('Alice',true)",
        "insert into public.account_deletion_jobs values('Alice','pending')",
        "delete from public.profiles where id='Alice'",
    ])('fails closed for an unavailable account: %s', async sql => {
        await owner(sql);
        await expect(subject().status('Alice', false)).rejects.toThrow('COMMERCE_STATUS_UNAVAILABLE');
    });
});
