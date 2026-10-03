// Disposable PGlite regression for the additive cancellation/portal migration.
// Never connects to or mutates Supabase production.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';

const require = createRequire(new URL('../../scratch/ticket-sql/package.json', import.meta.url));
const { PGlite } = require('@electric-sql/pglite');
const db = await PGlite.create();

try {
    await db.exec(`
        create role anon; create role authenticated; create role service_role bypassrls;
        create table public.profiles(id text primary key);
        create table public.account_deletion_jobs(user_id text, phase text);
        create table public.stripe_checkout_intents(
            checkout_id text primary key, user_id text, price_id text, livemode boolean);
        create table public.stripe_customer_links(customer_id text primary key, user_id text);
        create table public.stripe_memberships(
            subscription_id text primary key, checkout_id text, customer_id text,
            user_id text, current_price_id text, status text, period_end timestamptz,
            refund_blocked_until timestamptz, event_created bigint,
            observed_at timestamptz, updated_at timestamptz);
        create table public.stripe_webhook_receipts(event_id text primary key, payload_hash text);
        grant usage on schema public to anon, authenticated, service_role;
        grant all on all tables in schema public to service_role;
        insert into public.profiles values ('Alice');
        insert into public.stripe_checkout_intents values
            ('cs_test_ABCDEFGH','Alice','price_TEST1234',false),
            ('cs_live_ABCDEFGH','Alice','price_1ULM9fQWzwYDIuXWgs5Uj3yt',true);
        insert into public.stripe_customer_links values
            ('cus_TEST1234','Alice'),('cus_LIVE1234','Alice');
        insert into public.stripe_memberships values
            ('sub_TEST1234','cs_test_ABCDEFGH','cus_TEST1234','Alice',
                'price_TEST1234','active',now()+interval '30 days',null,100,now(),now()),
            ('sub_LIVE1234','cs_live_ABCDEFGH','cus_LIVE1234','Alice',
                'price_1ULM9fQWzwYDIuXWgs5Uj3yt','active',now()+interval '30 days',null,100,now(),now());

        create function public.apply_stripe_membership_snapshot(
            p_event_id text, p_event_payload_hash text, p_event_type text,
            p_event_created bigint, p_observed_at timestamptz,
            p_subscription_id text, p_checkout_id text, p_customer_id text,
            p_user_id text, p_price_id text, p_status text, p_period_end timestamptz,
            p_livemode boolean, p_paid_new_period boolean
        ) returns jsonb language plpgsql as $$
        declare v_hash text; v_applied boolean := false;
        begin
            select payload_hash into v_hash from public.stripe_webhook_receipts
                where event_id=p_event_id;
            if found then
                if v_hash <> p_event_payload_hash then raise exception 'collision'; end if;
                return jsonb_build_object('applied',false,'duplicate',true);
            end if;
            update public.stripe_memberships set status=p_status,
                current_price_id=p_price_id, period_end=p_period_end,
                event_created=p_event_created, observed_at=p_observed_at
            where subscription_id=p_subscription_id and event_created <= p_event_created;
            v_applied := found;
            insert into public.stripe_webhook_receipts values(p_event_id,p_event_payload_hash);
            return jsonb_build_object('applied',v_applied,'duplicate',false);
        end $$;
        create function public.apply_stripe_live_membership_snapshot(
            p_event_id text, p_event_payload_hash text, p_event_type text,
            p_event_created bigint, p_observed_at timestamptz,
            p_subscription_id text, p_checkout_id text, p_customer_id text,
            p_user_id text, p_price_id text, p_status text, p_period_end timestamptz,
            p_paid_new_period boolean
        ) returns jsonb language sql as $$
            select public.apply_stripe_membership_snapshot($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,true,$13)
        $$;
        create function public.stripe_member_status(p_user_id text)
        returns jsonb language sql as $$
            select jsonb_build_object('userId',p_user_id,'active',exists (
                select 1 from public.stripe_memberships m
                join public.stripe_checkout_intents i on i.checkout_id=m.checkout_id
                where m.user_id=p_user_id and not i.livemode
                    and m.status='active' and m.period_end>now()),
                'periodEnd',null,'tickets',jsonb_build_object('ranked',0,'hint',0))
        $$;
        create function public.stripe_live_member_status(p_user_id text)
        returns jsonb language sql as $$
            select jsonb_build_object('userId',p_user_id,'active',exists (
                select 1 from public.stripe_memberships m
                join public.stripe_checkout_intents i on i.checkout_id=m.checkout_id
                where m.user_id=p_user_id and i.livemode
                    and m.status='active' and m.period_end>now()),
                'periodEnd',null,'tickets',jsonb_build_object('ranked',0,'hint',0))
        $$;
        create function public.claim_stripe_member_daily_grant(p_user_id text)
        returns jsonb language sql as $$
            select public.stripe_member_status(p_user_id) || '{"claimed":false}'::jsonb
        $$;
        create function public.claim_stripe_live_member_daily_grant(p_user_id text)
        returns jsonb language sql as $$
            select public.stripe_live_member_status(p_user_id) || '{"claimed":false}'::jsonb
        $$;
        create function public.stripe_portal_customer_for_user(p_user_id text)
        returns jsonb language sql as $$
            select jsonb_build_object('manageable',false)
        $$;
    `);
    await db.exec(await readFile(new URL('../../supabase/migrations/20260930141357_stripe_scheduled_cancellation_projection.sql', import.meta.url), 'utf8'));
    await db.exec('set role service_role');

    const args = (mode, eventId, timestamp, cancel) => [
        eventId, 'a'.repeat(64), 'customer.subscription.updated', timestamp,
        new Date().toISOString(), `sub_${mode.toUpperCase()}1234`,
        `cs_${mode}_ABCDEFGH`, `cus_${mode.toUpperCase()}1234`, 'Alice',
        mode === 'live' ? 'price_1ULM9fQWzwYDIuXWgs5Uj3yt' : 'price_TEST1234',
        'active', new Date(Date.now() + 30 * 86400_000).toISOString(), false, cancel,
    ];
    const apply = async (mode, eventId, timestamp, cancel) => {
        const a = args(mode, eventId, timestamp, cancel);
        const name = mode === 'live'
            ? 'apply_stripe_live_membership_snapshot_with_schedule'
            : 'apply_stripe_membership_snapshot_with_schedule';
        const sql = mode === 'live'
            ? `select public.${name}($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) as result`
            : `select public.${name}($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,false,$13,$14) as result`;
        return (await db.query(sql, a)).rows[0].result;
    };
    for (const mode of ['test', 'live']) {
        const statusName = mode === 'live'
            ? 'stripe_live_member_status_with_schedule' : 'stripe_member_status_with_schedule';
        const claimName = mode === 'live'
            ? 'claim_stripe_live_member_daily_grant_with_schedule'
            : 'claim_stripe_member_daily_grant_with_schedule';
        assert.equal((await apply(mode, `evt_${mode}001`, 101, true)).applied, true);
        const status = (await db.query(`select public.${statusName}('Alice') as value`)).rows[0].value;
        assert.equal(status.active, true);
        assert.equal(status.cancelAtPeriodEnd, true);
        assert.equal((await db.query(`select public.${claimName}('Alice') as value`)).rows[0].value.cancelAtPeriodEnd, true);
        assert.equal((await apply(mode, `evt_${mode}001`, 101, false)).duplicate, true);
        assert.equal((await apply(mode, `evt_${mode}002`, 99, false)).applied, false);
        assert.equal((await db.query(`select public.${statusName}('Alice') as value`)).rows[0].value.cancelAtPeriodEnd, true);
        assert.equal((await apply(mode, `evt_${mode}003`, 101, false)).applied, true);
        assert.equal((await db.query(`select public.${statusName}('Alice') as value`)).rows[0].value.cancelAtPeriodEnd, false);
        const portal = (await db.query('select public.stripe_portal_customer_for_user($1,$2) as value',
            ['Alice', mode === 'live'])).rows[0].value;
        assert.equal(portal.manageable, true);
        assert.equal(portal.livemode, mode === 'live');
        assert.equal(portal.subscriptionId, `sub_${mode.toUpperCase()}1234`);
    }
    await db.exec('reset role');
    await db.exec('set role anon');
    await assert.rejects(db.query('select public.stripe_portal_customer_for_user($1,$2)', ['Alice', true]),
        /permission denied/i);
    await assert.rejects(db.query('select public.stripe_live_member_status_with_schedule($1)', ['Alice']),
        /permission denied/i);
    process.stdout.write('Stripe schedule SQL: passed (test/live, duplicate, stale, same-second, portal isolation, privilege)\n');
} catch (error) {
    process.stderr.write(`Stripe schedule SQL failed: ${error.message}\n`);
    process.exitCode = 1;
} finally {
    await db.close();
}
