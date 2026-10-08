import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { applyMigrations, historicalCommerceDatabase, releaseCommerceMigrations } from './fixtures/commerceDatabaseFixture';

// These are real PostgreSQL functions and tables in an isolated PGlite fixture.
// Provider IDs/bindings below are synthetic, never external account changes.
// The fixture verifies transactions and role grants, not cross-process races.
const MIGRATION = '20261006155010_atomic_commerce_fulfillment.sql';
const HASH = 'a'.repeat(64);
const MAX = 9007199254740991;
const DAY = 86_400_000;
const SPECS = [
    ['hints_1', 100, 1], ['hints_13', 1000, 13], ['hints_27', 2000, 27],
    ['hints_44', 3000, 44], ['hints_77', 5000, 77], ['hints_166', 10000, 166],
    ['standard_monthly', 300, 0], ['plus_monthly', 600, 10],
] as const;
let db: PGlite;
let next = 0;
const price = (sku: string) => `price_Atomic${sku.replaceAll('_', '')}`;
const scalar = async <T = any>(sql: string, values: unknown[] = []): Promise<T> =>
    (await db.query<{ result: T }>(sql, values)).rows[0]?.result;
const count = (table: string) => scalar<number>(`select count(*)::integer as result from public.${table}`);
const wallet = () => scalar('select to_jsonb(w) as result from public.ticket_wallets w where user_id=$1', ['Alice']);
const projection = () => scalar('select to_jsonb(m) as result from public.stripe_memberships m where user_id=$1', ['Alice']);
async function owner(sql: string, values: unknown[] = []) {
    await db.exec('reset role');
    try { return await db.query(sql, values); } finally { await db.exec('set role service_role'); }
}
async function denied(operation: () => Promise<unknown>, pattern: RegExp) {
    await db.exec('savepoint expected_failure');
    try { await expect(operation()).rejects.toThrow(pattern); }
    finally { await db.exec('rollback to savepoint expected_failure'); }
}
async function register(sku = 'hints_13', livemode = false) {
    const amountTotal = SPECS.find(s => s[0] === sku)![1];
    const checkoutId = `cs_${livemode ? 'live' : 'test'}_Atomic${++next}`;
    const priceId = price(sku);
    await owner('insert into public.stripe_commerce_price_bindings values($1,$2,$3)', [sku, priceId, livemode]);
    await db.query(`select public.register_stripe_commerce_checkout_intent($1,$2,$3,$4,$5,'usd',$6,clock_timestamp()+interval '1 hour')`,
        ['Alice', checkoutId, sku, priceId, amountTotal, livemode]);
    return { checkoutId, userId: 'Alice', sku, priceId, amountTotal, currency: 'usd', livemode };
}
async function payment(sku = 'hints_13', livemode = false) {
    return { ...await register(sku, livemode), eventId: `evt_AtomicPay${++next}`, payloadHash: HASH, paymentStatus: 'paid' };
}
async function subscription(sku = 'plus_monthly', livemode = false) {
    const intent = await register(sku, livemode);
    const subscriptionId = `sub_Atomic${++next}`;
    const lease = await scalar('select public.acquire_stripe_reconciliation($1,$2) as result', [subscriptionId, livemode]);
    const periodStart = new Date(Date.now() - DAY).toISOString();
    const periodEnd = new Date(Date.parse(periodStart) + 30 * DAY).toISOString();
    return {
        ...intent, eventId: `evt_AtomicPeriod${++next}`, payloadHash: HASH, eventType: 'invoice.paid', eventCreated: 100,
        observedAt: new Date().toISOString(), subscriptionId, customerId: 'cus_AtomicAlice', status: 'active',
        periodEnd, paidNewPeriod: true, cancelAtPeriodEnd: false, token: lease.token as string,
        latestInvoiceId: 'in_AtomicCurrent', paidPeriod: { invoiceId: 'in_AtomicCurrent', periodStart, periodEnd },
    };
}
type Subscription = Awaited<ReturnType<typeof subscription>>;
function historical(e: Subscription) {
    const periodEnd = e.paidPeriod.periodStart;
    const periodStart = new Date(Date.parse(periodEnd) - 30 * DAY).toISOString();
    return { ...e, eventId: `evt_AtomicHistorical${++next}`, eventCreated: 50, paidNewPeriod: false,
        paidPeriod: { invoiceId: 'in_AtomicHistorical', periodStart, periodEnd } };
}
const fulfillPayment = (e: unknown) => scalar('select public.fulfill_stripe_commerce_one_time($1::jsonb) as result', [JSON.stringify(e)]);
const fulfillSubscription = (e: unknown) => scalar('select public.fulfill_stripe_commerce_subscription($1::jsonb) as result', [JSON.stringify(e)]);

describe('atomic new-SKU commerce RPCs in actual isolated PostgreSQL', () => {
    beforeAll(async () => {
        db = await historicalCommerceDatabase();
        await applyMigrations(db, releaseCommerceMigrations);
        if (!releaseCommerceMigrations.includes(MIGRATION)) await applyMigrations(db, [MIGRATION]);
    }, 60_000);
    afterAll(async () => { await db?.close(); });
    beforeEach(async () => {
        await db.exec(`begin;
            insert into public.profiles(id) values('Alice'),('Bob');
            insert into public.account_terms_consents(user_id,version) values
                ('Alice','2026-10-07.1'),('Bob','2026-10-07.1');
            set role service_role;`);
    });
    afterEach(async () => { await db.exec('rollback; reset role'); });

    it('keeps prices unbound, sale/spending/reversal gates closed and privileges service-only', async () => {
        expect(await count('stripe_commerce_price_bindings')).toBe(0);
        expect(await scalar('select public.stripe_commerce_protocol_version() as result')).toEqual({
            version: 1, newSalesEnabled: false, spendingEnabled: false, reversalsReady: false,
        });
        for (const role of ['anon', 'authenticated']) {
            await db.exec(`reset role; set role ${role}`);
            await denied(() => fulfillPayment({}), /permission denied/);
            await denied(() => fulfillSubscription({}), /permission denied/);
        }
        await db.exec('reset role; set role service_role');
        expect(await scalar(`select bool_and(not prosecdef) as result from pg_proc
            where proname in ('fulfill_stripe_commerce_one_time','fulfill_stripe_commerce_subscription')`)).toBe(true);
    });
    it.each(SPECS.filter(s => s[0].startsWith('hints')))('grants exactly the catalog quantity for %s', async (sku, _amount, quantity) => {
        expect(await fulfillPayment(await payment(sku))).toEqual({ applied: true, duplicate: false, credited: quantity });
        expect(await wallet()).toMatchObject({ test_purchased_hint_tickets: quantity, purchased_hint_tickets: 0,
            hint_tickets: 0, test_subscription_hint_tickets: 0, member_hint_tickets: 0 });
    });
    it('replays the same event and independent checkout completion events without double credit', async () => {
        const e = await payment();
        await fulfillPayment(e);
        expect(await fulfillPayment(e)).toMatchObject({ applied: false, duplicate: true, credited: 0 });
        expect(await fulfillPayment({ ...e, eventId: 'evt_AtomicAlternate' })).toMatchObject({ duplicate: true, credited: 0 });
        expect((await wallet()).test_purchased_hint_tickets).toBe(13);
        expect(await count('stripe_one_time_purchases')).toBe(1);
        expect(await count('stripe_commerce_event_receipts')).toBe(2);
        await denied(() => fulfillPayment({ ...e, payloadHash: 'b'.repeat(64) }), /collision/);
    });
    it('rolls back every one-time grant artifact when wallet arithmetic fails and can retry', async () => {
        const e = await payment();
        await db.query('insert into public.ticket_wallets(user_id,test_purchased_hint_tickets) values($1,$2)', ['Alice', MAX]);
        await denied(() => fulfillPayment(e), /Wallet arithmetic limit/);
        expect(await count('stripe_commerce_event_receipts')).toBe(0);
        expect(await count('stripe_commerce_consumed_checkouts')).toBe(0);
        expect(await count('stripe_one_time_purchases')).toBe(0);
        expect((await wallet()).test_purchased_hint_tickets).toBe(MAX);
        await db.exec("update public.ticket_wallets set test_purchased_hint_tickets=0 where user_id='Alice'");
        expect(await fulfillPayment(e)).toMatchObject({ applied: true, credited: 13 });
    });
    it('checks stored owner, amount, currency, price, SKU, payment state and mode before credit', async () => {
        const e = await payment();
        for (const change of [{ userId: 'Bob' }, { amountTotal: 1 }, { currency: 'eur' }, { priceId: 'price_Wrong' },
            { sku: 'standard_monthly' }, { paymentStatus: 'unpaid' }, { livemode: true }, { checkoutId: 'cs_test_Unknown' }]) {
            await denied(() => fulfillPayment({ ...e, ...change }), /Unbound|Invalid paid|Unverified/);
        }
        expect(await count('stripe_commerce_event_receipts')).toBe(0);
        expect(await count('ticket_wallets')).toBe(0);
    });
    it('fulfills an originally consented paid Checkout and deduplicates after current policy changes', async () => {
        const e = await payment();
        const consent = await scalar('select to_jsonb(i) as result from public.stripe_commerce_checkout_intents i where checkout_id=$1', [e.checkoutId]);
        expect(consent).toMatchObject({ terms_version: '2026-10-07.1', terms_effective_date: '2026-10-07' });
        expect(Date.parse(consent.terms_accepted_at)).toBeLessThanOrEqual(Date.parse(consent.created_at));
        await owner('update public.current_terms_policy set effective_date=null');
        expect(await scalar("select public.has_current_ticket_terms('Alice') as result")).toBe(false);
        expect(await fulfillPayment(e)).toMatchObject({ applied: true, credited: 13 });
        expect(await fulfillPayment(e)).toMatchObject({ duplicate: true, credited: 0 });
        expect(await fulfillPayment({ ...e, eventId: 'evt_PolicyReplay' })).toMatchObject({ duplicate: true, credited: 0 });
        await denied(() => register('hints_1'), /Checkout account unavailable/);
        await denied(() => scalar("select public.claim_daily_login_reward('Alice') as result"), /Reward account unavailable/);
        expect((await wallet()).test_purchased_hint_tickets).toBe(13);
        expect(await count('stripe_commerce_event_receipts')).toBe(2);
        expect(await scalar('select to_jsonb(i) as result from public.stripe_commerce_checkout_intents i where checkout_id=$1', [e.checkoutId])).toEqual(consent);
    });
    it('API roles cannot mutate the stored original Checkout consent', async () => {
        const e = await payment();
        await denied(() => db.query('update public.stripe_commerce_checkout_intents set terms_version=null,terms_accepted_at=null,terms_effective_date=null where checkout_id=$1', [e.checkoutId]), /permission denied/);
        expect(await fulfillPayment(e)).toMatchObject({ credited: 13 });
    });
    it.each(['missing', 'before-publication', 'after-creation'])('refuses incoherent %s snapshots without consuming paid evidence', async kind => {
        const e = await payment();
        if (kind === 'missing') {
            await owner('update public.stripe_commerce_checkout_intents set terms_version=null,terms_accepted_at=null,terms_effective_date=null where checkout_id=$1', [e.checkoutId]);
            await denied(() => fulfillPayment(e), /COMMERCE_RECONCILIATION_REVIEW_REQUIRED/);
        } else {
            await db.exec('reset role');
            await denied(() => db.query(kind === 'before-publication'
                ? "update public.stripe_commerce_checkout_intents set terms_accepted_at=terms_effective_date::timestamp at time zone 'Asia/Tokyo'-interval '1 second' where checkout_id=$1"
                : "update public.stripe_commerce_checkout_intents set terms_accepted_at=created_at+interval '1 second' where checkout_id=$1", [e.checkoutId]), /consent_snapshot_check/);
            await db.exec('set role service_role');
        }
        expect(await count('stripe_commerce_event_receipts')).toBe(0);
        expect(await count('stripe_commerce_consumed_checkouts')).toBe(0);
        expect(await count('stripe_one_time_purchases')).toBe(0);
    });
    it.each(['restriction', 'deletion'])('denies fulfillment while account has an active %s', async kind => {
        const e = await payment();
        if (kind === 'restriction') await db.exec("insert into public.account_restrictions values('Alice',true)");
        else await db.exec("insert into public.account_deletion_jobs values('Alice','queued')");
        await denied(() => fulfillPayment(e), /Commerce account unavailable/);
        expect(await count('stripe_commerce_event_receipts')).toBe(0);
    });
    it.each(SPECS.filter(s => s[0].endsWith('monthly')))('atomically records paid %s with %i cents and %i monthly hints', async (sku, _amount, quantity) => {
        const e = await subscription(sku);
        expect(await fulfillSubscription(e)).toEqual({ applied: true, duplicate: false, credited: quantity,
            snapshot: { applied: true, duplicate: false } });
        expect((await wallet()).test_subscription_hint_tickets).toBe(quantity);
        expect(await count('stripe_memberships')).toBe(1);
        expect(await count('stripe_webhook_receipts')).toBe(1);
        expect(await count('stripe_commerce_paid_evidence')).toBe(1);
        expect(await count('stripe_commerce_paid_periods')).toBe(1);
        expect(await scalar(`select period_end=$1::timestamptz as result from public.stripe_memberships`, [e.periodEnd])).toBe(true);
    });
    it('projects subscription updates without treating active status as paid grant evidence', async () => {
        const e = await subscription();
        const result = await fulfillSubscription({ ...e, eventType: 'customer.subscription.updated', paidNewPeriod: false, paidPeriod: null });
        expect(result).toEqual({ applied: true, duplicate: false, credited: 0, snapshot: { applied: true, duplicate: false } });
        expect(await count('stripe_memberships')).toBe(1);
        expect(await count('stripe_webhook_receipts')).toBe(1);
        expect(await count('stripe_commerce_paid_evidence')).toBe(0);
        expect(await count('stripe_commerce_paid_periods')).toBe(0);
        expect(await count('ticket_wallets')).toBe(0);
        await denied(() => fulfillSubscription({ ...e, eventType: 'customer.subscription.updated' }), /paid monthly evidence/);
    });
    it.each(['standard_monthly', 'plus_monthly'])('never projects %s as legacy test membership before or after invoice payment', async sku => {
        const e = await subscription(sku);
        await fulfillSubscription({ ...e, eventId: e.eventId + 'Observed', eventType: 'customer.subscription.updated',
            paidNewPeriod: false, paidPeriod: null });
        expect(await count('stripe_commerce_paid_periods')).toBe(0);
        const status = () => scalar("select public.stripe_member_status_with_schedule('Alice') as result");
        expect(await status()).toMatchObject({ active: false, periodEnd: null, cancelAtPeriodEnd: false,
            tickets: { ranked: 0, hint: 0 } });
        await fulfillSubscription(e);
        expect(await status()).toMatchObject({ active: false, periodEnd: null, cancelAtPeriodEnd: false,
            tickets: { ranked: 0, hint: 0 } });
        expect((await wallet()).test_subscription_hint_tickets).toBe(sku === 'plus_monthly' ? 10 : 0);
    });
    it('preserves genuine legacy test membership status and its daily ticket grant', async () => {
        await db.query("select public.register_stripe_checkout_intent('Alice','cs_test_LegacyConsent','price_Legacy299',false,clock_timestamp()+interval '1 hour')");
        const lease = await scalar("select public.acquire_stripe_reconciliation('sub_LegacyConsent',false) as result");
        await db.query(`select public.apply_stripe_canonical_membership_snapshot('evt_LegacyConsent',$1,'invoice.paid',100,
            clock_timestamp(),'sub_LegacyConsent','cs_test_LegacyConsent','cus_LegacyConsent','Alice','price_Legacy299',
            'active',clock_timestamp()+interval '29 days',false,true,false,$2)`, [HASH, lease.token]);
        const grant = await scalar("select public.claim_stripe_member_daily_grant('Alice') as result");
        expect(grant).toMatchObject({ active: true, credited: { ranked: 3, hint: 3 } });
        const before = await wallet();
        expect(await scalar("select public.stripe_member_status_with_schedule('Alice') as result")).toMatchObject({
            active: true, cancelAtPeriodEnd: false, tickets: { ranked: 3, hint: 3 },
        });
        expect(await wallet()).toEqual(before);
    });
    it('rolls snapshot, owner link, paid evidence and receipts back if the paid grant fails, then retries cleanly', async () => {
        const e = await subscription();
        await db.query('insert into public.ticket_wallets(user_id,test_subscription_hint_tickets) values($1,$2)', ['Alice', MAX]);
        await denied(() => fulfillSubscription(e), /Wallet arithmetic limit/);
        for (const table of ['stripe_memberships', 'stripe_customer_links', 'stripe_webhook_receipts',
            'stripe_commerce_paid_evidence', 'stripe_commerce_paid_periods', 'stripe_commerce_event_receipts']) {
            expect(await count(table), table).toBe(0);
        }
        await db.exec("update public.ticket_wallets set test_subscription_hint_tickets=0 where user_id='Alice'");
        expect(await fulfillSubscription(e)).toMatchObject({ applied: true, credited: 10 });
    });
    it('grants a reordered older invoice while retaining the newer canonical current period', async () => {
        const e = await subscription();
        await fulfillSubscription(e);
        const old = historical(e);
        expect(await fulfillSubscription(old)).toMatchObject({ applied: true, credited: 10 });
        expect((await wallet()).test_subscription_hint_tickets).toBe(20);
        expect(await scalar('select period_end=$1::timestamptz as result from public.stripe_memberships', [e.periodEnd])).toBe(true);
        expect(await scalar('select period_end=$1::timestamptz as result from public.stripe_commerce_paid_evidence where event_id=$2',
            [old.paidPeriod.periodEnd, old.eventId])).toBe(true);
        expect(await count('stripe_commerce_paid_periods')).toBe(2);
        expect(await fulfillSubscription(old)).toMatchObject({ duplicate: true, credited: 0 });
        expect(await fulfillSubscription({ ...old, eventId: 'evt_AtomicHistoricalAgain' })).toMatchObject({ duplicate: true, credited: 0 });
        expect((await wallet()).test_subscription_hint_tickets).toBe(20);
    });
    it('deduplicates independent events for the same current paid period', async () => {
        const e = await subscription();
        await fulfillSubscription(e);
        expect(await fulfillSubscription({ ...e, eventId: 'evt_AtomicCurrentAgain' })).toMatchObject({ duplicate: true, credited: 0 });
        expect(await count('stripe_commerce_paid_periods')).toBe(1);
        expect(await count('stripe_commerce_paid_evidence')).toBe(2);
        expect(await count('stripe_commerce_event_receipts')).toBe(2);
        expect((await wallet()).test_subscription_hint_tickets).toBe(10);
    });
    it('rejects event reuse with different paid-period evidence without changing its original grant', async () => {
        const e = await subscription();
        await fulfillSubscription(e);
        const old = historical(e);
        await fulfillSubscription(old);
        const periodEnd = old.paidPeriod.periodStart;
        const periodStart = new Date(Date.parse(periodEnd) - 30 * DAY).toISOString();
        await denied(() => fulfillSubscription({ ...old, paidPeriod: { invoiceId: 'in_AtomicOlder', periodStart, periodEnd } }), /Paid evidence collision/);
        expect(await count('stripe_webhook_receipts')).toBe(2);
        expect(await count('stripe_commerce_paid_evidence')).toBe(2);
        expect(await count('stripe_commerce_paid_periods')).toBe(2);
        expect((await wallet()).test_subscription_hint_tickets).toBe(20);
    });
    it('rejects overlapping historical periods without leaving canonical receipts or paid markers', async () => {
        const e = await subscription();
        await fulfillSubscription(e);
        const before = await projection();
        const periodStart = new Date(Date.parse(e.paidPeriod.periodStart) - 15 * DAY).toISOString();
        const overlap = { ...historical(e), paidPeriod: { invoiceId: 'in_AtomicOverlap', periodStart,
            periodEnd: new Date(Date.parse(periodStart) + 30 * DAY).toISOString() } };
        await denied(() => fulfillSubscription(overlap), /Overlapping paid period/);
        expect(await projection()).toEqual(before);
        expect(await count('stripe_webhook_receipts')).toBe(1);
        expect(await count('stripe_commerce_paid_evidence')).toBe(1);
        expect(await count('stripe_commerce_paid_periods')).toBe(1);
    });
    it('does not regress current period to the historical invoice period', async () => {
        const e = await subscription();
        await fulfillSubscription(e);
        const old = historical(e);
        await denied(() => fulfillSubscription({ ...old, periodEnd: old.paidPeriod.periodEnd,
            latestInvoiceId: old.paidPeriod.invoiceId, paidNewPeriod: true }), /Canonical paid period regressed/);
        expect(await count('stripe_webhook_receipts')).toBe(1);
        expect(await scalar('select period_end=$1::timestamptz as result from public.stripe_memberships', [e.periodEnd])).toBe(true);
    });
    it('does not mint a paid period through a current refund barrier', async () => {
        const e = await subscription();
        await fulfillSubscription({ ...e, paidPeriod: null, paidNewPeriod: false });
        await db.query('update public.stripe_memberships set refund_blocked_until=$1 where subscription_id=$2', [e.periodEnd, e.subscriptionId]);
        const before = await projection();
        await denied(() => fulfillSubscription({ ...e, eventId: 'evt_AtomicRefundBlocked' }), /Canonical paid snapshot required/);
        expect(await projection()).toEqual(before);
        expect(await count('stripe_webhook_receipts')).toBe(1);
        expect(await count('stripe_commerce_paid_evidence')).toBe(0);
        expect(await count('stripe_commerce_paid_periods')).toBe(0);
    });
    it('keeps prior reversal risk blocking new historical backfills after a later renewal clears the barrier', async () => {
        const e = await subscription();
        await fulfillSubscription({ ...e, paidPeriod: null, paidNewPeriod: false });
        await db.query(`update public.stripe_memberships set refund_blocked_until=$1 where subscription_id=$2`,
            [e.paidPeriod.periodStart, e.subscriptionId]);
        await db.query(`insert into public.stripe_reversal_receipts(event_id,subscription_id,user_id,payload_hash,reversed_invoice_id,blocked)
            values('evt_AtomicPriorRisk',$1,'Alice',$2,'in_AtomicHistorical',true)`, [e.subscriptionId, HASH]);
        await fulfillSubscription({ ...e, eventId: 'evt_AtomicRenewed' });
        expect((await projection()).refund_blocked_until).toBeNull();
        await denied(() => fulfillSubscription(historical(e)), /Canonical paid snapshot required/);
        expect((await wallet()).test_subscription_hint_tickets).toBe(10);
        expect(await count('stripe_commerce_paid_periods')).toBe(1);
        expect(await count('stripe_commerce_paid_evidence')).toBe(1);
        expect(await count('stripe_webhook_receipts')).toBe(2);
    });
    it('rejects invoice/canonical mismatches, missing latest paid invoice and invalid period lengths atomically', async () => {
        const e = await subscription();
        for (const change of [{ paidNewPeriod: false }, { latestInvoiceId: null }, { latestInvoiceId: 'in_Different' },
            { paidPeriod: { ...e.paidPeriod, periodStart: e.periodEnd } }]) {
            await denied(() => fulfillSubscription({ ...e, ...change }), /paid invoice mismatch|canonical invoice evidence|paid monthly period/);
        }
        expect(await count('stripe_webhook_receipts')).toBe(0);
        expect(await count('stripe_memberships')).toBe(0);
    });
    it('requires stored consent, stored owner and the live reconciliation lease for subscriptions', async () => {
        const e = await subscription();
        await denied(() => fulfillSubscription({ ...e, userId: 'Bob' }), /Unbound paid membership/);
        await denied(() => fulfillSubscription({ ...e, token: '00000000-0000-0000-0000-000000000000' }), /superseded reconciliation/);
        await owner('update public.stripe_commerce_checkout_intents set terms_version=null,terms_accepted_at=null,terms_effective_date=null where checkout_id=$1', [e.checkoutId]);
        await denied(() => fulfillSubscription(e), /COMMERCE_RECONCILIATION_REVIEW_REQUIRED/);
        expect(await count('stripe_webhook_receipts')).toBe(0);
        expect(await count('stripe_memberships')).toBe(0);
    });
    it('fulfills the first paid invoice using original consent when policy changes before its webhook', async () => {
        const e = await subscription();
        await owner('update public.current_terms_policy set effective_date=null');
        expect(await scalar("select public.has_current_ticket_terms('Alice') as result")).toBe(false);
        expect(await fulfillSubscription(e)).toMatchObject({ applied: true, credited: 10 });
        expect(await fulfillSubscription(e)).toMatchObject({ duplicate: true, credited: 0 });
        expect(await fulfillSubscription({ ...e, eventId: 'evt_PolicyInvoiceReplay' })).toMatchObject({ duplicate: true, credited: 0 });
        expect((await wallet()).test_subscription_hint_tickets).toBe(10);
        expect(await count('stripe_commerce_paid_periods')).toBe(1);
    });
    it.each(['restriction', 'deletion'])('preserves the subscription %s guard after original consent is captured', async kind => {
        const e = await subscription();
        if (kind === 'restriction') await db.exec("insert into public.account_restrictions values('Alice',true)");
        else await db.exec("insert into public.account_deletion_jobs values('Alice','queued')");
        await denied(() => fulfillSubscription(e), /Commerce account unavailable/);
        expect(await count('stripe_webhook_receipts')).toBe(0);
        expect(await count('stripe_commerce_paid_evidence')).toBe(0);
        expect(await count('stripe_commerce_paid_periods')).toBe(0);
    });
    it('rejects an expired reconciliation lease before writing canonical or paid evidence', async () => {
        const e = await subscription();
        await db.query('update public.stripe_reconciliation_leases set expires_at=clock_timestamp()-interval \'1 second\' where subscription_id=$1',
            [e.subscriptionId]);
        await denied(() => fulfillSubscription(e), /Expired or superseded reconciliation/);
        expect(await count('stripe_webhook_receipts')).toBe(0);
        expect(await count('stripe_commerce_paid_evidence')).toBe(0);
    });
    it.each(['past_due', 'canceled'])('does not acknowledge or grant a historical paid invoice against canonical %s status', async status => {
        const e = await subscription();
        await fulfillSubscription(e);
        const before = await projection();
        await denied(() => fulfillSubscription({ ...historical(e), status }), /Canonical paid snapshot required/);
        expect(await projection()).toEqual(before);
        expect(await count('stripe_webhook_receipts')).toBe(1);
        expect(await count('stripe_commerce_paid_evidence')).toBe(1);
        expect((await wallet()).test_subscription_hint_tickets).toBe(10);
    });
    it('checks immutable subscription/customer ownership and event hash even for duplicates', async () => {
        const e = await subscription();
        await fulfillSubscription(e);
        await denied(() => fulfillSubscription({ ...e, customerId: 'cus_AtomicDifferent' }), /Subscription ownership changed/);
        await denied(() => fulfillSubscription({ ...e, payloadHash: 'b'.repeat(64) }), /ownership collision/);
        await owner('update public.current_terms_policy set effective_date=null');
        expect(await fulfillSubscription(e)).toMatchObject({ duplicate: true, credited: 0 });
        expect((await wallet()).test_subscription_hint_tickets).toBe(10);
        expect(await count('stripe_commerce_paid_periods')).toBe(1);
    });
    it('separates live and test origin pools and denies test use after live pinning', async () => {
        const e = await payment('hints_1', true);
        await fulfillPayment(e);
        expect(await wallet()).toMatchObject({ purchased_hint_tickets: 1, test_purchased_hint_tickets: 0 });
        await denied(() => fulfillPayment({ ...e, livemode: false }), /Live billing mode is pinned/);
    });
});
