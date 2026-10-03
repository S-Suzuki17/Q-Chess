// T0: disposable PostgreSQL smoke test, never a Supabase connection.
// Setup: npm install --prefix scratch/ticket-sql --save-exact @electric-sql/pglite@0.5.8 --ignore-scripts
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { setupRankedFixture } from './ranked-admission-fixture.mjs';

const require = createRequire(new URL('../../scratch/ticket-sql/package.json', import.meta.url));
const { PGlite } = require('@electric-sql/pglite');
const db = await PGlite.create();


try {
    await setupRankedFixture(db);
    const tables = ['ticket_wallets', 'stripe_checkout_intents', 'stripe_customer_links',
        'stripe_memberships', 'stripe_webhook_receipts', 'stripe_reversal_receipts',
        'ticket_spend_receipts', 'cpu_hint_receipts', 'ranked_match_admissions'];
    const rows = (await db.query(`select relname, relrowsecurity from pg_class
        where relnamespace='public'::regnamespace and relname=any($1::text[])`, [tables])).rows;
    assert.equal(rows.length, tables.length);
    assert.ok(rows.every(row => row.relrowsecurity));
    await db.exec('set role service_role');
    const claim = async () => (await db.query("select public.claim_daily_login_reward('Alice') as result")).rows[0].result;
    const first = await claim(), duplicate = await claim();
    assert.equal(first.claimed, true);
    assert.deepEqual(first.credited, { ranked: 1, hint: 2 });
    assert.equal(duplicate.claimed, false);
    assert.deepEqual(duplicate.credited, { ranked: 0, hint: 0 });
    assert.deepEqual(duplicate.tickets, first.tickets);
    await db.exec('reset role');
    for (const role of ['anon', 'authenticated']) {
        await db.exec(`set role ${role}`);
        await assert.rejects(() => db.query("select public.claim_daily_login_reward('Alice')"));
        await assert.rejects(() => db.query('select * from public.ticket_wallets'));
        await db.exec('reset role');
    }
    console.log('PASS: 12 migrations (ranked settlement plus 11 ticket migrations) in dependency order, wallet claim idempotency, RLS and client denial. Release readiness remains OFF.');
} finally {
    await db.close();
}
