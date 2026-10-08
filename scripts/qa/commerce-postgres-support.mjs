import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

// This is deliberately not DATABASE_URL/PGHOST/PGPASSWORD configurable. It can
// only reach the disposable CI service, never a hosted Supabase database.
export const connection = Object.freeze({
    host: '127.0.0.1', port: Number(process.env.QG_TEST_PG_PORT ?? 5432),
    database: 'commerce_upgrade', user: 'postgres', password: 'qgambit-ephemeral-only',
    ssl: false, connectionTimeoutMillis: 5_000, query_timeout: 20_000,
});
assert.ok(Number.isSafeInteger(connection.port) && connection.port > 0 && connection.port <= 65535);
export const HASH = 'a'.repeat(64);
export const MAX = 9007199254740991;
export const LEGACY_PRICE = 'price_1ULM9fQWzwYDIuXWgs5Uj3yt';
export const specs = [
    ['standard_monthly', 300, 0], ['plus_monthly', 600, 0],
    ['hints_1', 100, 1], ['hints_13', 1000, 13], ['hints_27', 2000, 27],
    ['hints_44', 3000, 44], ['hints_77', 5000, 77], ['hints_166', 10000, 166],
];
export const price = sku => `price_${sku.replaceAll('_', '')}`;
export const scalar = async (client, sql, values = []) => (await client.query(sql, values)).rows[0]?.result;
export const wallet = (client, user) => scalar(client, 'select to_jsonb(w) as result from public.ticket_wallets w where user_id=$1', [user]);
export const claim = (client, user) => scalar(client, 'select public.claim_daily_login_reward($1) as result', [user]);
export async function connect(role = null) {
    const client = new pg.Client({ ...connection, application_name: `qg-native-${randomUUID()}` });
    // Unexpected disconnects are asserted by the test that terminated them.
    client.on('error', error => { client.fixtureDisconnect = error; });
    await client.connect();
    await client.query("set statement_timeout='15s'; set lock_timeout='10s'; set idle_in_transaction_session_timeout='20s'; set timezone='UTC'");
    if (role) {
        assert.ok(['service_role', 'anon', 'authenticated', 'qg_rls_probe'].includes(role));
        await client.query(`set role ${role}`);
    }
    client.fixturePid = await scalar(client, 'select pg_backend_pid() as result');
    return client;
}

// Deterministic contention: A has already executed but has NOT committed. B
// must be observed waiting on an actual PostgreSQL lock blocked by A before
// A is allowed to commit. This cannot pass on a serialized single connection.
export async function contended(admin, first, second, operationA, operationB, { rollback = false } = {}) {
    assert.notEqual(first.fixturePid, second.fixturePid);
    await first.query('begin');
    let pending;
    try {
        const left = await operationA(first);
        pending = operationB(second).then(value => ({ value }), error => ({ error }));
        let observed = false;
        const deadline = Date.now() + 5_000;
        while (Date.now() < deadline) {
            const row = (await admin.query(`select wait_event_type,pg_blocking_pids(pid) as blockers
                from pg_stat_activity where pid=$1`, [second.fixturePid])).rows[0];
            if (row?.wait_event_type === 'Lock' && row.blockers.includes(first.fixturePid)) { observed = true; break; }
            await delay(10);
        }
        assert.ok(observed, `backend ${second.fixturePid} never blocked on backend ${first.fixturePid}`);
        await first.query(rollback ? 'rollback' : 'commit');
        const right = await pending;
        if (right.error) throw right.error;
        return [left, right.value];
    } finally {
        await first.query('rollback');
        if (pending) await pending;
    }
}

let sequence = 0;
export const unique = prefix => `${prefix}${++sequence}`;
export async function account(admin, { quota = 0, ranked = 0, oldTermsOnly = false } = {}) {
    const user = unique('Native');
    await admin.query('insert into public.profiles(id,name) values($1,$1)', [user]);
    await admin.query("insert into public.account_terms_consents(user_id,version) values($1,'2026-09-25.1')", [user]);
    if (!oldTermsOnly) await admin.query("insert into public.account_terms_consents(user_id,version) select $1,version from public.current_terms_policy where singleton", [user]);
    await admin.query('insert into public.ticket_wallets(user_id,ranked_tickets) values($1,$2)', [user, ranked]);
    for (let i = 0; i < quota; i++) await admin.query(`insert into public.ticket_spend_receipts(event_kind,event_id,user_id,pool)
        values('ranked_match_start',$1,$2,'quota')`, [randomUUID(), user]);
    return user;
}
export async function bind(admin) {
    for (const [sku] of specs) for (const live of [false, true]) {
        await admin.query('insert into public.stripe_commerce_price_bindings values($1,$2,$3)', [sku, price(sku), live]);
    }
}
export async function register(client, user, sku = 'hints_13', live = false) {
    const checkout = `cs_${live ? 'live' : 'test'}_${unique('NATIVE')}`;
    const amount = specs.find(s => s[0] === sku)[1];
    await client.query(`select public.register_stripe_commerce_checkout_intent($1,$2,$3,$4,$5,'usd',$6,clock_timestamp()+interval '1 hour')`,
        [user, checkout, sku, price(sku), amount, live]);
    return { user, checkout, sku, price: price(sku), amount, live };
}
export async function purchase(client, intent, event = unique('evt_NATIVE'), changes = {}) {
    const p = { ...intent, event, hash: HASH, currency: 'usd', status: 'paid', ...changes };
    return scalar(client, 'select public.apply_stripe_commerce_one_time_purchase($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) as result',
        [p.event, p.hash, p.checkout, p.user, p.sku, p.price, p.amount, p.currency, p.live, p.status]);
}
export async function member(client, user, sku = 'plus_monthly', live = false) {
    const intent = await register(client, user, sku, live);
    const subscription = unique('sub_NATIVE');
    const lease = await scalar(client, 'select public.acquire_stripe_reconciliation($1,$2) as result', [subscription, live]);
    assert.ok(lease.token);
    const now = Date.now();
    return { ...intent, subscription, token: lease.token,
        start: new Date(now - 86400000).toISOString(), end: new Date(now + 29 * 86400000).toISOString() };
}
export async function snapshot(client, member, event = unique('evt_SNAPSHOT'), changes = {}) {
    const p = { ...member, event, hash: HASH, status: 'active', paid: true, currentPrice: member.price, ...changes };
    const result = await scalar(client, `select public.apply_stripe_canonical_membership_snapshot(
        $1,$2,'invoice.paid',100,clock_timestamp(),$3,$4,$5,$6,$7,$8,$9,$10,$11,false,$12) as result`,
        [p.event, p.hash, p.subscription, p.checkout, `cus_${p.user}`, p.user, p.currentPrice, p.status, p.end, p.live, p.paid, p.token]);
    return { result, event: p.event };
}
export async function paidPeriod(client, member, event, changes = {}) {
    const p = { ...member, event, hash: HASH, ...changes };
    return scalar(client, 'select public.apply_stripe_commerce_paid_period($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) as result',
        [p.event, p.hash, p.subscription, p.checkout, p.user, p.sku, p.price, p.start, p.end, p.live, p.token]);
}
export function historicalPeriods(member) {
    const now = Date.now();
    const earlier = { ...member, start: new Date(now - 45 * 86400000).toISOString(), end: new Date(now - 15 * 86400000).toISOString() };
    return [earlier, { ...earlier, start: earlier.end, end: new Date(now + 15 * 86400000).toISOString() }];
}
export function reverse(client, member, currentInvoice = 'in_FIRST', periodEnd = member.end, event = unique('evt_REFUND')) {
    return scalar(client, `select public.apply_stripe_canonical_membership_reversal(
        $1,$2,'charge.refunded',$3,'in_FIRST',$4,$5,$6,$7,$8,$9,$10) as result`,
        [event, HASH, member.subscription, currentInvoice, member.checkout, `cus_${member.user}`, member.user, periodEnd, member.live, member.token]);
}
export function cpuMatch(user, owner) { const id = randomUUID(); return { id, user, owner, cpu: `ai:${id}` }; }
export const admit = (client, m) => scalar(client, 'select public.admit_ranked_match($1,$2,$3,600,$4,$3,1200,4) as result', [m.id, m.user, m.cpu, m.owner]);
export const voidMatch = (client, m) => scalar(client, 'select public.void_ranked_admission($1,$2) as result', [m.id, m.owner]);
export const settle = (client, m) => scalar(client, `select public.settle_ranked_match($1,$2,$3,'WHITE',600,$3,1200,4,'[]',$4) as result`, [m.id, m.user, m.cpu, m.owner]);
