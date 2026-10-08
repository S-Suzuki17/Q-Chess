import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash, randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    HASH, MAX, LEGACY_PRICE, specs, connect, scalar, wallet, claim, contended,
    account, bind, register, purchase, member, snapshot, paidPeriod,
    historicalPeriods, reverse, unique, cpuMatch, admit, voidMatch, settle,
} from './commerce-postgres-support.mjs';
import { setupBaseline, applyPending, baselineEvidence } from './fixtures/commerce-postgres-baseline.mjs';

// Native PostgreSQL only. Missing services, version mismatches, unsupported
// schemas and missing public baseline files FAIL; there are no skipped tests.
test('native PostgreSQL public-baseline upgrade and concurrent commerce', { timeout: 180_000 }, async t => {
    const clients = [];
    const open = async role => { const c = await connect(role); clients.push(c); return c; };
    const admin = await open();
    let a, b, upgrade, legacy, nativeVersion;
    const results = [];
    let failures = 0;
    const check = async (name, fn) => t.test(name, { timeout: 20_000 }, async () => {
        try { await fn(); results.push(name); }
        catch (error) { failures++; throw error; }
    });
    t.after(async () => { await Promise.allSettled(clients.map(c => c.end())); });

    await check('public historical baseline upgrades all pending raw files and preserves balances', async () => {
        const identity = (await admin.query(`select current_database() as database,current_user as owner,
            current_setting('server_version_num')::integer as version`)).rows[0];
        assert.equal(identity.database, 'commerce_upgrade');
        assert.equal(identity.owner, 'postgres');
        assert.equal(Math.floor(identity.version / 10000), baselineEvidence.postgresMajor);
        nativeVersion = identity.version;
        assert.equal(await scalar(admin, "select count(*)::integer as result from pg_class where relnamespace='public'::regnamespace and relkind in ('r','p')"), 0,
            'Refusing to write a database containing pre-existing public tables');
        await setupBaseline(admin);
        a = await open('service_role'); b = await open('service_role');
        assert.notEqual(a.fixturePid, b.fixturePid);
        upgrade = await account(admin);
        await admin.query(`update public.ticket_wallets set ranked_tickets=20,hint_tickets=20,
            member_ranked_tickets=60,member_hint_tickets=60,test_member_ranked_tickets=60,test_member_hint_tickets=60,
            member_ticket_subscription_id='sub_EXISTINGLIVE',test_member_ticket_subscription_id='sub_EXISTINGTEST' where user_id=$1`, [upgrade]);
        // A legacy live Checkout is genuinely registered BEFORE the upgrade.
        const user = await account(admin);
        const checkout = 'cs_live_EXISTING299';
        await a.query('select public.register_stripe_live_checkout_intent($1,$2,$3,clock_timestamp()+interval \'1 hour\')', [user, checkout, LEGACY_PRICE]);
        legacy = { user, checkout, subscription: 'sub_EXISTING299', price: LEGACY_PRICE, live: true,
            start: new Date(Date.now() - 86400000).toISOString(), end: new Date(Date.now() + 29 * 86400000).toISOString() };
        // The database's live-mode pin is exercised in the legacy test. Remove
        // only this synthetic pin to allow independent test-mode scenarios.
        await admin.query('delete from public.stripe_billing_mode_pin');
        const protectedBefore = await protectedDefinitions(admin);
        await applyPending(admin);
        assert.deepEqual(await protectedDefinitions(admin), protectedBefore,
            'upgrade changed ranked admission/consumption or receipt-pool constraints');
        assert.deepEqual(await wallet(a, upgrade), { ...(await wallet(a, upgrade)),
            ranked_tickets: 20, hint_tickets: 20, member_ranked_tickets: 60, member_hint_tickets: 60,
            test_member_ranked_tickets: 60, test_member_hint_tickets: 60,
            member_ticket_subscription_id: 'sub_EXISTINGLIVE', test_member_ticket_subscription_id: 'sub_EXISTINGTEST',
            purchased_hint_tickets: 0, test_purchased_hint_tickets: 0, subscription_hint_tickets: 0, test_subscription_hint_tickets: 0 });
    });

    // A failed setup must not masquerade as many ordinary assertion failures.
    assert.ok(a && b && upgrade, 'baseline setup did not finish');
    await check('2026-10-07 terms require explicit re-consent while prior versions remain immutable', async () => {
        for (const user of [upgrade, legacy.user]) {
            const old = (await admin.query('select * from public.account_terms_consents where user_id=$1 order by version', [user])).rows;
            assert.ok(old.some(row => row.version === '2026-10-03.1'));
            const status = await scalar(a, 'select public.current_account_terms_status($1) as result', [user]);
            assert.equal(status.currentVersion, '2026-10-07.1'); assert.equal(status.effectiveDate, '2026-10-07');
            assert.equal(status.effective, true); assert.equal(status.consent, null);
            await assert.rejects(a.query("select public.accept_current_account_terms($1,'2026-10-03.1')", [user]), /Current terms not effective/);
            await assert.rejects(claim(a, user), /Reward account unavailable/);
            const accepted = await scalar(a, "select public.accept_current_account_terms($1,'2026-10-07.1') as result", [user]);
            assert.equal(accepted.consent.version, '2026-10-07.1');
            assert.deepEqual(await scalar(a, "select public.accept_current_account_terms($1,'2026-10-07.1') as result", [user]), accepted);
            assert.deepEqual((await admin.query("select * from public.account_terms_consents where user_id=$1 and version<>'2026-10-07.1' order by version", [user])).rows, old);
        }
    });
    await check('new source gates remain closed and price bindings start empty', async () => {
        assert.deepEqual(await scalar(a, 'select public.stripe_commerce_protocol_version() as result'),
            { version: 1, newSalesEnabled: false, spendingEnabled: false, reversalsReady: false });
        assert.equal(await scalar(a, 'select count(*)::integer as result from public.stripe_commerce_price_bindings'), 0);
        await assert.rejects(register(a, upgrade), /Unverified commerce SKU binding/);
        await bind(admin);
    });

    const atomicOneTime = (client, intent, eventId) => scalar(client,
        'select public.fulfill_stripe_commerce_one_time($1::jsonb) as result', [JSON.stringify({
            eventId, payloadHash: HASH, checkoutId: intent.checkout, userId: intent.user, sku: intent.sku,
            priceId: intent.price, amountTotal: intent.amount, currency: 'usd', livemode: intent.live, paymentStatus: 'paid',
        })]);
    const atomicSubscription = (client, m, eventId, changes = {}) => scalar(client,
        'select public.fulfill_stripe_commerce_subscription($1::jsonb) as result', [JSON.stringify({
            eventId, payloadHash: HASH, eventType: 'invoice.paid', eventCreated: 100, observedAt: new Date().toISOString(),
            checkoutId: m.checkout, userId: m.user, sku: m.sku, priceId: m.price, amountTotal: m.amount,
            currency: 'usd', livemode: m.live, subscriptionId: m.subscription, customerId: `cus_${m.user}`,
            status: 'active', periodEnd: m.end, paidNewPeriod: true, cancelAtPeriodEnd: false, token: m.token,
            latestInvoiceId: 'in_ATOMICCURRENT', paidPeriod: { invoiceId: 'in_ATOMICCURRENT', periodStart: m.start, periodEnd: m.end },
            ...changes,
        })]);
    await check('paid pack fulfillment preserves original consent after policy changes while new checkout and spend fail closed', async () => {
        const user = await account(admin), intent = await register(a, user), event = unique('evt_CONSENT');
        const before = await scalar(a, 'select to_jsonb(i) as result from public.stripe_commerce_checkout_intents i where checkout_id=$1', [intent.checkout]);
        assert.equal(before.terms_version, '2026-10-07.1');
        const policyDate = await scalar(admin, 'select effective_date::text as result from public.current_terms_policy');
        try {
            await admin.query('update public.current_terms_policy set effective_date=null');
            assert.equal(await scalar(a, 'select public.has_current_ticket_terms($1) as result', [user]), false);
            assert.equal((await atomicOneTime(a, intent, event)).credited, 13);
            assert.equal((await atomicOneTime(a, intent, event)).credited, 0);
            assert.equal((await atomicOneTime(a, intent, unique('evt_CONSENT'))).duplicate, true);
            await assert.rejects(register(a, user), /Checkout account unavailable/);
            await assert.rejects(claim(a, user), /Reward account unavailable/);
            assert.equal((await wallet(a, user)).test_purchased_hint_tickets, 13);
            assert.deepEqual(await scalar(a, 'select to_jsonb(i) as result from public.stripe_commerce_checkout_intents i where checkout_id=$1', [intent.checkout]), before);
        } finally { await admin.query('update public.current_terms_policy set effective_date=$1::date', [policyDate]); }
    });
    await check('first paid monthly webhook and duplicate invoice deliveries use immutable Checkout consent after policy changes', async () => {
        const user = await account(admin), m = await member(a, user), event = unique('evt_CONSENT');
        const policyDate = await scalar(admin, 'select effective_date::text as result from public.current_terms_policy');
        try {
            await admin.query('update public.current_terms_policy set effective_date=null');
            assert.equal(await scalar(a, 'select public.has_current_ticket_terms($1) as result', [user]), false);
            assert.equal((await atomicSubscription(a, m, event)).credited, 10);
            assert.equal((await atomicSubscription(a, m, event)).credited, 0);
            assert.equal((await atomicSubscription(a, m, unique('evt_CONSENT'))).duplicate, true);
            assert.equal((await wallet(a, user)).test_subscription_hint_tickets, 10);
            assert.equal(await scalar(a, 'select count(*)::integer as result from public.stripe_commerce_paid_periods where subscription_id=$1', [m.subscription]), 1);
        } finally { await admin.query('update public.current_terms_policy set effective_date=$1::date', [policyDate]); }
    });
    await check('missing consent snapshots surface explicit review without writing any paid receipt or grant', async () => {
        for (const subscription of [false, true]) {
            const user = await account(admin), intent = subscription ? await member(a, user) : await register(a, user);
            const event = unique('evt_CONSENT');
            await assert.rejects(a.query('update public.stripe_commerce_checkout_intents set terms_version=null where checkout_id=$1', [intent.checkout]), { code: '42501' });
            await assert.rejects(admin.query("update public.stripe_commerce_checkout_intents set terms_accepted_at=created_at+interval '1 second' where checkout_id=$1", [intent.checkout]), { code: '23514' });
            await assert.rejects(admin.query("update public.stripe_commerce_checkout_intents set terms_accepted_at=(terms_effective_date::timestamp at time zone 'Asia/Tokyo')-interval '1 second' where checkout_id=$1", [intent.checkout]), { code: '23514' });
            await admin.query('update public.stripe_commerce_checkout_intents set terms_version=null,terms_accepted_at=null,terms_effective_date=null where checkout_id=$1', [intent.checkout]);
            const before = await wallet(a, user);
            await assert.rejects(subscription ? atomicSubscription(a, intent, event) : atomicOneTime(a, intent, event), /COMMERCE_RECONCILIATION_REVIEW_REQUIRED/);
            assert.deepEqual(await wallet(a, user), before);
            for (const table of ['stripe_webhook_receipts', 'stripe_commerce_event_receipts', 'stripe_commerce_paid_evidence']) {
                assert.equal(await scalar(a, `select count(*)::integer as result from public.${table} where event_id=$1`, [event]), 0);
            }
            assert.equal(await scalar(a, 'select count(*)::integer as result from public.stripe_commerce_consumed_checkouts where checkout_id=$1', [intent.checkout]), 0);
            assert.equal(await scalar(a, 'select count(*)::integer as result from public.stripe_one_time_purchases where checkout_id=$1', [intent.checkout]), 0);
            if (subscription) assert.equal(await scalar(a, 'select count(*)::integer as result from public.stripe_commerce_paid_periods where subscription_id=$1', [intent.subscription]), 0);
        }
    });
    await check('captured consent never bypasses active account restrictions or deletion for either paid RPC', async () => {
        for (const subscription of [false, true]) for (const deleting of [false, true]) {
            const user = await account(admin), intent = subscription ? await member(a, user) : await register(a, user);
            const event = unique('evt_CONSENT');
            if (deleting) await admin.query('insert into public.account_deletion_jobs(ticket_hash,user_id) values($1,$2)', [createHash('sha256').update(user).digest('hex'), user]);
            else await admin.query('insert into public.account_restrictions(user_id,blocked) values($1,true)', [user]);
            await assert.rejects(subscription ? atomicSubscription(a, intent, event) : atomicOneTime(a, intent, event), /Commerce account unavailable/);
            assert.equal(await scalar(a, 'select count(*)::integer as result from public.stripe_commerce_event_receipts where event_id=$1', [event]), 0);
            assert.equal(await scalar(a, 'select count(*)::integer as result from public.stripe_webhook_receipts where event_id=$1', [event]), 0);
        }
    });

    await check('new Standard and Plus test projections never acquire legacy status before or after a paid invoice', async () => {
        for (const sku of ['standard_monthly', 'plus_monthly']) {
            const user = await account(admin), m = await member(a, user, sku);
            await atomicSubscription(a, m, unique('evt_PROJECTION'), { eventType: 'customer.subscription.updated', paidNewPeriod: false, paidPeriod: null });
            const status = () => scalar(a, 'select public.stripe_member_status_with_schedule($1) as result', [user]);
            assert.equal((await status()).active, false);
            assert.deepEqual((await status()).tickets, { ranked: 0, hint: 0 });
            assert.equal(await scalar(a, 'select count(*)::integer as result from public.stripe_commerce_paid_periods where subscription_id=$1', [m.subscription]), 0);
            await atomicSubscription(a, m, unique('evt_PROJECTION'));
            assert.equal((await status()).active, false);
            assert.deepEqual((await status()).tickets, { ranked: 0, hint: 0 });
            assert.equal((await wallet(a, user)).test_subscription_hint_tickets, sku === 'plus_monthly' ? 10 : 0);
        }
    });
    await check('genuine legacy test membership retains status and daily ticket balances after commerce projection exclusion', async () => {
        const user = await account(admin), checkout = unique('cs_test_LEGACY'), subscription = unique('sub_LEGACY');
        await a.query("select public.register_stripe_checkout_intent($1,$2,'price_Legacy299',false,clock_timestamp()+interval '1 hour')", [user, checkout]);
        const lease = await scalar(a, 'select public.acquire_stripe_reconciliation($1,false) as result', [subscription]);
        const m = { user, checkout, subscription, price: 'price_Legacy299', live: false, token: lease.token,
            end: new Date(Date.now()+29*86400000).toISOString() };
        await snapshot(a, m);
        const grant = await scalar(a, 'select public.claim_stripe_member_daily_grant($1) as result', [user]);
        assert.deepEqual(grant.credited, { ranked: 3, hint: 3 });
        const before = await wallet(a, user);
        const status = await scalar(a, 'select public.stripe_member_status_with_schedule($1) as result', [user]);
        assert.equal(status.active, true); assert.deepEqual(status.tickets, { ranked: 3, hint: 3 });
        assert.deepEqual(await wallet(a, user), before);
    });

    await check('stale transaction policy cannot register a new Checkout after current publication changes', async () => {
        const user = await account(admin);
        const policyDate = await scalar(admin, 'select effective_date::text as result from public.current_terms_policy');
        for (const isolation of ['repeatable read', 'serializable']) {
            await a.query(`begin isolation level ${isolation}`);
            try {
                assert.equal(await scalar(a, 'select public.has_current_ticket_terms($1) as result', [user]), true);
                await admin.query('update public.current_terms_policy set effective_date=null');
                assert.equal(await scalar(a, 'select public.has_current_ticket_terms($1) as result', [user]), true,
                    'test must actually retain a stale publication snapshot');
                await assert.rejects(register(a, user), { code: '40001' });
            } finally { await a.query('rollback'); }
            try {
                await assert.rejects(register(a, user), /Checkout account unavailable/);
                assert.equal(await scalar(a, 'select count(*)::integer as result from public.stripe_commerce_checkout_intents where user_id=$1', [user]), 0);
            } finally { await admin.query('update public.current_terms_policy set effective_date=$1::date', [policyDate]); }
        }
    });
    await check('both paid RPCs reject stale transaction snapshots after a concurrent account restriction', async () => {
        for (const subscription of [false, true]) for (const isolation of ['repeatable read', 'serializable']) {
            const user = await account(admin), intent = subscription ? await member(a, user) : await register(a, user);
            const event = unique('evt_STALE');
            await a.query(`begin isolation level ${isolation}`);
            try {
                assert.equal(await scalar(a, 'select count(*)::integer as result from public.account_restrictions where user_id=$1 and blocked', [user]), 0);
                await admin.query('insert into public.account_restrictions(user_id,blocked) values($1,true)', [user]);
                assert.equal(await scalar(a, 'select count(*)::integer as result from public.account_restrictions where user_id=$1 and blocked', [user]), 0,
                    'test must actually retain a stale restriction snapshot');
                await assert.rejects(subscription ? atomicSubscription(a, intent, event) : atomicOneTime(a, intent, event), { code: '40001' });
            } finally { await a.query('rollback'); }
            await assert.rejects(subscription ? atomicSubscription(a, intent, event) : atomicOneTime(a, intent, event), /Commerce account unavailable/);
            assert.equal(await scalar(a, 'select count(*)::integer as result from public.stripe_commerce_event_receipts where event_id=$1', [event]), 0);
            assert.equal(await scalar(a, 'select count(*)::integer as result from public.stripe_webhook_receipts where event_id=$1', [event]), 0);
            assert.equal((await wallet(a, user)).test_purchased_hint_tickets, 0);
            assert.equal((await wallet(a, user)).test_subscription_hint_tickets, 0);
        }
    });

    await check('atomic pack RPC deduplicates real concurrent deliveries on independent backends', async () => {
        const user = await account(admin); const intent = await register(a, user);
        const result = await contended(admin, a, b,
            client => atomicOneTime(client, intent, unique('evt_ATOMIC')),
            client => atomicOneTime(client, intent, unique('evt_ATOMIC')));
        assert.equal(result.filter(r => r.applied).length, 1);
        assert.equal(result.filter(r => r.duplicate).length, 1);
        assert.equal((await wallet(a, user)).test_purchased_hint_tickets, 13);
        assert.equal(await scalar(a, 'select count(*)::integer as result from public.stripe_one_time_purchases where checkout_id=$1', [intent.checkout]), 1);
    });
    await check('atomic paid-period RPC deduplicates concurrent events and keeps purchased stock separate', async () => {
        const user = await account(admin); const m = await member(a, user);
        await admin.query('update public.ticket_wallets set test_purchased_hint_tickets=77 where user_id=$1', [user]);
        const result = await contended(admin, a, b,
            client => atomicSubscription(client, m, unique('evt_ATOMIC')),
            client => atomicSubscription(client, m, unique('evt_ATOMIC')));
        assert.equal(result.filter(r => r.applied).length, 1);
        assert.equal(result.filter(r => r.duplicate).length, 1);
        const w = await wallet(a, user);
        assert.equal(w.test_subscription_hint_tickets, 10); assert.equal(w.test_purchased_hint_tickets, 77);
    });
    await check('atomic snapshot and evidence roll back on failed grant then retry successfully', async () => {
        const user = await account(admin); const m = await member(a, user); const event = unique('evt_ATOMIC');
        await admin.query('update public.ticket_wallets set test_subscription_hint_tickets=$2 where user_id=$1', [user, MAX]);
        await assert.rejects(atomicSubscription(a, m, event), /Wallet arithmetic limit/);
        for (const table of ['stripe_webhook_receipts', 'stripe_commerce_paid_evidence', 'stripe_commerce_event_receipts']) {
            assert.equal(await scalar(a, `select count(*)::integer as result from public.${table} where event_id=$1`, [event]), 0);
        }
        assert.equal(await scalar(a, 'select count(*)::integer as result from public.stripe_memberships where subscription_id=$1', [m.subscription]), 0);
        await admin.query('update public.ticket_wallets set test_subscription_hint_tickets=0 where user_id=$1', [user]);
        assert.equal((await atomicSubscription(a, m, event)).credited, 10);
    });
    await check('atomic reordered invoice keeps current period and refuses a refund-barrier backfill', async () => {
        const user = await account(admin); const m = await member(a, user);
        await atomicSubscription(a, m, unique('evt_ATOMIC'));
        const priorEnd = m.start;
        const priorStart = new Date(Date.parse(priorEnd) - 30 * 86400000).toISOString();
        const historical = { paidNewPeriod: false, paidPeriod: { invoiceId: 'in_ATOMICHISTORY', periodStart: priorStart, periodEnd: priorEnd } };
        assert.equal((await atomicSubscription(a, m, unique('evt_ATOMIC'), historical)).credited, 10);
        assert.equal(await scalar(a, 'select period_end=$2::timestamptz as result from public.stripe_memberships where subscription_id=$1', [m.subscription, m.end]), true);
        await admin.query('update public.stripe_memberships set refund_blocked_until=$2 where subscription_id=$1', [m.subscription, m.end]);
        const blockedEvent = unique('evt_ATOMIC');
        const older = { paidNewPeriod: false, paidPeriod: { invoiceId: 'in_ATOMICOLDER', periodEnd: priorStart,
            periodStart: new Date(Date.parse(priorStart) - 30 * 86400000).toISOString() } };
        await assert.rejects(atomicSubscription(a, m, blockedEvent, older), /Canonical paid snapshot required/);
        assert.equal(await scalar(a, 'select count(*)::integer as result from public.stripe_webhook_receipts where event_id=$1', [blockedEvent]), 0);
        assert.equal((await wallet(a, user)).test_subscription_hint_tickets, 20);
    });

    await check('independent backends contend on one daily claim and credit the seventh day once', async () => {
        const user = await account(admin);
        await admin.query("update public.ticket_wallets set streak_days=6,last_claim_utc_day=(clock_timestamp() at time zone 'UTC')::date-1 where user_id=$1", [user]);
        const claims = await contended(admin, a, b, c => claim(c, user), c => claim(c, user));
        assert.equal(claims.filter(r => r.claimed).length, 1);
        assert.deepEqual(claims[0].credited, { ranked: 3, hint: 1 });
        assert.deepEqual(claims[1].credited, { ranked: 0, hint: 0 });
        assert.equal((await wallet(a, user)).ranked_tickets, 3);
        assert.equal((await wallet(a, user)).hint_tickets, 1);
    });
    await check('daily cycle, missed-day reset, bigint bounds and arithmetic rollback', async () => {
        const user = await account(admin);
        for (let day = 0; day < 8; day++) {
            if (day) await admin.query("update public.ticket_wallets set last_claim_utc_day=(clock_timestamp() at time zone 'UTC')::date-1 where user_id=$1", [user]);
            const r = await claim(a, user);
            assert.deepEqual(r.credited, { ranked: [1, 1, 2, 2, 3, 3, 3, 1][day], hint: day === 6 ? 1 : 0 });
            assert.equal(r.rewardPolicyVersion, 2);
        }
        await admin.query("update public.ticket_wallets set last_claim_utc_day=(clock_timestamp() at time zone 'UTC')::date-3,ranked_tickets=$2 where user_id=$1", [user, MAX]);
        const before = await wallet(a, user);
        await assert.rejects(claim(a, user), { code: '22003' });
        assert.deepEqual(await wallet(a, user), before);
        for (const column of ['ranked_tickets', 'hint_tickets', 'member_ranked_tickets', 'member_hint_tickets', 'test_member_ranked_tickets',
            'test_member_hint_tickets', 'purchased_hint_tickets', 'test_purchased_hint_tickets', 'subscription_hint_tickets', 'test_subscription_hint_tickets']) {
            assert.equal(await scalar(admin, 'select data_type as result from information_schema.columns where table_schema=\'public\' and table_name=\'ticket_wallets\' and column_name=$1', [column]), 'bigint');
            await assert.rejects(admin.query(`update public.ticket_wallets set ${column}=-1 where user_id=$1`, [user]), { code: '23514' });
            await assert.rejects(admin.query(`update public.ticket_wallets set ${column}=9007199254740992 where user_id=$1`, [user]), { code: '23514' });
        }
        await admin.query('update public.ticket_wallets set ranked_tickets=32767 where user_id=$1', [user]);
        const retry = await claim(a, user);
        assert.equal(retry.streakDays, 1); assert.equal(retry.tickets.ranked, 32768);
    });

    for (const [sku, amount, quantity] of specs.filter(s => s[0].startsWith('hints'))) {
        await check(`${sku}: exact ${amount} cents credits ${quantity} purchased hints only`, async () => {
            const user = await account(admin);
            const intent = await register(a, user, sku);
            assert.deepEqual(await purchase(a, intent), { applied: true, duplicate: false, credited: quantity });
            const w = await wallet(a, user);
            assert.equal(w.test_purchased_hint_tickets, quantity);
            for (const column of ['hint_tickets', 'member_hint_tickets', 'test_member_hint_tickets', 'purchased_hint_tickets', 'subscription_hint_tickets', 'test_subscription_hint_tickets']) assert.equal(w[column], 0);
        });
    }
    for (const sameEvent of [true, false]) {
        await check(`concurrent one-time same checkout / ${sameEvent ? 'same' : 'different'} event credits once`, async () => {
            const user = await account(admin);
            const intent = await register(a, user);
            const event = unique('evt_PACK');
            const r = await contended(admin, a, b, c => purchase(c, intent, event), c => purchase(c, intent, sameEvent ? event : unique('evt_OTHER')));
            assert.deepEqual(r.map(x => x.credited), [13, 0]); assert.equal(r[1].duplicate, true);
            assert.equal((await wallet(a, user)).test_purchased_hint_tickets, 13);
            assert.equal(await scalar(a, 'select count(*)::integer as result from public.stripe_one_time_purchases where checkout_id=$1', [intent.checkout]), 1);
        });
    }
    await check('checkout evidence tampering and global event collision cannot alter another owner', async () => {
        const user = await account(admin), other = await account(admin);
        const intent = await register(a, user), second = await register(a, other);
        for (const changes of [{ user: other }, { amount: 1 }, { currency: 'eur' }, { status: 'unpaid' }, { sku: 'hints_166' }]) {
            await assert.rejects(purchase(a, intent, undefined, changes), /Unbound|Invalid paid/);
        }
        const event = unique('evt_COLLISION'); await purchase(a, intent, event);
        await assert.rejects(purchase(b, second, event), { code: '23505' });
        await assert.rejects(purchase(b, intent, event, { hash: 'b'.repeat(64) }), { code: '23505' });
        assert.equal((await wallet(a, other)).test_purchased_hint_tickets, 0);
    });
    await check('overflow rolls back every one-time receipt; losing transaction rollback permits one retry', async () => {
        const user = await account(admin), intent = await register(a, user), event = unique('evt_OVERFLOW');
        await admin.query('update public.ticket_wallets set test_purchased_hint_tickets=$2 where user_id=$1', [user, MAX - 12]);
        await assert.rejects(purchase(a, intent, event), { code: '22003' });
        assert.equal(await scalar(a, 'select count(*)::integer as result from public.stripe_commerce_event_receipts where event_id=$1', [event]), 0);
        assert.equal(await scalar(a, 'select count(*)::integer as result from public.stripe_commerce_consumed_checkouts where checkout_id=$1', [intent.checkout]), 0);
        await admin.query('update public.ticket_wallets set test_purchased_hint_tickets=$2 where user_id=$1', [user, MAX - 13]);
        const r = await contended(admin, a, b, c => purchase(c, intent, event), c => purchase(c, intent, event), { rollback: true });
        assert.deepEqual(r.map(x => x.applied), [true, true]); // A rolled back, only B persisted.
        assert.equal((await wallet(a, user)).test_purchased_hint_tickets, MAX);
        assert.equal((await purchase(a, intent, event)).duplicate, true);
    });
    await check('backend death before commit rolls purchase back; reconnect after commit deduplicates lost acknowledgement', async () => {
        const user = await account(admin), intent = await register(a, user), event = unique('evt_CRASH');
        const doomed = await open('service_role'); await doomed.query('begin'); await purchase(doomed, intent, event);
        assert.equal(await scalar(admin, 'select pg_terminate_backend($1,5000) as result', [doomed.fixturePid]), true);
        assert.equal((await wallet(a, user)).test_purchased_hint_tickets, 0);
        const reconnected = await open('service_role');
        assert.equal((await purchase(reconnected, intent, event)).credited, 13);
        await reconnected.end();
        const afterCommit = await open('service_role');
        assert.equal((await purchase(afterCommit, intent, event)).duplicate, true);
        assert.equal((await wallet(a, user)).test_purchased_hint_tickets, 13);
    });
    await check('concurrent reconciliation leases have one owner and expired workers cannot mutate after replacement', async () => {
        const subscription = unique('sub_LEASE');
        const acquire = c => scalar(c, 'select public.acquire_stripe_reconciliation($1,false) as result', [subscription]);
        const leases = await contended(admin, a, b, acquire, acquire);
        assert.ok(leases[0].token); assert.equal(leases[1].token, null);
        const user = await account(admin), m = await member(a, user);
        await admin.query("update public.stripe_reconciliation_leases set expires_at=clock_timestamp()-interval '1 second' where subscription_id=$1", [m.subscription]);
        const replacement = await scalar(b, 'select public.acquire_stripe_reconciliation($1,false) as result', [m.subscription]);
        assert.notEqual(replacement.token, m.token);
        const event = unique('evt_STALE');
        await assert.rejects(snapshot(a, m, event), { code: '40001' });
        assert.equal(await scalar(a, 'select count(*)::integer as result from public.stripe_webhook_receipts where event_id=$1', [event]), 0);
        const valid = { ...m, token: replacement.token };
        assert.equal((await snapshot(b, valid)).result.applied, true);
    });

    for (const sameEvent of [true, false]) {
        await check(`concurrent Plus ${sameEvent ? 'same' : 'different'} event / same paid period grants ten once`, async () => {
            const user = await account(admin), m = await member(a, user);
            const first = await snapshot(a, m);
            const second = sameEvent ? first : await snapshot(a, m);
            const r = await contended(admin, a, b, c => paidPeriod(c, m, first.event), c => paidPeriod(c, m, second.event));
            assert.deepEqual(r.map(x => x.credited), [10, 0]); assert.equal(r[1].duplicate, true);
            const w = await wallet(a, user);
            assert.equal(w.test_subscription_hint_tickets, 10); assert.equal(w.subscription_hint_tickets, 0);
            assert.equal(w.test_member_hint_tickets, 0);
            assert.deepEqual((await scalar(a, 'select public.claim_stripe_member_daily_grant($1) as result', [user])).credited, { ranked: 0, hint: 0 });
        });
    }
    await check('delayed historical Plus backfill after renewal grants once and remains replayable', async () => {
        const user = await account(admin), [earlier, later] = historicalPeriods(await member(a, user));
        const old = await snapshot(a, earlier), current = await snapshot(a, later);
        const r = await contended(admin, a, b, c => paidPeriod(c, later, current.event), c => paidPeriod(c, earlier, old.event));
        assert.deepEqual(r.map(x => x.credited), [10, 10]);
        assert.equal((await paidPeriod(a, earlier, old.event)).duplicate, true);
        assert.equal((await wallet(a, user)).test_subscription_hint_tickets, 20);
    });
    for (const timing of ['before', 'after']) for (const granted of [false, true]) {
        await check(`historical refund ${timing} renewal, prior grant=${granted}, blocks new older credits`, async () => {
            const user = await account(admin), [earlier, later] = historicalPeriods(await member(a, user));
            const old = await snapshot(a, earlier);
            if (granted) await paidPeriod(a, earlier, old.event);
            if (timing === 'before') assert.equal((await reverse(a, earlier)).blocked, true);
            const current = await snapshot(a, later); await paidPeriod(a, later, current.event);
            if (timing === 'after') assert.equal((await reverse(a, earlier, 'in_SECOND', later.end)).blocked, false);
            if (granted) assert.equal((await paidPeriod(b, earlier, old.event)).duplicate, true);
            else await assert.rejects(paidPeriod(b, earlier, old.event), /Canonical paid snapshot|Historical paid period requires risk review/);
            assert.equal((await wallet(a, user)).test_subscription_hint_tickets, granted ? 20 : 10);
            assert.equal(await scalar(a, 'select count(*)::integer as result from public.stripe_reversal_receipts where subscription_id=$1', [earlier.subscription]), 1);
        });
    }
    await check('Plus overflow, unpaid evidence and overlapping periods roll back ledger and wallet', async () => {
        const user = await account(admin), m = await member(a, user);
        const unpaid = await snapshot(a, m, undefined, { paid: false });
        await assert.rejects(paidPeriod(a, m, unpaid.event), { code: '42501' });
        const paid = await snapshot(a, m);
        await admin.query('update public.ticket_wallets set test_subscription_hint_tickets=$2 where user_id=$1', [user, MAX - 9]);
        await assert.rejects(paidPeriod(a, m, paid.event), { code: '22003' });
        assert.equal(await scalar(a, 'select count(*)::integer as result from public.stripe_commerce_event_receipts where event_id=$1', [paid.event]), 0);
        await admin.query('update public.ticket_wallets set test_subscription_hint_tickets=$2 where user_id=$1', [user, MAX - 10]);
        assert.equal((await paidPeriod(a, m, paid.event)).credited, 10);
        const overlap = { ...m, start: new Date(Date.parse(m.start) - 86400000).toISOString(), end: new Date(Date.parse(m.end) - 86400000).toISOString() };
        const changed = await snapshot(a, overlap);
        await assert.rejects(paidPeriod(a, overlap, changed.event), { code: '23505' });
        assert.equal((await wallet(a, user)).test_subscription_hint_tickets, MAX);
    });

    await check('ranked duplicate start/reconnect debits once and concurrent void refunds original pool once', async () => {
        const user = await account(admin, { quota: 3, ranked: 1 }), owner = randomUUID();
        await a.query('select public.renew_ranked_server_lease($1)', [owner]);
        const m = cpuMatch(user, owner);
        const r = await contended(admin, a, b, c => admit(c, m), c => admit(c, m));
        assert.equal(r[0].state, 'active'); assert.equal(r[1].duplicate, true);
        assert.equal((await wallet(a, user)).ranked_tickets, 0);
        const reconnect = await open('service_role');
        assert.equal((await scalar(reconnect, 'select public.get_ranked_admission($1,$2) as result', [m.id, user])).state, 'active');
        assert.equal((await admit(reconnect, m)).duplicate, true);
        await contended(admin, a, b, c => voidMatch(c, m), c => voidMatch(c, m));
        const refunds = (await a.query('select pool,subscription_id,spent_by from public.ranked_ticket_refunds where source_match_id=$1', [m.id])).rows;
        assert.deepEqual(refunds, [{ pool: 'free', subscription_id: null, spent_by: null }]);
        assert.equal((await wallet(a, user)).ranked_tickets, 0); // refund is separate provenance.
        const retry = cpuMatch(user, owner); await admit(a, retry); await voidMatch(a, retry);
        assert.equal(await scalar(a, 'select count(*)::integer as result from public.ranked_ticket_refunds where user_id=$1', [user]), 1);
    });
    await check('reversed-order PvP starts are atomic and do not deadlock or charge rejected players', async () => {
        const left = await account(admin, { quota: 3, ranked: 1 }), right = await account(admin, { quota: 3, ranked: 1 }), owner = randomUUID();
        await a.query('select public.renew_ranked_server_lease($1)', [owner]);
        const ids = [randomUUID(), randomUUID()];
        const starts = await Promise.all([
            scalar(a, 'select public.admit_ranked_match($1,$2,$3,600,$4) as result', [ids[0], left, right, owner]),
            scalar(b, 'select public.admit_ranked_match($1,$2,$3,600,$4) as result', [ids[1], right, left, owner]),
        ]);
        assert.equal(starts.filter(r => r.state === 'active').length, 1);
        assert.equal(starts.filter(r => r.reason === 'ACCOUNT_BUSY').length, 1);
        const id = ids[starts.findIndex(r => r.state === 'active')];
        assert.equal(await scalar(a, 'select count(*)::integer as result from public.ranked_match_allocations where match_id=$1', [id]), 2);
        assert.equal(await scalar(a, 'select count(distinct spent_at)::integer as result from public.ticket_spend_receipts where event_id=$1', [id]), 1);
        await a.query('select public.void_ranked_admission($1,$2)', [id, owner]);
        const empty = await account(admin, { quota: 3 }), funded = await account(admin, { quota: 3, ranked: 1 }), rejectedId = randomUUID();
        const denied = await scalar(a, 'select public.admit_ranked_match($1,$2,$3,600,$4) as result', [rejectedId, funded, empty, owner]);
        assert.equal(denied.state, 'rejected');
        assert.equal((await wallet(a, funded)).ranked_tickets, 1);
        assert.equal(await scalar(a, 'select count(*)::integer as result from public.ranked_match_allocations where match_id=$1', [rejectedId]), 0);
    });
    await check('settle/void contend to exactly one terminal result and expired-owner recovery remains idempotent', async () => {
        for (const finish of ['settle', 'void']) {
            const user = await account(admin, { quota: 3, ranked: 1 }), owner = randomUUID(), m = cpuMatch(user, owner);
            await a.query('select public.renew_ranked_server_lease($1)', [owner]); await admit(a, m);
            if (finish === 'settle') await contended(admin, a, b, c => settle(c, m), c => voidMatch(c, m));
            else {
                // A losing settle may reject the voided match; it must not write a result.
                await a.query('begin'); await voidMatch(a, m); const pending = settle(b, m).then(v => v, e => e);
                await a.query('commit'); await pending;
            }
            const result = await scalar(a, 'select count(*)::integer as result from public.ranked_match_settlements where match_id=$1', [m.id]);
            const refund = await scalar(a, 'select count(*)::integer as result from public.ranked_ticket_refunds where source_match_id=$1', [m.id]);
            assert.equal(result + refund, 1); assert.equal(result, finish === 'settle' ? 1 : 0);
        }
        const user = await account(admin, { quota: 3, ranked: 1 }), owner = randomUUID(), m = cpuMatch(user, owner);
        await a.query('select public.renew_ranked_server_lease($1)', [owner]); await admit(a, m);
        await admin.query("update public.ranked_server_leases set expires_at=clock_timestamp()-interval '1 second' where owner_id=$1", [owner]);
        await Promise.all([a.query('select public.recover_expired_ranked_admissions()'), b.query('select public.recover_expired_ranked_admissions()')]);
        assert.equal((await scalar(a, 'select public.get_ranked_admission($1,$2) as result', [m.id, user])).state, 'voided');
        assert.equal(await scalar(a, 'select count(*)::integer as result from public.ranked_ticket_refunds where source_match_id=$1', [m.id]), 1);
    });

    await check('new stocks cannot be consumed by old ranked/CPU paths and free-hint restoration preserves provenance', async () => {
        const user = await account(admin, { quota: 3 }), owner = randomUUID(), m = cpuMatch(user, owner);
        await admin.query('update public.ticket_wallets set purchased_hint_tickets=13,subscription_hint_tickets=10,test_purchased_hint_tickets=27,test_subscription_hint_tickets=20 where user_id=$1', [user]);
        const before = await wallet(a, user);
        await a.query('select public.renew_ranked_server_lease($1)', [owner]);
        assert.equal((await admit(a, m)).state, 'rejected');
        const session = randomUUID(), request = randomUUID();
        await admin.query(`insert into public.cpu_practice_sessions(session_id,user_id,rules_version,player_side,level,seconds,state,state_hash,white_ms,black_ms)
            values($1,$2,'quantum-practice-v1','white',1,600,'{}',$3,600000,600000)`, [session, user, HASH]);
        const hint = await scalar(a, `select public.buy_cpu_hint($1,$2,$3,0,$4,'{}',
            '{"fromRow":6,"fromCol":4,"toRow":4,"toCol":4}') as result`, [request, user, session, HASH]);
        assert.equal(hint.error, 'INSUFFICIENT_FUNDS');
        assert.deepEqual(await wallet(a, user), before);
        await admin.query('update public.ticket_wallets set hint_tickets=$2 where user_id=$1', [user, MAX - 1]);
        await admin.query(`insert into public.cpu_hint_receipts(request_id,user_id,session_id,revision,rules_version,session_hash,move,hint,pool)
            values($1,$2,$3,0,'quantum-practice-v1',$4,'{}','{}','free')`, [request, user, session, HASH]);
        const restore = c => scalar(c, "select public.restore_cpu_hint_credit($1,$2,'unrecoverable_delivery') as result", [request, user]);
        assert.deepEqual(await contended(admin, a, b, restore, restore), [1, 0]);
        const after = await wallet(a, user); assert.equal(after.hint_tickets, MAX);
        for (const column of ['purchased_hint_tickets', 'subscription_hint_tickets', 'test_purchased_hint_tickets', 'test_subscription_hint_tickets']) assert.equal(after[column], before[column]);
    });
    await check('profile erasure preserves purchase replay fence and cannot recreate purchased balance', async () => {
        const user = await account(admin), intent = await register(a, user); await purchase(a, intent);
        await admin.query('delete from public.profiles where id=$1', [user]);
        assert.equal((await purchase(a, intent)).retired, true);
        assert.equal(await wallet(a, user), undefined);
        assert.equal(await scalar(a, 'select count(*)::integer as result from public.stripe_commerce_consumed_checkouts where checkout_id=$1', [intent.checkout]), 1);
    });

    await check('legacy $2.99 pre-upgrade Checkout, grants, refund and cancellation preserve new stock', async () => {
        legacy.token = (await scalar(a, 'select public.acquire_stripe_reconciliation($1,true) as result', [legacy.subscription])).token;
        assert.equal((await snapshot(a, legacy)).result.applied, true);
        const grants = await contended(admin, a, b,
            c => scalar(c, 'select public.claim_stripe_live_member_daily_grant($1) as result', [legacy.user]),
            c => scalar(c, 'select public.claim_stripe_live_member_daily_grant($1) as result', [legacy.user]));
        assert.deepEqual(grants.map(x => x.credited), [{ ranked: 3, hint: 3 }, { ranked: 0, hint: 0 }]);
        await admin.query('update public.ticket_wallets set purchased_hint_tickets=13,subscription_hint_tickets=10 where user_id=$1', [legacy.user]);
        await reverse(a, legacy);
        const w = await wallet(a, legacy.user);
        assert.equal(w.member_hint_tickets, 0); assert.equal(w.member_ranked_tickets, 0);
        assert.equal(w.purchased_hint_tickets, 13); assert.equal(w.subscription_hint_tickets, 10);
        await snapshot(a, legacy, undefined, { status: 'canceled', paid: false });
        assert.equal((await scalar(a, 'select public.stripe_live_member_status_with_schedule($1) as result', [legacy.user])).active, false);
    });
    await check('EXECUTE, table privileges, RLS and service catalog mutation boundaries are enforced', async () => {
        const names = ['stripe_commerce_catalog', 'stripe_commerce_price_bindings', 'stripe_commerce_checkout_intents',
            'stripe_commerce_consumed_checkouts', 'stripe_one_time_purchases', 'stripe_commerce_event_receipts',
            'stripe_commerce_paid_evidence', 'stripe_commerce_paid_periods'];
        for (const role of ['anon', 'authenticated']) {
            const client = await open(role);
            await assert.rejects(client.query('select public.stripe_commerce_protocol_version()'), { code: '42501' });
            await assert.rejects(client.query('select public.claim_daily_login_reward($1)', [upgrade]), { code: '42501' });
            for (const name of names) await assert.rejects(client.query(`select * from public.${name}`), { code: '42501' });
            assert.equal(await scalar(admin, `select count(*)::integer as result from pg_proc where pronamespace='public'::regnamespace
                and (proname like '%stripe_commerce%' or proname='validate_stripe_checkout_price_binding')
                and has_function_privilege($1,oid,'EXECUTE')`, [role]), 0);
        }
        await assert.rejects(a.query("update public.stripe_commerce_catalog set hint_quantity=166 where sku='hints_1'"), { code: '42501' });
        await assert.rejects(a.query("insert into public.stripe_commerce_price_bindings values('hints_1','price_ATTACK',true)"), { code: '42501' });
        assert.equal(await scalar(admin, "select count(*)::integer as result from pg_proc where pronamespace='public'::regnamespace and proname like '%stripe_commerce%' and prosecdef"), 0);
        // Grant SELECT to a disposable non-BYPASSRLS probe to test RLS itself,
        // rather than conflating access denial with effective RLS protection.
        await admin.query('create role qg_rls_probe; grant usage on schema public to qg_rls_probe');
        const probe = await open('qg_rls_probe');
        for (const name of names) {
            assert.equal(await scalar(admin, "select relrowsecurity as result from pg_class where oid=$1::regclass", [`public.${name}`]), true);
            await admin.query(`grant select on public.${name} to qg_rls_probe`);
            assert.equal(await scalar(probe, `select count(*)::integer as result from public.${name}`), 0);
        }
    });

    const sourceSha256 = {};
    for (const source of [...baselineEvidence.historical, ...baselineEvidence.pending].map(name => `supabase/migrations/${name}`).concat([
        'scripts/qa/fixtures/session-postgres-baseline.mjs', 'scripts/qa/fixtures/commerce-postgres-baseline.mjs',
        'scripts/qa/commerce-postgres.test.mjs', 'scripts/qa/commerce-postgres-support.mjs',
        'server/src/services/StripeCommerceEvidence.ts', 'server/src/services/StripeCommerceStore.ts',
        'server/src/services/StripeCommerceFulfillment.ts', 'server/src/services/StripeCommerceWebhookDatabase.test.ts',
    ])) {
        sourceSha256[source] = createHash('sha256').update(await readFile(new URL(`../../${source}`, import.meta.url))).digest('hex');
    }
    const report = { completed: failures === 0 && results.length === 44, verifiedAt: new Date().toISOString(), sourceSha256,
        nativePostgreSQL: true, nativeVersion, independentBackends: true,
        productionData: false, providerHttpVerified: false, freshInstallVerified: false,
        baseline: baselineEvidence, passed: results.length, failed: failures, tests: results,
        limitations: ['No live provider calls, auth/storage service integration or production rows',
            'Duplicate historical draft 20260918062045 still blocks all-file fresh installation',
            'Public baseline reproduction is not exact hosted-production equivalence',
            'Native core PostgreSQL does not prove Supabase extension, scheduler or PostgREST integration'] };
    await writeFile(join(tmpdir(), 'commerce-postgres-results.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report));
    assert.equal(failures, 0, 'Native PostgreSQL verification contains failed checks');
    assert.equal(results.length, 44, 'Native PostgreSQL verification contains omitted checks');
});

async function protectedDefinitions(client) {
    const functions = (await client.query(`select oid::regprocedure::text as name,pg_get_functiondef(oid) as definition
        from pg_proc where pronamespace='public'::regnamespace
        and proname in ('admit_ranked_match','buy_cpu_hint','spend_game_tickets','void_ranked_admission') order by 1`)).rows;
    const constraints = (await client.query(`select conrelid::regclass::text as name,conname,pg_get_constraintdef(oid) as definition
        from pg_constraint where conrelid in ('public.ticket_spend_receipts'::regclass,'public.ranked_match_allocations'::regclass,
        'public.ranked_ticket_refunds'::regclass,'public.cpu_hint_receipts'::regclass) and contype='c' order by 1,2`)).rows;
    return { functions, constraints };
}
