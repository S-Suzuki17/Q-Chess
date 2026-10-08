import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import type { SupabaseClient } from '@supabase/supabase-js';
import { applyMigrations, historicalCommerceDatabase, releaseCommerceMigrations } from './fixtures/commerceDatabaseFixture';
import { commerceEvidenceFixture } from './fixtures/stripeCommerceEvidenceFixture.test';
import { createStripeMembershipStore } from './StripeMembershipStore';
import { createStripeCommerceStore } from './StripeCommerceStore';
import { StripeCommerceEvidence } from './StripeCommerceEvidence';
import { StripeCommerceFulfillment } from './StripeCommerceFulfillment';
import express from 'express';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { createStripeMembershipRouter, createStripeWebhookRouter } from './StripeMembershipRoutes';
import { StripeMembershipApi } from './StripeMembership';
import { COMMERCE_CATALOG } from './CommerceCatalog';
import { RankedAuth } from './RankedAuth';
import { AccountWriteGate } from './AccountDeletion';
import { createStripeCommerceStatusStore } from './StripeCommerceStatus';
import type { StripePortalApi } from './StripePortal';

let db: PGlite;
const servers: http.Server[] = [];
const scalar = async <T = any>(sql: string, args: unknown[] = []) => (await db.query<{ result: T }>(sql, args)).rows[0]?.result;
/** Transport adapter only: every ownership/receipt/grant/lease uses real SQL, no JS ledger. */
function sqlClient(): SupabaseClient {
    return {
        rpc(name: string, args: Record<string, unknown>) {
            if (!['fulfill_stripe_commerce_one_time','fulfill_stripe_commerce_subscription',
                'acquire_stripe_reconciliation','release_stripe_reconciliation','current_account_terms_status',
                'acquire_stripe_commerce_reconciliation','release_stripe_commerce_reconciliation','apply_stripe_commerce_source_risk',
                'register_stripe_commerce_checkout_intent','assert_stripe_billing_mode','stripe_checkout_preflight',
                'stripe_member_status_with_schedule','stripe_commerce_status','stripe_portal_customer_for_user'].includes(name)) throw new Error('Unsupported fixture RPC');
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
async function setup(sku: Parameters<typeof commerceEvidenceFixture>[0], register = true) {
    const f = commerceEvidenceFixture(sku);
    await db.exec('reset role');
    await db.query('insert into public.stripe_commerce_price_bindings values($1,$2,false)', [sku, f.intent.priceId]);
    await db.exec('set role service_role');
    if (register) await db.query(`select public.register_stripe_commerce_checkout_intent('Alice',$1,$2,$3,$4,'usd',false,clock_timestamp()+interval '1 hour')`,
        [f.intent.checkoutId,sku,f.intent.priceId,f.intent.amountTotal]);
    const client = sqlClient();
    const membership = createStripeMembershipStore(client, async () => null, async () => false);
    const store = createStripeCommerceStore(client, membership);
    const handler = new StripeCommerceFulfillment(new StripeCommerceEvidence(f.config, f.request), store, f.secret);
    const deliver = (patch?: Record<string, unknown>) => { const s = f.signed(undefined, patch); return handler.fulfillWebhook(s.body,s.headers); };
    const auth = new RankedAuth(async () => true);
    const token = (await auth.issueLegacySession('Alice', 'fixture-password'))!.token;
    const request = async (input: string | URL | Request, init?: RequestInit) => {
        if (new URL(String(input)).pathname === '/v1/checkout/sessions' && init?.method === 'POST') {
            return new Response(JSON.stringify({ ...f.checkout, status: 'open',
                expires_at: Math.floor(Date.now() / 1000) + 3600,
                url: `https://checkout.stripe.com/c/pay/${f.intent.checkoutId}` }), { status: 200 });
        }
        return f.request(input, init);
    };
    const api = new StripeMembershipApi({ mode: 'test', secretKey: f.config.secretKey, webhookSecret: f.secret,
        priceId: 'price_FIXTURELEGACY', successUrl: 'https://q-gambit.com/', cancelUrl: 'https://q-gambit.com/',
        automaticTaxEnabled: true, taxRegistrationConfirmed: true }, request,
        { livemode: false, products: { [sku]: { ...COMMERCE_CATALOG[sku], priceId: f.intent.priceId } } });
    const portal = { livemode: false, createSession: vi.fn(async () => 'https://billing.stripe.com/p/session/FIXTUREPORTAL') };
    const app = express();
    app.use(createStripeWebhookRouter(api, membership, f.secret, () => true, handler));
    app.use(createStripeMembershipRouter(auth, api, membership, new AccountWriteGate(), () => true,
        portal as unknown as StripePortalApi, () => true, () => true, store, createStripeCommerceStatusStore(client)));
    const server = http.createServer(app); servers.push(server);
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const deliverHttp = async (patch?: Record<string, unknown>) => {
        const s = f.signed(undefined, patch);
        return fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/membership/stripe/webhook`, {
            method: 'POST', headers: { 'content-type': 'application/json', ...s.headers }, body: s.body.toString(),
        });
    };
    const route = async (path: string, body?: unknown) => fetch(
        `http://127.0.0.1:${(server.address() as AddressInfo).port}/membership/stripe/${path}`, {
            method: body === undefined ? 'GET' : 'POST',
            headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
            ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
    return { ...f, deliver, deliverHttp, route, portal };
}
describe('signed synthetic webhook through provider reader and adapter into actual PostgreSQL', () => {
    beforeAll(async () => {
        db = await historicalCommerceDatabase();
        await applyMigrations(db, [...releaseCommerceMigrations, '20261008054904_match_hint_tickets_and_free_practice.sql']);
    }, 60_000);
    afterAll(async () => { await db?.close(); });
    beforeEach(async () => { await db.exec(`begin; insert into public.profiles(id) values('Alice');
        insert into public.account_terms_consents(user_id,version) values('Alice','2026-10-08.1'); set role service_role;`); });
    afterEach(async () => {
        for (const server of servers.splice(0)) { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
        await db.exec('rollback; reset role');
    });
    it.each(['hints_13','plus_monthly'] as const)('mounted %s checkout registers, fulfills and reports separate test stock', async sku => {
        const f = await setup(sku, false);
        const checkout = await f.route('checkout', { sku }); expect(checkout.status).toBe(200);
        expect(await checkout.json()).toEqual({ url: `https://checkout.stripe.com/c/pay/${f.intent.checkoutId}` });
        expect(await scalar('select count(*)::integer as result from public.stripe_commerce_checkout_intents')).toBe(1);
        expect((await f.deliverHttp()).status).toBe(200);
        const status = await f.route('status'); expect(status.status).toBe(200);
        expect(await status.json()).toMatchObject({ active: false, tickets: { ranked: 0, hint: 0 }, commerce: {
            livemode: false, active: sku === 'plus_monthly', unlimitedRanked: false, adFree: false,
            balances: { purchased: sku === 'hints_13' ? 13 : 0, subscription: sku === 'plus_monthly' ? 10 : 0 },
        } });
        if (sku === 'plus_monthly') {
            // Ordinary billing cancellation remains reachable without a new ticket consent.
            await db.exec('reset role; update public.current_terms_policy set effective_date=null; set role service_role');
            expect((await f.route('portal', {})).status).toBe(200);
            expect(f.portal.createSession).toHaveBeenCalledExactlyOnceWith(f.subscription.customer);
        }
    });
    it.each(['hints_13','plus_monthly'] as const)('mounted paid %s delivery and replay survive later current-policy changes', async sku => {
        const f = await setup(sku);
        await db.exec("reset role; update public.current_terms_policy set effective_date=null; set role service_role");
        expect((await f.deliverHttp()).status).toBe(200);
        expect((await f.deliverHttp()).status).toBe(200);
        expect(await scalar(`select ${sku === 'hints_13' ? 'test_purchased_hint_tickets' : 'test_subscription_hint_tickets'} as result
            from public.ticket_wallets where user_id='Alice'`)).toBe(sku === 'hints_13' ? 13 : 10);
        expect(await scalar('select count(*)::integer as result from public.stripe_commerce_event_receipts')).toBe(1);
    });
    it('mounted SQL rollback remains retryable and does not ACK a paid event', async () => {
        const f = await setup('plus_monthly');
        await db.exec("insert into public.ticket_wallets(user_id,test_subscription_hint_tickets) values('Alice',9007199254740991)");
        const response = await f.deliverHttp(); expect(response.status).toBe(503);
        expect(response.headers.get('retry-after')).toBe('60');
        expect(await scalar('select count(*)::integer as result from public.stripe_webhook_receipts')).toBe(0);
        expect(await scalar('select count(*)::integer as result from public.stripe_memberships')).toBe(0);
        await db.exec("update public.ticket_wallets set test_subscription_hint_tickets=0 where user_id='Alice'");
        expect((await f.deliverHttp()).status).toBe(200);
    });
    it('mounted ambiguous original consent returns review-required and records no receipt or credit', async () => {
        const f = await setup('hints_13');
        await db.exec(`reset role; update public.stripe_commerce_checkout_intents
            set terms_version=null,terms_accepted_at=null,terms_effective_date=null; set role service_role`);
        const response = await f.deliverHttp(); expect(response.status).toBe(503);
        expect(await response.json()).toEqual({ code: 'COMMERCE_RECONCILIATION_REVIEW_REQUIRED' });
        expect(response.headers.get('retry-after')).toBe('60');
        expect(await scalar('select count(*)::integer as result from public.stripe_commerce_event_receipts')).toBe(0);
        expect(await scalar('select count(*)::integer as result from public.stripe_one_time_purchases')).toBe(0);
    });
    it('mounted erased-account replay honors the persisted retirement fence without provider reads or new receipts', async () => {
        const f = await setup('plus_monthly');
        await db.exec('reset role');
        await db.query('insert into public.stripe_retired_subscriptions(subscription_id,livemode) values($1,false)', [f.subscription.id]);
        await db.exec("delete from public.profiles where id='Alice'; set role service_role");
        expect(await scalar('select count(*)::integer as result from public.stripe_commerce_checkout_intents')).toBe(0);
        f.request.mockRejectedValue(new Error('provider unavailable after account erasure'));
        expect((await f.deliverHttp()).status).toBe(200);
        expect((await f.deliverHttp({ id: 'evt_RETIREDREPLAY' })).status).toBe(200);
        expect(f.request).not.toHaveBeenCalled();
        for (const table of ['stripe_webhook_receipts','stripe_commerce_event_receipts','stripe_commerce_paid_evidence',
            'stripe_commerce_paid_periods','stripe_memberships','ticket_wallets']) {
            expect(await scalar(`select count(*)::integer as result from public.${table}`)).toBe(0);
        }
        expect(await scalar('select count(*)::integer as result from public.stripe_retired_subscriptions')).toBe(1);
    });
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
