import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import type { SupabaseClient } from '@supabase/supabase-js';
import { applyMigrations, historicalCommerceDatabase, releaseCommerceMigrations } from './fixtures/commerceDatabaseFixture';
import { commerceEvidenceFixture } from './fixtures/stripeCommerceEvidenceFixture.test';
import { createStripeMembershipStore } from './StripeMembershipStore';
import { createStripeCommerceStore } from './StripeCommerceStore';
import { StripeCommerceEvidence } from './StripeCommerceEvidence';
import { StripeCommerceFulfillment } from './StripeCommerceFulfillment';

let db: PGlite;
const scalar = async <T = any>(sql: string, args: unknown[] = []) => (await db.query<{ result: T }>(sql, args)).rows[0]?.result;
/** Transport adapter only: every ownership/receipt/grant/lease uses real SQL, no JS ledger. */
function sqlClient(): SupabaseClient {
    return {
        rpc(name: string, args: Record<string, unknown>) {
            if (!['fulfill_stripe_commerce_one_time','fulfill_stripe_commerce_subscription',
                'acquire_stripe_reconciliation','release_stripe_reconciliation','current_account_terms_status'].includes(name)) throw new Error('Unsupported fixture RPC');
            return { async abortSignal() {
                const keys = Object.keys(args);
                if (!keys.every(key => /^p_[a-z_]+$/.test(key))) throw new Error('Invalid fixture parameter');
                await db.exec('savepoint postgrest_call');
                try {
                    const data = await scalar(`select public.${name}(${keys.map((key, i) => `${key}=>$${i+1}`).join(',')}) as result`,
                        keys.map(key => key === 'p_evidence' ? JSON.stringify(args[key]) : args[key]));
                    await db.exec('release savepoint postgrest_call');
                    return { data, error: null };
                } catch (error) { await db.exec('rollback to savepoint postgrest_call'); return { data: null, error }; }
            } };
        },
        from(table: string) {
            if (!['stripe_commerce_checkout_intents','stripe_commerce_price_bindings'].includes(table)) throw new Error('Unsupported fixture table');
            const filters: [string, unknown][] = [];
            const query = { select() { return query; }, abortSignal() { return query; },
                eq(column: string, value: unknown) { filters.push([column, value]); return query; },
                async maybeSingle() {
                    if (!filters.every(([key]) => ['checkout_id','sku','livemode'].includes(key))) throw new Error('Invalid fixture filter');
                    const rows = (await db.query(`select * from public.${table} where ${filters.map(([key], i) => `${key}=$${i+1}`).join(' and ')}`,
                        filters.map(([,value]) => value))).rows;
                    return { data: rows.length === 1 ? rows[0] : null, error: rows.length > 1 ? new Error('Not unique') : null };
                } };
            return query;
        },
    } as unknown as SupabaseClient;
}
async function setup(sku: Parameters<typeof commerceEvidenceFixture>[0]) {
    const f = commerceEvidenceFixture(sku);
    await db.exec('reset role');
    await db.query('insert into public.stripe_commerce_price_bindings values($1,$2,false)', [sku, f.intent.priceId]);
    await db.exec('set role service_role');
    await db.query(`select public.register_stripe_commerce_checkout_intent('Alice',$1,$2,$3,$4,'usd',false,clock_timestamp()+interval '1 hour')`,
        [f.intent.checkoutId,sku,f.intent.priceId,f.intent.amountTotal]);
    const client = sqlClient();
    const membership = createStripeMembershipStore(client, async () => null, async () => false);
    const store = createStripeCommerceStore(client, membership);
    const handler = new StripeCommerceFulfillment(new StripeCommerceEvidence(f.config, f.request), store, f.secret);
    const deliver = (patch?: Record<string, unknown>) => { const s = f.signed(undefined, patch); return handler.fulfillWebhook(s.body,s.headers); };
    return { ...f, deliver };
}
describe('signed synthetic webhook through provider reader and adapter into actual PostgreSQL', () => {
    beforeAll(async () => { db = await historicalCommerceDatabase(); await applyMigrations(db, releaseCommerceMigrations); }, 60_000);
    afterAll(async () => { await db?.close(); });
    beforeEach(async () => { await db.exec(`begin; insert into public.profiles(id) values('Alice');
        insert into public.account_terms_consents(user_id,version) values('Alice','2026-10-03.1'); set role service_role;`); });
    afterEach(async () => { await db.exec('rollback; reset role'); });
    it('grants one pack exactly once across same-event replay and distinct completion delivery', async () => {
        const f = await setup('hints_13');
        expect(await f.deliver()).toMatchObject({ credited: 13, applied: true });
        expect(await f.deliver()).toMatchObject({ credited: 0, duplicate: true });
        expect(await f.deliver({ id: 'evt_FIXTUREANOTHER', type: 'checkout.session.async_payment_succeeded' })).toMatchObject({ credited: 0, duplicate: true });
        expect(await scalar("select test_purchased_hint_tickets as result from public.ticket_wallets where user_id='Alice'")).toBe(13);
        expect(await scalar('select count(*)::integer as result from public.stripe_one_time_purchases')).toBe(1);
    });
    it('grants Plus once per paid period, never from replay, preserving purchased stock', async () => {
        const f = await setup('plus_monthly');
        await db.exec("insert into public.ticket_wallets(user_id,test_purchased_hint_tickets) values('Alice',27)");
        expect(await f.deliver()).toMatchObject({ credited: 10, applied: true });
        expect(await f.deliver()).toMatchObject({ credited: 0, duplicate: true });
        expect(await f.deliver({ id: 'evt_FIXTUREANOTHER' })).toMatchObject({ credited: 0, duplicate: true });
        expect(await scalar("select jsonb_build_object('purchased',test_purchased_hint_tickets,'subscription',test_subscription_hint_tickets) as result from public.ticket_wallets where user_id='Alice'"))
            .toEqual({ purchased: 27, subscription: 10 });
        expect(await scalar('select count(*)::integer as result from public.stripe_commerce_paid_periods')).toBe(1);
    });
    it('rolls all subscription evidence back on SQL grant failure and accepts the later retry', async () => {
        const f = await setup('plus_monthly');
        await db.exec("insert into public.ticket_wallets(user_id,test_subscription_hint_tickets) values('Alice',9007199254740991)");
        await expect(f.deliver()).rejects.toThrow('COMMERCE_STORE_UNAVAILABLE');
        for (const table of ['stripe_webhook_receipts','stripe_commerce_paid_evidence','stripe_commerce_paid_periods','stripe_memberships']) {
            expect(await scalar(`select count(*)::integer as result from public.${table}`)).toBe(0);
        }
        await db.exec("update public.ticket_wallets set test_subscription_hint_tickets=0 where user_id='Alice'");
        expect(await f.deliver()).toMatchObject({ applied: true, credited: 10 });
    });
    it('refund discovered during replay never erases the separately purchased pool', async () => {
        const f = await setup('plus_monthly');
        await db.exec("insert into public.ticket_wallets(user_id,test_purchased_hint_tickets) values('Alice',44)");
        await f.deliver(); f.charge.amount_refunded = 1;
        await expect(f.deliver({ id: 'evt_FIXTUREAFTERREFUND' })).rejects.toThrow('COMMERCE_EVIDENCE_UNAVAILABLE');
        expect(await scalar("select test_purchased_hint_tickets as result from public.ticket_wallets where user_id='Alice'")).toBe(44);
        expect(await scalar('select count(*)::integer as result from public.stripe_webhook_receipts')).toBe(1);
    });
});
