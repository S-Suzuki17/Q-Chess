import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash, randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { connect, scalar, wallet, account, contended, MAX, HASH, LEGACY_PRICE,
    specs, bind, register, member, snapshot, paidPeriod } from './commerce-postgres-support.mjs';
import { setupBaseline, applyPending, baselineEvidence, pending } from './fixtures/commerce-postgres-baseline.mjs';

// Real PostgreSQL 17 with independent backends and observable lock waits.
// Public SQL fixture only; synthetic state tests SQL authority, not engine play.
const state = { sideToMove: 'white', ply: 0, winner: null, pieces: Array.from({ length: 32 }, () => ({})) };
const hint = { fromRow: 6, fromCol: 0, toRow: 5, toCol: 0 };
const move = { pieceId: 'w_1', target: { row: 5, col: 0 } };
const open = (c, user) => scalar(c, `select public.cpu_practice_open($1,$2,'white',1,600,'quantum-practice-v1',$3,$4) as result`,
    [randomUUID(), user, JSON.stringify(state), HASH]);
const buy = (c, s, request = randomUUID(), changes = {}) => {
    const p = { user: s.userId, session: s.sessionId, revision: s.revision, hash: s.stateHash, ...changes };
    return scalar(c, 'select public.buy_cpu_hint_v2($1,$2,$3,$4,$5,$6,$7) as result',
        [request, p.user, p.session, p.revision, p.hash, JSON.stringify(move), JSON.stringify(hint)]);
};
const read = (c, receipt, user) => scalar(c, 'select public.read_cpu_hint_receipt($1,$2,$3,$4) as result',
    [receipt.receiptId, user, receipt.sessionId, receipt.revision]);
const restore = (c, receipt, user) => scalar(c, "select public.restore_cpu_hint_credit($1,$2,'unrecoverable_delivery') as result", [receipt.receiptId, user]);
const origin = (c, id) => scalar(c, 'select origin as result from public.cpu_hint_wallet_origins where receipt_id=$1', [id]);
const receiptCount = (c, user) => scalar(c, 'select count(*)::integer as result from public.cpu_hint_receipts where user_id=$1', [user]);
async function legacy(admin, user, status = 'active') {
    const subscription = `sub_HINT${user}`, checkout = `cs_live_HINT${user}`, customer = `cus_HINT${user}`;
    await admin.query(`insert into public.stripe_checkout_intents(checkout_id,user_id,price_id,livemode,expires_at)
        values($1,$2,$3,true,clock_timestamp()+interval '1 hour')`, [checkout, user, LEGACY_PRICE]);
    await admin.query('insert into public.stripe_customer_links(customer_id,user_id) values($1,$2)', [customer, user]);
    await admin.query(`insert into public.stripe_memberships(subscription_id,checkout_id,customer_id,user_id,current_price_id,status,period_end,event_created,observed_at)
        values($1,$2,$3,$4,$5,$6,clock_timestamp()+interval '1 day',1,clock_timestamp())`, [subscription, checkout, customer, user, LEGACY_PRICE, status]);
    await admin.query('update public.ticket_wallets set member_ticket_subscription_id=$2,member_hint_tickets=1 where user_id=$1', [user, subscription]);
    return subscription;
}

test('native PostgreSQL hint origins, upgrade and races', { timeout: 180_000 }, async t => {
    const clients = [], results = [];
    const connectAs = async role => { const c = await connect(role); clients.push(c); return c; };
    const admin = await connectAs();
    let a, b, nativeVersion, failures = 0;
    const check = async (name, fn) => t.test(name, { timeout: 20_000 }, async () => {
        try { await fn(); results.push(name); } catch (error) { failures++; throw error; }
    });
    t.after(async () => { await Promise.allSettled(clients.map(c => c.end())); });

    await check('all ten pending raw files upgrade public-only baseline without changing legacy purchase or receipt constraints', async () => {
        await setupBaseline(admin);
        nativeVersion = await scalar(admin, "select current_setting('server_version_num')::integer as result");
        const before = await definitions(admin);
        const user = await account(admin);
        await admin.query('update public.ticket_wallets set hint_tickets=20 where user_id=$1', [user]);
        assert.equal(pending.length, 10, 'Review the full additive migration union when integrating another slice');
        await applyPending(admin);
        assert.deepEqual(await definitions(admin), before);
        assert.equal((await wallet(admin, user)).hint_tickets, 20);
        a = await connectAs('service_role'); b = await connectAs('service_role');
        assert.notEqual(a.fixturePid, b.fixturePid);
    });
    assert.ok(a && b, 'Public baseline upgrade must complete before scenarios');

    await check('source and database release gates remain closed; ledger is private, RLS-enabled and immutable', async () => {
        const source = await readFile(new URL('../../server/src/services/CpuHintOriginProtocol.ts', import.meta.url), 'utf8');
        assert.match(source, /CPU_HINT_ORIGIN_CONSUMPTION_RELEASE_READY = false/);
        assert.deepEqual(await scalar(a, 'select public.stripe_commerce_protocol_version() as result'),
            { version: 1, newSalesEnabled: false, spendingEnabled: false, reversalsReady: false });
        assert.equal(await scalar(admin, "select relrowsecurity as result from pg_class where oid='public.cpu_hint_wallet_origins'::regclass"), true);
        for (const role of ['anon', 'authenticated']) {
            const c = await connectAs(role);
            await assert.rejects(c.query('select * from public.cpu_hint_wallet_origins'), /permission denied/);
            await assert.rejects(c.query("select public.buy_cpu_hint_v2($1,'Nobody',$2,0,$3,'{}','{}')", [randomUUID(), randomUUID(), HASH]), /permission denied/);
        }
        await assert.rejects(a.query("update public.cpu_hint_wallet_origins set origin='purchased'"), /permission denied/);
        await assert.rejects(a.query('delete from public.cpu_hint_wallet_origins'), /permission denied/);
        assert.equal(await scalar(admin, "select prosecdef as result from pg_proc where oid='public.buy_cpu_hint_v2(uuid,text,uuid,integer,text,jsonb,jsonb)'::regprocedure"), false);
        const user = await account(admin);
        await admin.query('update public.ticket_wallets set purchased_hint_tickets=1 where user_id=$1', [user]);
        const receipt = await buy(a, await open(a, user));
        assert.equal(await origin(a, receipt.receiptId), 'purchased');
        await admin.query('create role qg_rls_probe; grant usage on schema public to qg_rls_probe; grant select on public.cpu_hint_wallet_origins to qg_rls_probe');
        const probe = await connectAs('qg_rls_probe');
        assert.equal(await scalar(probe, 'select count(*)::integer as result from public.cpu_hint_wallet_origins'), 0);
    });

    await check('depletion preserves free, eligible legacy, earned subscription, purchased priority and one-unit cost', async () => {
        const user = await account(admin); await legacy(admin, user);
        await admin.query('update public.ticket_wallets set hint_tickets=1,subscription_hint_tickets=1,purchased_hint_tickets=1 where user_id=$1', [user]);
        const snapshots = [];
        for (const expected of [undefined, undefined, 'subscription', 'purchased']) {
            const receipt = await buy(a, await open(a, user));
            assert.equal(await origin(a, receipt.receiptId), expected);
            snapshots.push(await wallet(a, user));
        }
        assert.deepEqual(snapshots.map(w => [w.hint_tickets, w.member_hint_tickets, w.subscription_hint_tickets, w.purchased_hint_tickets]),
            [[0,1,1,1], [0,0,1,1], [0,0,0,1], [0,0,0,0]]);
        assert.deepEqual(await buy(a, await open(a, user)), { error: 'INSUFFICIENT_FUNDS' });
        assert.equal(await receiptCount(a, user), 4);
    });

    await check('all six real SQL pack grants feed one-unit consumption and original-source restoration', async () => {
        await bind(admin);
        for (const [sku, , quantity] of specs.filter(([, , quantity]) => quantity > 0)) {
            const user = await account(admin), intent = await register(a, user, sku, true);
            const evidence = { eventId: `evt_HINTPACK${user}`, payloadHash: HASH,
                checkoutId: intent.checkout, userId: user, sku, priceId: intent.price,
                amountTotal: intent.amount, currency: 'usd', livemode: true, paymentStatus: 'paid' };
            const granted = await scalar(a, 'select public.fulfill_stripe_commerce_one_time($1::jsonb) as result', [JSON.stringify(evidence)]);
            assert.equal(granted.credited, quantity);
            const receipt = await buy(a, await open(a, user));
            assert.equal((await wallet(a, user)).purchased_hint_tickets, quantity - 1);
            assert.equal(await origin(a, receipt.receiptId), 'purchased');
            assert.equal(await restore(a, receipt, user), 1);
            assert.equal((await wallet(a, user)).purchased_hint_tickets, quantity);
        }
    });

    await check('paid Plus period grants ten earned hints and membership cancellation does not erase earned stock', async () => {
        const user = await account(admin), paid = await member(a, user, 'plus_monthly', true);
        const { event } = await snapshot(a, paid);
        assert.equal((await paidPeriod(a, paid, event)).credited, 10);
        await admin.query("update public.stripe_memberships set status='canceled' where subscription_id=$1", [paid.subscription]);
        assert.equal((await wallet(a, user)).subscription_hint_tickets, 10);
        const receipt = await buy(a, await open(a, user));
        assert.equal(await origin(a, receipt.receiptId), 'subscription');
        assert.equal((await wallet(a, user)).subscription_hint_tickets, 9);
        assert.equal(await restore(a, receipt, user), 1);
        assert.equal((await wallet(a, user)).subscription_hint_tickets, 10);
    });

    await check('suspended and canceled legacy membership cannot consume or erase unrelated new stock', async () => {
        for (const status of ['paused', 'canceled']) {
            const user = await account(admin); const subscription = await legacy(admin, user, status);
            await admin.query('update public.ticket_wallets set subscription_hint_tickets=2,purchased_hint_tickets=166 where user_id=$1', [user]);
            const receipt = await buy(a, await open(a, user));
            assert.equal(await origin(a, receipt.receiptId), 'subscription');
            const w = await wallet(a, user);
            assert.equal(w.subscription_hint_tickets, 1); assert.equal(w.purchased_hint_tickets, 166);
            assert.equal(w.member_hint_tickets, status === 'paused' ? 1 : 0);
            if (status === 'paused') assert.equal(w.member_ticket_subscription_id, subscription);
        }
    });

    await check('test-only balances never authorize a live hint and remain untouched', async () => {
        const user = await account(admin);
        await admin.query("update public.ticket_wallets set test_subscription_hint_tickets=10,test_purchased_hint_tickets=166,test_member_hint_tickets=60,test_member_ticket_subscription_id='sub_TEST' where user_id=$1", [user]);
        const before = await wallet(a, user);
        assert.deepEqual(await buy(a, await open(a, user)), { error: 'INSUFFICIENT_FUNDS' });
        assert.deepEqual(await wallet(a, user), before);
    });

    await check('v2 purchase rejects every non-read-committed isolation before touching balances or receipts', async () => {
        const user = await account(admin);
        await admin.query('update public.ticket_wallets set hint_tickets=1,subscription_hint_tickets=10,purchased_hint_tickets=166 where user_id=$1', [user]);
        const s = await open(a, user), before = await wallet(a, user);
        for (const isolation of ['read uncommitted', 'repeatable read', 'serializable']) {
            await a.query(`begin isolation level ${isolation}`);
            try { await assert.rejects(buy(a, s), /READ_COMMITTED_REQUIRED/); }
            finally { await a.query('rollback'); }
            assert.deepEqual(await wallet(a, user), before);
            assert.equal(await receiptCount(a, user), 0);
        }
    });

    await check('operations restoration rejects non-read-committed snapshots without credit or restoration record', async () => {
        const user = await account(admin); await legacy(admin, user);
        const receipt = await buy(a, await open(a, user)), before = await wallet(a, user);
        for (const isolation of ['read uncommitted', 'repeatable read', 'serializable']) {
            await a.query(`begin isolation level ${isolation}`);
            try { await assert.rejects(restore(a, receipt, user), /READ_COMMITTED_REQUIRED/); }
            finally { await a.query('rollback'); }
            assert.deepEqual(await wallet(a, user), before);
            assert.equal(await scalar(a, 'select count(*)::integer as result from public.cpu_hint_restorations where receipt_id=$1', [receipt.receiptId]), 0);
        }
        assert.equal(await restore(a, receipt, user), 1);
        assert.equal(await restore(b, receipt, user), 0);
    });

    await check('same request on independent backends waits and returns one immutable receipt and debit', async () => {
        const user = await account(admin);
        await admin.query('update public.ticket_wallets set purchased_hint_tickets=2 where user_id=$1', [user]);
        const s = await open(a, user), id = randomUUID();
        const [first, second] = await contended(admin, a, b, c => buy(c, s, id), c => buy(c, s, id));
        assert.deepEqual(first, second); assert.equal((await wallet(a, user)).purchased_hint_tickets, 1);
        assert.equal(await receiptCount(a, user), 1);
    });

    await check('different requests for one revision converge through shared aliases under actual contention', async () => {
        const user = await account(admin);
        await admin.query('update public.ticket_wallets set subscription_hint_tickets=2 where user_id=$1', [user]);
        const s = await open(a, user), id = randomUUID(), alias = randomUUID();
        const [first, second] = await contended(admin, a, b, c => buy(c, s, id), c => buy(c, s, alias));
        assert.deepEqual(first, second); assert.equal((await wallet(a, user)).subscription_hint_tickets, 1);
        assert.equal(await scalar(a, 'select count(*)::integer as result from public.cpu_hint_request_aliases where receipt_id=$1', [id]), 2);
    });

    await check('two sessions race for the final purchased unit without a negative balance', async () => {
        const user = await account(admin);
        await admin.query('update public.ticket_wallets set purchased_hint_tickets=1 where user_id=$1', [user]);
        const left = await open(a, user), right = await open(a, user);
        const result = await contended(admin, a, b, c => buy(c, left), c => buy(c, right));
        assert.ok(result[0].receiptId); assert.deepEqual(result[1], { error: 'INSUFFICIENT_FUNDS' });
        assert.equal((await wallet(a, user)).purchased_hint_tickets, 0); assert.equal(await receiptCount(a, user), 1);
    });

    await check('rollback lets the waiting request buy the final unit without retaining the canceled receipt', async () => {
        const user = await account(admin);
        await admin.query('update public.ticket_wallets set subscription_hint_tickets=1 where user_id=$1', [user]);
        const s = await open(a, user), id = randomUUID(), retry = randomUUID();
        const [rolledBack, committed] = await contended(admin, a, b, c => buy(c, s, id), c => buy(c, s, retry), { rollback: true });
        assert.equal(rolledBack.receiptId, id); assert.equal(committed.receiptId, retry);
        assert.equal(await read(a, rolledBack, user), null);
        assert.equal((await wallet(a, user)).subscription_hint_tickets, 0); assert.equal(await receiptCount(a, user), 1);
    });

    await check('failure writing the source allocation rolls back debit, receipt and alias together', async () => {
        const user = await account(admin);
        await admin.query('update public.ticket_wallets set purchased_hint_tickets=1 where user_id=$1', [user]);
        const s = await open(a, user);
        await admin.query(`create function public.hint_test_fail_origin() returns trigger language plpgsql as $$ begin raise exception 'fixture allocation failure'; end $$;
            create trigger hint_test_fail_origin before insert on public.cpu_hint_wallet_origins for each row execute function public.hint_test_fail_origin()`);
        try { await assert.rejects(buy(a, s), /fixture allocation failure/); }
        finally { await admin.query('drop trigger hint_test_fail_origin on public.cpu_hint_wallet_origins; drop function public.hint_test_fail_origin()'); }
        assert.equal((await wallet(a, user)).purchased_hint_tickets, 1); assert.equal(await receiptCount(a, user), 0);
        assert.ok((await buy(a, s)).receiptId);
    });

    await check('owner, session, revision and finished-state checks precede any new-source debit', async () => {
        const user = await account(admin), other = await account(admin);
        await admin.query('update public.ticket_wallets set purchased_hint_tickets=2 where user_id=$1', [user]);
        const s = await open(a, user);
        await assert.rejects(buy(a, s, randomUUID(), { user: other }), /SESSION_NOT_FOUND/);
        await assert.rejects(buy(a, s, randomUUID(), { revision: 1 }), /STALE_REVISION/);
        await assert.rejects(buy(a, s, randomUUID(), { hash: 'b'.repeat(64) }), /STALE_REVISION/);
        const receipt = await buy(a, s);
        await assert.rejects(buy(a, s, receipt.receiptId, { user: other }), /REQUEST_MISMATCH/);
        await scalar(a, 'select public.cpu_practice_close($1,$2) as result', [s.sessionId, user]);
        await assert.rejects(buy(a, s), /SESSION_FINISHED/);
        assert.deepEqual(await read(b, receipt, user), receipt);
        assert.deepEqual(await buy(b, s, receipt.receiptId), receipt);
        assert.equal((await wallet(a, user)).purchased_hint_tickets, 1);
    });

    // Exercise the actual legacy and shared admission RPC lock graphs in both
    // directions, rather than substituting a profile lock plus manual row.
    for (const variant of ['legacy_ranked', 'shared_ranked', 'shared_random']) {
        const prepare = async () => {
            const user = await account(admin), other = await account(admin), owner = randomUUID(), id = randomUUID();
            await admin.query('update public.ticket_wallets set purchased_hint_tickets=3 where user_id=$1', [user]);
            const session = await open(a, user);
            await scalar(a, 'select public.renew_ranked_server_lease($1) as result', [owner]);
            const admit = client => variant === 'legacy_ranked'
                ? scalar(client, 'select public.admit_ranked_match($1,$2,$3,600,$4) as result', [id,user,other,owner])
                : scalar(client, "select public.admit_shared_match($1,$2,$3,600,$4,$5,'{}') as result",
                    [id,user,other,owner,variant === 'shared_ranked' ? 'ranked' : 'random']);
            return {user,other,owner,id,session,admit};
        };
        await check(`${variant} commits before a blocked hint: no debit or receipt, and prestart void restores eligibility`, async () => {
            const value = await prepare();
            await assert.rejects(contended(admin,a,b,value.admit,client=>buy(client,value.session)), /HINT_UNAVAILABLE_IN_MATCH/);
            assert.equal((await wallet(a,value.user)).purchased_hint_tickets,3);
            assert.equal(await receiptCount(a,value.user),0);
            assert.equal(await scalar(a,'select state as result from public.ranked_match_admissions where match_id=$1',[value.id]),'active');
            await scalar(a,"select public.void_ranked_admission($1,$2,'synthetic_prestart_cancel') as result",[value.id,value.owner]);
            assert.equal(await scalar(a,'select state as result from public.ranked_match_admissions where match_id=$1',[value.id]),'voided');
            const receipt=await buy(b,value.session);
            assert.equal(await origin(a,receipt.receiptId),'purchased');
            assert.equal((await wallet(a,value.user)).purchased_hint_tickets,2);
        });
        await check(`hint commits before blocked ${variant}: one immutable hint and one later start`, async () => {
            const value = await prepare();
            const [receipt, admission]=await contended(admin,a,b,client=>buy(client,value.session),value.admit);
            assert.equal(admission.state,'active');
            assert.equal((await wallet(a,value.user)).purchased_hint_tickets,2);
            assert.equal(await receiptCount(a,value.user),1);
            assert.equal(await origin(a,receipt.receiptId),'purchased');
            assert.deepEqual(await read(b,receipt,value.user),receipt);
            await assert.rejects(buy(a,value.session), /HINT_UNAVAILABLE_IN_MATCH/);
            assert.equal((await wallet(a,value.user)).purchased_hint_tickets,2);
            await scalar(a,"select public.void_ranked_admission($1,$2,'synthetic_cleanup') as result",[value.id,value.owner]);
        });
    }

    await check('all source columns retain safe bigint bounds without product stock caps', async () => {
        const user = await account(admin);
        const columns = ['hint_tickets','member_hint_tickets','test_member_hint_tickets','purchased_hint_tickets',
            'test_purchased_hint_tickets','subscription_hint_tickets','test_subscription_hint_tickets'];
        await admin.query("update public.ticket_wallets set member_ticket_subscription_id='sub_LIVE',test_member_ticket_subscription_id='sub_TEST' where user_id=$1", [user]);
        for (const column of columns) {
            await admin.query(`update public.ticket_wallets set ${column}=$2 where user_id=$1`, [user, MAX]);
            assert.equal((await wallet(a, user))[column], MAX);
            for (const bad of ['-1', '9007199254740992', '9223372036854775808']) {
                await assert.rejects(admin.query(`update public.ticket_wallets set ${column}=$2 where user_id=$1`, [user, bad]), /constraint|out of range/);
                assert.equal((await wallet(a, user))[column], MAX);
            }
        }
    });

    for (const source of ['subscription', 'purchased']) await check(`${source} restoration under contention credits the original source exactly once`, async () => {
        const user = await account(admin);
        await admin.query(`update public.ticket_wallets set ${source}_hint_tickets=1 where user_id=$1`, [user]);
        const receipt = await buy(a, await open(a, user));
        await admin.query('update public.ticket_wallets set hint_tickets=20,test_purchased_hint_tickets=77,test_subscription_hint_tickets=10 where user_id=$1', [user]);
        const before = await wallet(a, user);
        assert.deepEqual(await contended(admin, a, b, c => restore(c, receipt, user), c => restore(c, receipt, user)), [1, 0]);
        assert.deepEqual(await wallet(a, user), { ...before, [`${source}_hint_tickets`]: 1 });
        assert.deepEqual(await read(a, receipt, user), receipt);
    });

    await check('full-domain restoration remains retryable for both new sources without a zero-credit tombstone', async () => {
        for (const source of ['subscription', 'purchased']) {
            const user = await account(admin);
            await admin.query(`update public.ticket_wallets set ${source}_hint_tickets=1 where user_id=$1`, [user]);
            const receipt = await buy(a, await open(a, user));
            await admin.query(`update public.ticket_wallets set ${source}_hint_tickets=$2 where user_id=$1`, [user, MAX]);
            await assert.rejects(restore(a, receipt, user), /BALANCE_LIMIT/);
            assert.equal(await scalar(a, 'select count(*)::integer as result from public.cpu_hint_restorations where receipt_id=$1', [receipt.receiptId]), 0);
            assert.equal((await wallet(a, user))[`${source}_hint_tickets`], MAX);
            await admin.query(`update public.ticket_wallets set ${source}_hint_tickets=$2 where user_id=$1`, [user, MAX - 1]);
            assert.equal(await restore(a, receipt, user), 1);
            assert.equal((await wallet(a, user))[`${source}_hint_tickets`], MAX);
            assert.equal(await restore(b, receipt, user), 0);
        }
    });

    await check('free and eligible bound legacy restoration at the numeric limit remains retryable once headroom exists', async () => {
        for (const source of ['free', 'paid']) {
            const user = await account(admin), column = source === 'free' ? 'hint_tickets' : 'member_hint_tickets';
            if (source === 'paid') await legacy(admin, user);
            else await admin.query('update public.ticket_wallets set hint_tickets=1 where user_id=$1', [user]);
            const receipt = await buy(a, await open(a, user));
            assert.equal(await origin(a, receipt.receiptId), undefined);
            assert.equal(await scalar(a, 'select pool as result from public.cpu_hint_receipts where request_id=$1', [receipt.receiptId]), source);
            await admin.query(`update public.ticket_wallets set ${column}=$2,purchased_hint_tickets=166,subscription_hint_tickets=10 where user_id=$1`, [user, MAX]);
            const before = await wallet(a, user);
            await assert.rejects(restore(a, receipt, user), /BALANCE_LIMIT/);
            assert.deepEqual(await wallet(a, user), before);
            assert.equal(await scalar(a, 'select count(*)::integer as result from public.cpu_hint_restorations where receipt_id=$1', [receipt.receiptId]), 0);
            await admin.query(`update public.ticket_wallets set ${column}=$2 where user_id=$1`, [user, MAX - 1]);
            assert.deepEqual(await contended(admin, a, b, c => restore(c, receipt, user), c => restore(c, receipt, user)), [1, 0]);
            assert.deepEqual(await wallet(a, user), before);
            assert.equal(await scalar(a, 'select credited as result from public.cpu_hint_restorations where receipt_id=$1', [receipt.receiptId]), 1);
        }
    });

    await check('ineligible expired and differently bound legacy restoration preserves existing zero-credit semantics even at the limit', async () => {
        for (const reason of ['paused', 'canceled', 'expired', 'different_binding']) {
            const user = await account(admin), subscription = await legacy(admin, user);
            const receipt = await buy(a, await open(a, user));
            if (reason === 'paused' || reason === 'canceled') await admin.query('update public.stripe_memberships set status=$2 where subscription_id=$1', [subscription, reason]);
            if (reason === 'expired') await admin.query("update public.stripe_memberships set period_end=clock_timestamp()-interval '1 day' where subscription_id=$1", [subscription]);
            await admin.query(`update public.ticket_wallets set member_hint_tickets=$2,member_ticket_subscription_id=$3,
                purchased_hint_tickets=166,subscription_hint_tickets=10 where user_id=$1`,
                [user, MAX, reason === 'different_binding' ? 'sub_DIFFERENT' : subscription]);
            const before = await wallet(a, user);
            assert.equal(await restore(a, receipt, user), 0);
            assert.equal(await restore(b, receipt, user), 0);
            assert.deepEqual(await wallet(a, user), before);
            assert.equal(await scalar(a, 'select credited as result from public.cpu_hint_restorations where receipt_id=$1', [receipt.receiptId]), 0);
        }
    });

    await check('restoration ledger failure rolls back credit and allows the same repair to retry', async () => {
        const user = await account(admin);
        await admin.query('update public.ticket_wallets set purchased_hint_tickets=1 where user_id=$1', [user]);
        const receipt = await buy(a, await open(a, user));
        await admin.query(`create function public.hint_test_fail_restore() returns trigger language plpgsql as $$ begin raise exception 'fixture repair failure'; end $$;
            create trigger hint_test_fail_restore before insert on public.cpu_hint_restorations for each row execute function public.hint_test_fail_restore()`);
        try { await assert.rejects(restore(a, receipt, user), /fixture repair failure/); }
        finally { await admin.query('drop trigger hint_test_fail_restore on public.cpu_hint_restorations; drop function public.hint_test_fail_restore()'); }
        assert.equal((await wallet(a, user)).purchased_hint_tickets, 0);
        assert.equal(await restore(a, receipt, user), 1); assert.equal(await restore(b, receipt, user), 0);
    });

    await check('deletion cascades private origin allocation and same-name recreation cannot recover or restore it', async () => {
        const user = await account(admin);
        await admin.query('update public.ticket_wallets set purchased_hint_tickets=1 where user_id=$1', [user]);
        const s = await open(a, user), receipt = await buy(a, s);
        await scalar(a, 'select public.begin_account_deletion($1,$2) as result', [user, HASH]);
        await assert.rejects(read(a, receipt, user), /ACCOUNT_UNAVAILABLE/);
        await assert.rejects(restore(a, receipt, user), /ACCOUNT_UNAVAILABLE/);
        // Cancel the synthetic pending deletion; the existing receipt survives.
        await admin.query('delete from public.account_deletion_jobs where user_id=$1', [user]);
        assert.deepEqual(await read(a, receipt, user), receipt);
        await admin.query('delete from public.profiles where id=$1', [user]);
        assert.equal(await origin(admin, receipt.receiptId), undefined);
        await admin.query('insert into public.profiles(id,name) values($1,$1)', [user]);
        await admin.query("insert into public.account_terms_consents(user_id,version) values($1,'2026-09-25.1'),($1,'2026-10-03.1')", [user]);
        assert.equal(await read(a, receipt, user), null);
        await assert.rejects(restore(a, receipt, user), /INVALID_REQUEST/);
        await assert.rejects(buy(a, s, receipt.receiptId), /SESSION_NOT_FOUND/);
    });

    await check('lost committed result is recoverable on another backend after move and server-session close', async () => {
        const user = await account(admin);
        await admin.query('update public.ticket_wallets set subscription_hint_tickets=2 where user_id=$1', [user]);
        const s = await open(a, user), receipt = await buy(a, s);
        await scalar(a, `select public.cpu_practice_commit_move($1,$2,$3,0,$4,'human',$4,$5,$6,$7) as result`,
            [randomUUID(), s.sessionId, user, HASH, JSON.stringify({ ...state, ply: 1, sideToMove: 'black' }), 'b'.repeat(64), JSON.stringify(move)]);
        await scalar(a, 'select public.cpu_practice_close($1,$2) as result', [s.sessionId, user]);
        assert.deepEqual(await read(b, receipt, user), receipt);
        assert.deepEqual(await buy(b, s, receipt.receiptId), receipt);
        assert.equal((await wallet(a, user)).subscription_hint_tickets, 1);
        assert.equal(await scalar(a, 'select count(*)::integer as result from public.cpu_hint_restorations where receipt_id=$1', [receipt.receiptId]), 0);
        await assert.rejects(a.query("update public.cpu_hint_receipts set hint='{}' where request_id=$1", [receipt.receiptId]), /permission denied/);
    });

    const sourceSha256 = {};
    for (const name of [...baselineEvidence.historical, ...pending].map(n => `supabase/migrations/${n}`).concat([
        'scripts/qa/hint-origin-postgres.test.mjs','scripts/qa/hint-origin-postgres-local.mjs',
        'scripts/qa/fixtures/session-postgres-baseline.mjs','server/src/services/CpuPracticeService.ts',
        'server/src/services/CpuHintOriginProtocol.ts','server/src/services/CpuPracticeOriginDatabase.test.ts',
        'server/src/services/fixtures/commerceDatabaseFixture.ts','.github/workflows/verify-hint-origins.yml'])) {
        sourceSha256[name] = createHash('sha256').update(await readFile(new URL(`../../${name}`, import.meta.url))).digest('hex');
    }
    const report = { completed: failures === 0 && results.length === 30, verifiedAt: new Date().toISOString(),
        nativePostgreSQL: true, nativeVersion, independentBackends: true, publicSourceOnly: true, productionData: false,
        applicationActivation: false, browserVerified: false, postgrestVerified: false, baseline: baselineEvidence,
        passed: results.length, failed: failures, tests: results, sourceSha256 };
    await writeFile(join(tmpdir(), 'hint-origin-postgres-results.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report));
    assert.equal(failures, 0); assert.equal(results.length, 30, 'Missing native hint-origin scenario');
});

async function definitions(client) {
    return {
        functions: (await client.query(`select oid::regprocedure::text as name,pg_get_functiondef(oid) as definition
            from pg_proc where pronamespace='public'::regnamespace
            and proname in ('admit_ranked_match','buy_cpu_hint','spend_game_tickets','void_ranked_admission') order by 1`)).rows,
        constraints: (await client.query(`select conrelid::regclass::text as name,conname,pg_get_constraintdef(oid) as definition
            from pg_constraint where conrelid in ('public.ticket_spend_receipts'::regclass,'public.ranked_match_allocations'::regclass,
            'public.ranked_ticket_refunds'::regclass,'public.cpu_hint_receipts'::regclass) and contype='c' order by 1,2`)).rows,
    };
}
