import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash, randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { connect, scalar, wallet, account, contended, MAX, HASH, bind, register, purchase,
    member, snapshot, paidPeriod, historicalPeriods, unique } from './commerce-postgres-support.mjs';
import { setupBaseline, baselineEvidence, pending } from './fixtures/commerce-postgres-baseline.mjs';
import { assertReviewedMigrationInventory } from './fixtures/session-postgres-baseline.mjs';

// Public SQL and synthetic users only. Each race must show a real PostgreSQL
// lock wait between independent backends; a serialized adapter cannot pass.
// Provider graph validation is separately tested at the Stripe API boundary.
const LEDGER = '20261007105937_dormant_commerce_source_ledger.sql';
const state = { sideToMove: 'white', ply: 0, winner: null, pieces: Array.from({ length: 32 }, () => ({})) };
const hint = { fromRow: 6, fromCol: 0, toRow: 5, toCol: 0 };
const move = { pieceId: 'w_1', target: { row: 5, col: 0 } };
const open = (c, user) => scalar(c, `select public.cpu_practice_open($1,$2,'white',1,600,'quantum-practice-v1',$3,$4) as result`,
    [randomUUID(), user, JSON.stringify(state), HASH]);
const buy = (c, s, request = randomUUID()) => scalar(c, 'select public.buy_cpu_hint_v2($1,$2,$3,$4,$5,$6,$7) as result',
    [request, s.userId, s.sessionId, s.revision, s.stateHash, JSON.stringify(move), JSON.stringify(hint)]);
const restore = (c, receipt, user) => scalar(c, "select public.restore_cpu_hint_credit($1,$2,'unrecoverable_delivery') as result", [receipt.receiptId, user]);
const sources = async (c, user) => (await c.query('select * from public.stripe_commerce_sources where user_id=$1 order by id', [user])).rows;
const source = async (c, intent) => {
    const rows = (await sources(c, intent.user)).filter(r => r.checkout_id === intent.checkout &&
        (!intent.start || new Date(r.period_start).getTime() === Date.parse(intent.start)));
    assert.equal(rows.length, 1, 'Exactly one purchase/paid-period source must exist');
    return rows[0];
};
const allocation = (c, receipt) => scalar(c, 'select to_jsonb(o) as result from public.cpu_hint_wallet_origins o where receipt_id=$1', [receipt.receiptId]);
const quantities = row => Object.fromEntries(['quantity', 'available', 'held', 'consumed', 'revoked'].map(key => [key, Number(row[key])]));
const balances = async (c, user) => {
    const w = await wallet(c, user);
    return Object.fromEntries(['hint_tickets', 'subscription_hint_tickets', 'purchased_hint_tickets',
        'test_subscription_hint_tickets', 'test_purchased_hint_tickets'].map(key => [key, Number(w[key])]));
};
const expected = (quantity, available, held, consumed, revoked) => ({ quantity, available, held, consumed, revoked });
const assertSource = async (c, intent, amount, state) => {
    const row = await source(c, intent);
    assert.deepEqual(quantities(row), amount);
    if (state) assert.equal(row.state, state);
    assert.equal(amount.available + amount.held + amount.consumed + amount.revoked, amount.quantity);
    return row;
};
const lease = (c, intent) => scalar(c, 'select public.acquire_stripe_commerce_reconciliation($1,$2) as result', [intent.checkout, intent.live]);
const release = (c, intent, token) => scalar(c, 'select public.release_stripe_commerce_reconciliation($1,$2,$3) as result', [intent.checkout, intent.live, token]);
const entitlement = (c, user) => scalar(c, 'select public.get_shared_match_entitlement($1) as result', [user]);
const commerceStatus = (c, user) => scalar(c, 'select public.stripe_commerce_status($1,true) as result', [user]);
const crown = (c, user) => scalar(c, 'select public.authorize_crown_first_attempt($1,$2,$3) as result',
    [randomUUID(), user, unique('crown:ledger:rank')]);
const paymentKey = intent => `${intent.checkout}${intent.subscription ? Date.parse(intent.start) : ''}`.replaceAll('_', '');
const riskEvidence = (intent, riskState = 'refunded', changes = {}) => ({
    eventId: unique('evt_LEDGERRISK'), payloadHash: HASH, observedAt: new Date().toISOString(),
    checkoutId: intent.checkout, userId: intent.user, sku: intent.sku, priceId: intent.price,
    amountTotal: intent.amount, currency: 'usd', livemode: intent.live,
    subscriptionId: intent.subscription ?? null, invoiceId: intent.subscription ? `in_${paymentKey(intent)}` : null,
    periodStart: intent.start ?? null, periodEnd: intent.end ?? null, token: intent.token,
    paymentSource: { paymentIntentId: `pi_${paymentKey(intent)}`, chargeId: `ch_${paymentKey(intent)}`,
        customerId: intent.subscription ? `cus_${intent.user}` : null,
        amountRefunded: riskState === 'refunded' ? intent.amount : riskState === 'partial_refund' ? 1 : 0,
        riskState, disputeId: ['disputed', 'dispute_lost'].includes(riskState) ? `dp_${paymentKey(intent)}` : null,
        disputeStatus: riskState === 'disputed' ? 'needs_response' : riskState === 'dispute_lost' ? 'lost' : null },
    ...changes,
});
const risk = (c, evidence) => scalar(c, 'select public.apply_stripe_commerce_source_risk($1::jsonb) as result', [JSON.stringify(evidence)]);
const purchased = async (admin, c, sku = 'hints_13', live = true, user = null) => {
    user ??= await account(admin);
    const intent = await register(c, user, sku, live);
    intent.token = (await lease(c, intent)).token;
    assert.ok(intent.token);
    await purchase(c, intent);
    return intent;
};
const spend = async (c, intent, count = 1) => {
    const receipts = [];
    for (let i = 0; i < count; i++) {
        const receipt = await buy(c, await open(c, intent.user));
        assert.ok(receipt.receiptId, 'Known source must authorize one hint');
        assert.equal((await allocation(c, receipt)).source_id, (await source(c, intent)).id);
        receipts.push(receipt);
    }
    return receipts;
};

test('native PostgreSQL purchase-source ledger, reversals and concurrent restoration', { timeout: 180_000 }, async t => {
    const clients = [], results = [];
    let failures = 0, a, b, nativeVersion, legacyUser, legacyReceipt;
    const connectAs = async role => { const c = await connect(role); clients.push(c); return c; };
    const admin = await connectAs();
    t.after(async () => { await Promise.allSettled(clients.map(c => c.end())); });
    const check = async (name, operation) => t.test(name, { timeout: 20_000 }, async () => {
        try { await operation(); results.push(name); } catch (error) { failures++; throw error; }
    });

    await check('explicit raw upgrade preserves unknown historical origins without inventing purchase rows', async () => {
        await setupBaseline(admin);
        nativeVersion = await scalar(admin, "select current_setting('server_version_num')::integer as result");
        await assertReviewedMigrationInventory();
        const position = pending.indexOf(LEDGER);
        assert.ok(position >= 0, 'Source ledger must be in the explicit pending list');
        for (const name of pending.slice(0, position)) await admin.query(await readFile(new URL(`../../supabase/migrations/${name}`, import.meta.url), 'utf8'));
        a = await connectAs('service_role'); b = await connectAs('service_role');
        legacyUser = await account(admin);
        await admin.query('update public.ticket_wallets set purchased_hint_tickets=13 where user_id=$1', [legacyUser]);
        legacyReceipt = await buy(a, await open(a, legacyUser));
        assert.ok(legacyReceipt.receiptId);
        const before = await wallet(a, legacyUser);
        await admin.query(await readFile(new URL(`../../supabase/migrations/${LEDGER}`, import.meta.url), 'utf8'));
        for (const name of pending.slice(position + 1)) await admin.query(await readFile(new URL(`../../supabase/migrations/${name}`, import.meta.url), 'utf8'));
        assert.equal(await scalar(a, 'select public.has_current_ticket_terms($1) as result', [legacyUser]), false);
        await a.query("select public.accept_current_account_terms($1,'2026-10-07.1')", [legacyUser]);
        assert.deepEqual(await wallet(a, legacyUser), before);
        assert.equal((await sources(a, legacyUser)).length, 0);
        assert.equal((await allocation(a, legacyReceipt)).source_id, null);
        await bind(admin);
    });
    assert.ok(a && b);

    await check('unattributed pre-upgrade aggregate stock cannot become a new purchase allocation', async () => {
        const before = await wallet(a, legacyUser);
        assert.deepEqual(await buy(a, await open(a, legacyUser)), { error: 'INSUFFICIENT_FUNDS' });
        await assert.rejects(restore(a, legacyReceipt, legacyUser), /ORIGIN_REVIEW_REQUIRED/);
        assert.deepEqual(await wallet(a, legacyUser), before);
        assert.equal((await sources(a, legacyUser)).length, 0);
    });

    await check('sandbox risk preserves unrelated pools and live mode pin rejects subsequent sandbox writes', async () => {
        // Exercise sandbox first, before any real live-mode Checkout fixture.
        // Never remove a mode pin to manufacture a mixed-mode permission.
        const sandbox = await purchased(admin, a, 'hints_27', false);
        await admin.query('update public.ticket_wallets set purchased_hint_tickets=13,hint_tickets=7 where user_id=$1', [sandbox.user]);
        await risk(a, riskEvidence(sandbox));
        await assertSource(a, sandbox, expected(27, 0, 0, 0, 27), 'revoked');
        assert.equal((await balances(a, sandbox.user)).purchased_hint_tickets, 13);
        assert.equal((await balances(a, sandbox.user)).hint_tickets, 7);
        assert.equal((await balances(a, sandbox.user)).test_purchased_hint_tickets, 0);
        const live = await purchased(admin, a, 'hints_13', true, sandbox.user);
        await assertSource(a, live, expected(13, 13, 0, 0, 0), 'active');
        const before = await balances(a, sandbox.user);
        await assert.rejects(risk(a, riskEvidence(sandbox, 'clear')), /Live billing mode is pinned/);
        assert.deepEqual(await balances(a, sandbox.user), before);
    });

    await check('thirteen granted and five spent recovers exactly eight on full refund', async () => {
        const intent = await purchased(admin, a);
        const receipts = await spend(a, intent, 5);
        await assertSource(a, intent, expected(13, 8, 0, 5, 0), 'active');
        await risk(a, riskEvidence(intent));
        await assertSource(a, intent, expected(13, 0, 0, 5, 8), 'revoked');
        assert.equal((await balances(a, intent.user)).purchased_hint_tickets, 0);
        for (const receipt of receipts) assert.equal(await restore(a, receipt, intent.user), 0);
        assert.equal((await balances(a, intent.user)).purchased_hint_tickets, 0);
    });

    await check('refund cannot debit another purchase, free reward or a future purchase', async () => {
        const first = await purchased(admin, a);
        await spend(a, first, 5);
        const other = await purchased(admin, a, 'hints_27', true, first.user);
        await admin.query('update public.ticket_wallets set hint_tickets=7 where user_id=$1', [first.user]);
        await risk(a, riskEvidence(first));
        const future = await purchased(admin, a, 'hints_1', true, first.user);
        await assertSource(a, other, expected(27, 27, 0, 0, 0), 'active');
        await assertSource(a, future, expected(1, 1, 0, 0, 0), 'active');
        assert.equal((await balances(a, first.user)).purchased_hint_tickets, 28);
        assert.equal((await balances(a, first.user)).hint_tickets, 7);
    });

    await check('partial refund records manual review without proportional revocation or suspension', async () => {
        const intent = await purchased(admin, a); await spend(a, intent, 5);
        await risk(a, riskEvidence(intent, 'partial_refund'));
        await assertSource(a, intent, expected(13, 8, 0, 5, 0), 'active');
        await spend(a, intent);
        assert.equal((await balances(a, intent.user)).purchased_hint_tickets, 7);
    });

    await check('open dispute holds only unused rights and won dispute returns only held rights', async () => {
        const intent = await purchased(admin, a); await spend(a, intent, 5);
        await risk(a, riskEvidence(intent, 'disputed'));
        await assertSource(a, intent, expected(13, 0, 8, 5, 0), 'held');
        assert.deepEqual(await buy(a, await open(a, intent.user)), { error: 'INSUFFICIENT_FUNDS' });
        const won = riskEvidence(intent, 'clear');
        won.paymentSource.disputeId = `dp_${paymentKey(intent)}`; won.paymentSource.disputeStatus = 'won';
        await risk(a, won);
        await assertSource(a, intent, expected(13, 8, 0, 5, 0), 'active');
        assert.equal((await balances(a, intent.user)).purchased_hint_tickets, 8);
    });

    await check('delivery restoration during a dispute goes to held stock until canonical won resolution', async () => {
        const intent = await purchased(admin, a); const [receipt] = await spend(a, intent);
        await risk(a, riskEvidence(intent, 'disputed'));
        assert.equal(await restore(a, receipt, intent.user), 0);
        await assertSource(a, intent, expected(13, 0, 13, 0, 0), 'held');
        assert.equal((await balances(a, intent.user)).purchased_hint_tickets, 0);
        const won = riskEvidence(intent, 'clear');
        won.paymentSource.disputeId = `dp_${paymentKey(intent)}`; won.paymentSource.disputeStatus = 'won';
        await risk(a, won);
        await assertSource(a, intent, expected(13, 13, 0, 0, 0), 'active');
        assert.equal(await restore(a, receipt, intent.user), 0);
        assert.equal((await balances(a, intent.user)).purchased_hint_tickets, 13);
    });

    await check('lost dispute revokes the held remainder without debt or restoration resurrection', async () => {
        const intent = await purchased(admin, a); const [receipt] = await spend(a, intent);
        await risk(a, riskEvidence(intent, 'disputed'));
        await risk(a, riskEvidence(intent, 'dispute_lost'));
        await assertSource(a, intent, expected(13, 0, 0, 1, 12), 'revoked');
        assert.equal(await restore(a, receipt, intent.user), 0);
        assert.equal((await balances(a, intent.user)).purchased_hint_tickets, 0);
    });

    await check('clear evidence cannot resurrect a permanently refunded source', async () => {
        const intent = await purchased(admin, a);
        await risk(a, riskEvidence(intent));
        await risk(a, riskEvidence(intent, 'clear'));
        await assertSource(a, intent, expected(13, 0, 0, 0, 13), 'revoked');
        assert.equal((await balances(a, intent.user)).purchased_hint_tickets, 0);
    });

    for (const riskState of ['refunded', 'disputed']) {
        await check(`${riskState} canonical evidence preceding grant is retained by eventual fulfillment`, async () => {
            const user = await account(admin), intent = await register(a, user, 'hints_13', true);
            intent.token = (await lease(a, intent)).token;
            await risk(a, riskEvidence(intent, riskState));
            await purchase(a, intent);
            await assertSource(a, intent, riskState === 'refunded' ? expected(13, 0, 0, 0, 13) : expected(13, 0, 13, 0, 0),
                riskState === 'refunded' ? 'revoked' : 'held');
            assert.equal((await balances(a, user)).purchased_hint_tickets, 0);
        });
    }

    await check('Plus sources track each paid month and old period refund protects current rights and hints', async () => {
        const user = await account(admin), m = await member(a, user, 'plus_monthly', true);
        const [earlier, current] = historicalPeriods(m);
        const old = await snapshot(a, earlier); await paidPeriod(a, earlier, old.event);
        const next = await snapshot(a, current); await paidPeriod(a, current, next.event);
        const before = await commerceStatus(a, user);
        assert.equal(before.active, true);
        assert.equal((await entitlement(a, user)).unlimitedOnlineRanked, true);
        await risk(a, riskEvidence(earlier));
        await assertSource(a, earlier, expected(10, 0, 0, 0, 10), 'revoked');
        await assertSource(a, current, expected(10, 10, 0, 0, 0), 'active');
        assert.equal((await balances(a, user)).subscription_hint_tickets, 10);
        assert.equal((await commerceStatus(a, user)).active, true);
        assert.equal((await entitlement(a, user)).unlimitedOnlineRanked, true);
        assert.equal((await crown(a, user)).source, 'subscription');
    });

    await check('refunded Plus evidence before period grant cannot create usable stock', async () => {
        const user = await account(admin), m = await member(a, user, 'plus_monthly', true);
        const paid = await snapshot(a, m);
        await risk(a, riskEvidence(m));
        await paidPeriod(a, m, paid.event);
        await assertSource(a, m, expected(10, 0, 0, 0, 10), 'revoked');
        assert.equal((await balances(a, user)).subscription_hint_tickets, 0);
        assert.equal((await commerceStatus(a, user)).active, false);
        assert.equal((await entitlement(a, user)).unlimitedOnlineRanked, false);
    });

    await check('a newly paid renewal remains usable when the earlier period was already refunded', async () => {
        const user = await account(admin), m = await member(a, user, 'plus_monthly', true);
        const [earlier, current] = historicalPeriods(m);
        const old = await snapshot(a, earlier); await paidPeriod(a, earlier, old.event);
        await risk(a, riskEvidence(earlier));
        const next = await snapshot(a, current); await paidPeriod(a, current, next.event);
        await assertSource(a, earlier, expected(10, 0, 0, 0, 10), 'revoked');
        await assertSource(a, current, expected(10, 10, 0, 0, 0), 'active');
        assert.equal((await commerceStatus(a, user)).active, true);
        assert.equal((await entitlement(a, user)).unlimitedOnlineRanked, true);
        assert.equal((await crown(a, user)).source, 'subscription');
        await spend(a, current);
    });

    for (const sku of ['standard_monthly', 'plus_monthly']) {
        await check(`${sku} current-period dispute suspends membership and Crown, won restores only that period`, async () => {
            const user = await account(admin), m = await member(a, user, sku, true);
            const paid = await snapshot(a, m); await paidPeriod(a, m, paid.event);
            const quantity = sku === 'plus_monthly' ? 10 : 0;
            await assertSource(a, m, expected(quantity, quantity, 0, 0, 0), 'active');
            const activeBalances = await balances(a, user);
            assert.equal(activeBalances.subscription_hint_tickets, quantity);
            assert.equal((await entitlement(a, user)).unlimitedOnlineRanked, true);
            assert.equal((await entitlement(a, user)).noAds, true);
            await risk(a, riskEvidence(m, 'disputed'));
            await assertSource(a, m, expected(quantity, 0, quantity, 0, 0), 'held');
            assert.deepEqual(await balances(a, user), { ...activeBalances, subscription_hint_tickets: 0 });
            assert.equal((await commerceStatus(a, user)).active, false);
            assert.equal((await entitlement(a, user)).unlimitedOnlineRanked, false);
            assert.equal((await entitlement(a, user)).noAds, false);
            assert.equal((await crown(a, user)).state, 'reward_required');
            const won = riskEvidence(m, 'clear');
            won.paymentSource.disputeId = `dp_${paymentKey(m)}`; won.paymentSource.disputeStatus = 'won';
            await risk(a, won);
            await assertSource(a, m, expected(quantity, quantity, 0, 0, 0), 'active');
            assert.deepEqual(await balances(a, user), activeBalances);
            assert.equal((await commerceStatus(a, user)).active, true);
            assert.equal((await entitlement(a, user)).unlimitedOnlineRanked, true);
            assert.equal((await entitlement(a, user)).noAds, true);
            assert.equal((await crown(a, user)).source, 'subscription');
            await risk(a, riskEvidence(m));
            await assertSource(a, m, expected(quantity, 0, 0, 0, quantity), 'revoked');
            assert.deepEqual(await balances(a, user), { ...activeBalances, subscription_hint_tickets: 0 });
            assert.equal((await commerceStatus(a, user)).active, false);
            assert.equal((await entitlement(a, user)).unlimitedOnlineRanked, false);
            assert.equal((await entitlement(a, user)).noAds, false);
            assert.equal((await crown(a, user)).state, 'reward_required');
        });
    }

    await check('Plus normal cancellation keeps earned source available through and after the term', async () => {
        const user = await account(admin), m = await member(a, user, 'plus_monthly', true);
        const paid = await snapshot(a, m); await paidPeriod(a, m, paid.event);
        await snapshot(a, m, undefined, { status: 'canceled', paid: false });
        await spend(a, m);
        await assertSource(a, m, expected(10, 9, 0, 1, 0), 'active');
    });

    for (const first of ['spend', 'refund']) {
        await check(`${first} first under observed lock contention yields consistent spend versus refund`, async () => {
            const intent = await purchased(admin, a, 'hints_1'), session = await open(a, intent.user), evidence = riskEvidence(intent);
            const operations = { spend: c => buy(c, session), refund: c => risk(c, evidence) };
            const result = await contended(admin, a, b, operations[first], operations[first === 'spend' ? 'refund' : 'spend']);
            if (first === 'spend') {
                assert.ok(result[0].receiptId);
                await assertSource(a, intent, expected(1, 0, 0, 1, 0), 'revoked');
            } else {
                assert.deepEqual(result[1], { error: 'INSUFFICIENT_FUNDS' });
                await assertSource(a, intent, expected(1, 0, 0, 0, 1), 'revoked');
            }
            assert.equal((await balances(a, intent.user)).purchased_hint_tickets, 0);
        });
    }

    for (const first of ['restore', 'refund']) {
        await check(`${first} first under observed lock contention never resurrects a refunded hint`, async () => {
            const intent = await purchased(admin, a, 'hints_1'), [receipt] = await spend(a, intent), evidence = riskEvidence(intent);
            const operations = { restore: c => restore(c, receipt, intent.user), refund: c => risk(c, evidence) };
            const result = await contended(admin, a, b, operations[first], operations[first === 'restore' ? 'refund' : 'restore']);
            assert.equal(result[first === 'restore' ? 0 : 1], first === 'restore' ? 1 : 0);
            assert.equal((await balances(a, intent.user)).purchased_hint_tickets, 0);
            const row = await source(a, intent);
            assert.equal(Number(row.available), 0); assert.equal(Number(row.held), 0); assert.equal(row.state, 'revoked');
            assert.equal(await restore(a, receipt, intent.user), 0);
        });
    }

    await check('duplicate hint requests under contention allocate exactly one source unit', async () => {
        const intent = await purchased(admin, a), session = await open(a, intent.user), request = randomUUID();
        const [first, second] = await contended(admin, a, b, c => buy(c, session, request), c => buy(c, session, request));
        assert.deepEqual(first, second);
        assert.equal((await allocation(a, first)).source_id, (await source(a, intent)).id);
        await assertSource(a, intent, expected(13, 12, 0, 1, 0), 'active');
    });

    await check('concurrent duplicated refund evidence debits the same unused stock once', async () => {
        const intent = await purchased(admin, a); await spend(a, intent, 5);
        const evidence = riskEvidence(intent);
        await contended(admin, a, b, c => risk(c, evidence), c => risk(c, evidence));
        await assertSource(a, intent, expected(13, 0, 0, 5, 8), 'revoked');
        assert.equal((await balances(a, intent.user)).purchased_hint_tickets, 0);
    });

    await check('same provider event with different signed payload is rejected without changing source', async () => {
        const intent = await purchased(admin, a), evidence = riskEvidence(intent, 'partial_refund');
        await risk(a, evidence);
        const before = await source(a, intent);
        await assert.rejects(risk(a, { ...evidence, payloadHash: 'b'.repeat(64) }));
        assert.deepEqual(await source(a, intent), before);
    });

    await check('a duplicate event rechecks the newer fenced canonical graph rather than retaining an obsolete hold', async () => {
        const intent = await purchased(admin, a), disputed = riskEvidence(intent, 'disputed');
        await risk(a, disputed);
        await release(a, intent, intent.token);
        intent.token = (await lease(b, intent)).token;
        const won = { ...disputed, observedAt: new Date().toISOString(), token: intent.token,
            paymentSource: { ...disputed.paymentSource, riskState: 'clear', disputeStatus: 'won' } };
        await risk(b, won);
        await assertSource(a, intent, expected(13, 13, 0, 0, 0), 'active');
        assert.equal((await balances(a, intent.user)).purchased_hint_tickets, 13);
    });

    await check('duplicate paid grant under contention creates one immutable source', async () => {
        const user = await account(admin), intent = await register(a, user, 'hints_13', true);
        const event = unique('evt_LEDGERGRANT');
        await contended(admin, a, b, c => purchase(c, intent, event), c => purchase(c, intent, event));
        await assertSource(a, intent, expected(13, 13, 0, 0, 0), 'active');
        assert.equal((await balances(a, user)).purchased_hint_tickets, 13);
    });

    await check('rolled-back refund lets waiting spend use original source without a residual fence', async () => {
        const intent = await purchased(admin, a, 'hints_1'), session = await open(a, intent.user);
        const [, second] = await contended(admin, a, b, c => risk(c, riskEvidence(intent)), c => buy(c, session), { rollback: true });
        assert.ok(second.receiptId);
        await assertSource(a, intent, expected(1, 0, 0, 1, 0), 'active');
    });

    await check('rolled-back spend lets waiting refund revoke the full unused source', async () => {
        const intent = await purchased(admin, a, 'hints_1'), session = await open(a, intent.user);
        const [rolledBack] = await contended(admin, a, b, c => buy(c, session), c => risk(c, riskEvidence(intent)), { rollback: true });
        await assertSource(a, intent, expected(1, 0, 0, 0, 1), 'revoked');
        assert.equal(await allocation(a, rolledBack), undefined);
    });

    await check('source allocation write failure rolls back receipt and debit together', async () => {
        const intent = await purchased(admin, a), session = await open(a, intent.user);
        await admin.query(`create function public.ledger_test_fail_allocation() returns trigger language plpgsql as $$ begin raise exception 'fixture ledger allocation failure'; end $$;
            create trigger ledger_test_fail_allocation before insert on public.cpu_hint_wallet_origins for each row execute function public.ledger_test_fail_allocation()`);
        try { await assert.rejects(buy(a, session), /fixture ledger allocation failure/); }
        finally { await admin.query('drop trigger ledger_test_fail_allocation on public.cpu_hint_wallet_origins; drop function public.ledger_test_fail_allocation()'); }
        await assertSource(a, intent, expected(13, 13, 0, 0, 0), 'active');
        assert.equal((await balances(a, intent.user)).purchased_hint_tickets, 13);
        assert.equal(await scalar(a, 'select count(*)::integer as result from public.cpu_hint_receipts where user_id=$1', [intent.user]), 0);
    });

    await check('retired lease cannot mutate source even with a later observedAt', async () => {
        const intent = await purchased(admin, a), stale = intent.token;
        await release(a, intent, stale);
        intent.token = (await lease(b, intent)).token;
        assert.notEqual(intent.token, stale);
        await assert.rejects(risk(a, riskEvidence(intent, 'refunded', { token: stale, observedAt: new Date(Date.now() + 1).toISOString() })), /lease|fence|token|reconciliation/i);
        await assertSource(a, intent, expected(13, 13, 0, 0, 0), 'active');
        await risk(b, riskEvidence(intent));
        await assertSource(a, intent, expected(13, 0, 0, 0, 13), 'revoked');
    });

    await check('stored Checkout ownership, price, amount and mode must match reversal evidence', async () => {
        const intent = await purchased(admin, a);
        for (const changes of [{ userId: 'SomeoneElse' }, { priceId: 'price_WRONG' }, { amountTotal: 1 }, { livemode: false }, { sku: 'hints_1' }]) {
            await assert.rejects(risk(a, riskEvidence(intent, 'refunded', changes)));
        }
        await assertSource(a, intent, expected(13, 13, 0, 0, 0), 'active');
    });

    await check('risk projection rejects non-read-committed snapshots before any source mutation', async () => {
        const intent = await purchased(admin, a), before = await source(a, intent);
        for (const isolation of ['read uncommitted', 'repeatable read', 'serializable']) {
            await a.query(`begin isolation level ${isolation}`);
            try { await assert.rejects(risk(a, riskEvidence(intent)), /read committed|READ_COMMITTED_REQUIRED/i); }
            finally { await a.query('rollback'); }
            assert.deepEqual(await source(a, intent), before);
        }
    });

    await check('profile erasure removes personal sources and keeps replay from recreating a balance', async () => {
        const intent = await purchased(admin, a); await spend(a, intent);
        await admin.query('delete from public.profiles where id=$1', [intent.user]);
        assert.equal((await sources(a, intent.user)).length, 0);
        assert.equal((await purchase(a, intent)).retired, true);
        assert.equal(await wallet(a, intent.user), undefined);
        assert.equal(await scalar(a, 'select count(*)::integer as result from public.stripe_commerce_consumed_checkouts where checkout_id=$1', [intent.checkout]), 1);
    });

    await check('grant overflow leaves no purchase source and exact integer boundary remains representable', async () => {
        const user = await account(admin), intent = await register(a, user, 'hints_13', true);
        await admin.query('update public.ticket_wallets set purchased_hint_tickets=$2 where user_id=$1', [user, MAX - 12]);
        await assert.rejects(purchase(a, intent), { code: '22003' });
        assert.equal((await sources(a, user)).length, 0);
        await admin.query('update public.ticket_wallets set purchased_hint_tickets=$2 where user_id=$1', [user, MAX - 13]);
        await purchase(a, intent);
        await assertSource(a, intent, expected(13, 13, 0, 0, 0), 'active');
        assert.equal((await balances(a, user)).purchased_hint_tickets, MAX);
    });

    await check('restoration overflow rolls back source movement and stays retryable', async () => {
        const intent = await purchased(admin, a, 'hints_1'), [receipt] = await spend(a, intent);
        await admin.query('update public.ticket_wallets set purchased_hint_tickets=$2 where user_id=$1', [intent.user, MAX]);
        await assert.rejects(restore(a, receipt, intent.user), { code: '22003' });
        await assertSource(a, intent, expected(1, 0, 0, 1, 0), 'active');
        await admin.query('update public.ticket_wallets set purchased_hint_tickets=0 where user_id=$1', [intent.user]);
        assert.equal(await restore(a, receipt, intent.user), 1);
        await assertSource(a, intent, expected(1, 1, 0, 0, 0), 'active');
    });

    await check('client roles cannot read sources or execute reconciliation and RLS independently denies rows', async () => {
        for (const role of ['anon', 'authenticated']) {
            const c = await connectAs(role);
            await assert.rejects(c.query('select * from public.stripe_commerce_sources'), { code: '42501' });
            await assert.rejects(c.query("select public.apply_stripe_commerce_source_risk('{}'::jsonb)"), { code: '42501' });
            await assert.rejects(c.query("select public.acquire_stripe_commerce_reconciliation('cs_test_UNKNOWN',false)"), { code: '42501' });
        }
        assert.equal(await scalar(admin, "select relrowsecurity as result from pg_class where oid='public.stripe_commerce_sources'::regclass"), true);
        await admin.query('create role qg_rls_probe; grant usage on schema public to qg_rls_probe; grant select on public.stripe_commerce_sources to qg_rls_probe');
        const probe = await connectAs('qg_rls_probe');
        assert.equal(await scalar(probe, 'select count(*)::integer as result from public.stripe_commerce_sources'), 0);
    });

    await check('every retained source has nonnegative conserved quantities and valid receipt ownership', async () => {
        assert.equal(await scalar(admin, `select count(*)::integer as result from public.stripe_commerce_sources
            where available<0 or held<0 or consumed<0 or revoked<0 or quantity<>available+held+consumed+revoked`), 0);
        assert.equal(await scalar(admin, `select count(*)::integer as result from public.cpu_hint_wallet_origins o
            join public.stripe_commerce_sources s on s.id=o.source_id
            join public.cpu_hint_receipts r on r.request_id=o.receipt_id where s.user_id<>r.user_id`), 0);
    });

    const sourceSha256 = {};
    for (const path of [...pending.map(name => `supabase/migrations/${name}`),
        'scripts/qa/commerce-source-ledger-postgres.test.mjs', 'scripts/qa/commerce-postgres-support.mjs',
        'scripts/qa/fixtures/commerce-postgres-baseline.mjs', 'scripts/qa/fixtures/session-postgres-baseline.mjs',
        'server/src/services/fixtures/commerceDatabaseFixture.ts', 'scripts/qa/native-postgres-local.mjs']) {
        sourceSha256[path] = createHash('sha256').update(await readFile(new URL(`../../${path}`, import.meta.url))).digest('hex');
    }
    const report = { completed: failures === 0, verifiedAt: new Date().toISOString(), sourceSha256,
        nativePostgreSQL: true, nativeVersion, independentBackends: true, observedBlockingPids: true,
        productionData: false, providerHttpVerified: false, baseline: baselineEvidence,
        passed: results.length, failed: failures, tests: results,
        limitations: ['Synthetic public SQL fixtures do not prove provider graph or actual payment behavior',
            'No hosted Supabase Auth, PostgREST, extension, scheduler or production schema equivalence',
            'No browser UI, engine search, production gates or deployment exercised'] };
    await writeFile(join(tmpdir(), 'commerce-source-ledger-postgres-results.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report));
    assert.equal(failures, 0, 'Source-ledger verification contains failed checks');
    assert.equal(results.length, 38, 'Source-ledger verification omitted required scenarios');
});
