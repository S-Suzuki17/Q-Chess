import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { setupStripeFixture, stripeMigrations } from './stripe-canonical-fixture.mjs';
const require = createRequire(new URL('../../scratch/ticket-sql/package.json', import.meta.url));
const { PGlite } = require('@electric-sql/pglite');
const name = '20260930144240_stripe_test_member_ticket_binding.sql';
const migration = await readFile(new URL('../../supabase/migrations/'+name,import.meta.url),'utf8');
for (const balance of [0, 3]) {
    const db = await PGlite.create();
    try {
        await setupStripeFixture(db, stripeMigrations.slice(0,stripeMigrations.indexOf(name)));
        await db.exec("insert into public.profiles(id) values('MigrationOwner');");
        await db.query('insert into public.ticket_wallets(user_id,ranked_tickets,hint_tickets,test_member_ranked_tickets,test_member_hint_tickets) values($1,11,12,$2,$2)', ['MigrationOwner',balance]);
        if (balance) {
            await assert.rejects(()=>db.exec(migration),/manual reconciliation/);
            await db.exec('rollback');
        } else await db.exec(migration);
        const row=(await db.query("select ranked_tickets,hint_tickets,test_member_ranked_tickets,test_member_hint_tickets from public.ticket_wallets where user_id='MigrationOwner'")).rows[0];
        assert.deepEqual(row,{ranked_tickets:11,hint_tickets:12,test_member_ranked_tickets:balance,test_member_hint_tickets:balance});
        const columns=(await db.query("select column_name from information_schema.columns where table_schema='public' and table_name='ticket_wallets' and column_name='test_member_ticket_subscription_id'")).rows;
        assert.equal(columns.length,balance?0:1);
        console.log(`PASS test balance ${balance}: ${balance?'migration rolled back without data loss':'binding added without changing free rewards'}`);
    } finally { await db.close(); }
}
