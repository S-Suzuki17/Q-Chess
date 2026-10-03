// Disposable PGlite test; no Supabase connection or production data.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';

const require = createRequire(new URL('../../scratch/ticket-sql/package.json', import.meta.url));
const { PGlite } = require('@electric-sql/pglite');
const db = await PGlite.create();
const price = 'price_TEST1234';
const select = async sql => (await db.query(sql)).rows[0];
const wallet = () => select("select * from public.ticket_wallets where user_id='Alice'");
const status = async () => (await select("select public.stripe_member_status('Alice') as value")).value;
const claim = async () => (await select("select public.claim_stripe_member_daily_grant('Alice') as value")).value;

try {
    await db.exec(`
        create role anon; create role authenticated; create role service_role bypassrls;
        create table public.profiles(id text primary key);
        create table public.account_deletion_jobs(user_id text, phase text);
        create table public.account_restrictions(user_id text, blocked boolean);
        create table public.account_terms_consents(user_id text, version text);
        create table public.ticket_wallets(
            user_id text primary key references public.profiles(id),
            ranked_tickets integer not null default 0,
            hint_tickets integer not null default 0,
            last_member_grant_utc_day date,
            test_member_ranked_tickets integer not null default 0,
            test_member_hint_tickets integer not null default 0,
            member_ranked_tickets integer not null default 0,
            member_hint_tickets integer not null default 0,
            member_ticket_subscription_id text);
        create table public.stripe_checkout_intents(
            checkout_id text primary key, user_id text, price_id text, livemode boolean);
        create table public.stripe_memberships(
            subscription_id text primary key, checkout_id text, customer_id text,
            user_id text, current_price_id text, status text, period_end timestamptz,
            refund_blocked_until timestamptz);
        create function public.expire_stripe_member_tickets_on_projection()
        returns trigger language plpgsql as $$ begin return new; end $$;
        create trigger stripe_member_ticket_expiry
        after insert or update of status, refund_blocked_until, current_price_id
        on public.stripe_memberships for each row
        execute function public.expire_stripe_member_tickets_on_projection();
        create function public.stripe_member_status(p_user_id text)
        returns jsonb language sql as $$ select '{}'::jsonb $$;
        create function public.claim_stripe_member_daily_grant(p_user_id text)
        returns jsonb language sql as $$ select '{}'::jsonb $$;
        grant usage on schema public to anon, authenticated, service_role;
        grant all on all tables in schema public to service_role;
        insert into public.profiles values ('Alice');
        insert into public.account_terms_consents values ('Alice','2026-09-25.1');
        insert into public.ticket_wallets(user_id,ranked_tickets,hint_tickets,
            test_member_ranked_tickets,test_member_hint_tickets,member_ranked_tickets,
            member_hint_tickets,member_ticket_subscription_id)
            values('Alice',5,4,2,1,6,7,'sub_LIVE1234');
        insert into public.stripe_checkout_intents values
            ('cs_test_OLD1234','Alice','${price}',false),
            ('cs_test_NEW1234','Alice','${price}',false),
            ('cs_test_THIRD1234','Alice','${price}',false),
            ('cs_test_FOURTH1234','Alice','${price}',false),
            ('cs_live_LIVE1234','Alice','price_1ULM9fQWzwYDIuXWgs5Uj3yt',true);
        insert into public.stripe_memberships values
            ('sub_OLD1234','cs_test_OLD1234','cus_OLD1234','Alice',
                '${price}','active',now()+interval '30 days',null),
            ('sub_LIVE1234','cs_live_LIVE1234','cus_LIVE1234','Alice',
                'price_1ULM9fQWzwYDIuXWgs5Uj3yt','active',now()+interval '30 days',null);
    `);
    await db.exec(await readFile(new URL('../../supabase/migrations/20260930144240_stripe_test_member_ticket_binding.sql', import.meta.url), 'utf8'));
    await db.exec('set role service_role');

    // Unattributed pre-migration test rewards are invalidated; free/live stay.
    assert.equal((await wallet()).test_member_ranked_tickets, 0);
    assert.equal((await wallet()).ranked_tickets, 5);
    assert.equal((await wallet()).member_ranked_tickets, 6);
    assert.equal((await claim()).tickets.ranked, 3);
    assert.equal((await wallet()).test_member_ticket_subscription_id, 'sub_OLD1234');
    assert.equal((await status()).active, true);

    // Scheduled cancellation is not termination; the actual canceled event is.
    await db.exec("update public.stripe_memberships set status='canceled' where subscription_id='sub_OLD1234'");
    assert.equal((await status()).active, false);
    assert.equal((await status()).tickets.ranked, 0);
    assert.equal((await wallet()).test_member_ticket_subscription_id, null);
    assert.equal((await wallet()).ranked_tickets, 5);
    assert.equal((await wallet()).member_ranked_tickets, 6);

    await db.exec(`
        insert into public.stripe_memberships values
            ('sub_NEW1234','cs_test_NEW1234','cus_NEW1234','Alice',
                '${price}','active',now()+interval '30 days',null);
        update public.ticket_wallets set last_member_grant_utc_day=(clock_timestamp() at time zone 'UTC')::date - 1
            where user_id='Alice';
    `);
    assert.equal((await claim()).tickets.ranked, 3);
    assert.equal((await wallet()).test_member_ticket_subscription_id, 'sub_NEW1234');
    // A delayed terminal update for the old subscription cannot erase new rewards.
    await db.exec("update public.stripe_memberships set status='refunded', refund_blocked_until=now()+interval '30 days' where subscription_id='sub_OLD1234'");
    assert.equal((await wallet()).test_member_ranked_tickets, 3);
    // Current-period refund clears only the bound pool.
    await db.exec("update public.stripe_memberships set status='refunded', refund_blocked_until=now()+interval '30 days' where subscription_id='sub_NEW1234'");
    assert.equal((await wallet()).test_member_ranked_tickets, 0);
    assert.equal((await wallet()).member_ranked_tickets, 6);

    await db.exec(`
        insert into public.stripe_memberships values
            ('sub_THIRD1234','cs_test_THIRD1234','cus_THIRD1234','Alice',
                '${price}','active',now()+interval '30 days',null);
        update public.ticket_wallets set last_member_grant_utc_day=(clock_timestamp() at time zone 'UTC')::date - 1
            where user_id='Alice';
    `);
    assert.equal((await claim()).tickets.ranked, 3);
    await db.exec("update public.stripe_memberships set period_end=now()-interval '1 day' where subscription_id='sub_THIRD1234'");
    assert.equal((await status()).tickets.ranked, 0);
    assert.equal((await claim()).tickets.ranked, 0);
    assert.equal((await wallet()).test_member_ticket_subscription_id, null);

    await db.exec(`
        insert into public.stripe_memberships values
            ('sub_FOURTH1234','cs_test_FOURTH1234','cus_FOURTH1234','Alice',
                '${price}','active',now()+interval '30 days',null);
        update public.ticket_wallets set last_member_grant_utc_day=(clock_timestamp() at time zone 'UTC')::date - 1
            where user_id='Alice';
    `);
    assert.equal((await claim()).tickets.ranked, 3);
    // Temporary nonpayment suspends use without consuming or expiring tickets.
    await db.exec("update public.stripe_memberships set status='unpaid' where subscription_id='sub_FOURTH1234'");
    assert.equal((await status()).tickets.ranked, 0);
    assert.equal((await claim()).tickets.ranked, 0);
    assert.equal((await wallet()).test_member_ranked_tickets, 3);
    await db.exec("update public.stripe_memberships set status='active' where subscription_id='sub_FOURTH1234'");
    assert.equal((await status()).tickets.ranked, 3);
    // Off-price projection terminates eligibility and the bound test pool.
    await db.exec("update public.stripe_memberships set current_price_id='price_OTHER1234' where subscription_id='sub_FOURTH1234'");
    assert.equal((await wallet()).test_member_ranked_tickets, 0);
    assert.equal((await status()).tickets.ranked, 0);
    await db.exec('reset role');
    await db.exec('set role anon');
    await assert.rejects(db.query("select public.claim_stripe_member_daily_grant('Alice')"), /permission denied|trusted service/i);
    process.stdout.write('Test membership ticket SQL: passed (cancel, refund, rejoin, stale event, silent expiry, off-price, privilege)\n');
} catch (error) {
    process.stderr.write(`Test membership ticket SQL failed: ${error.message}\n`);
    process.exitCode = 1;
} finally {
    await db.close();
}
