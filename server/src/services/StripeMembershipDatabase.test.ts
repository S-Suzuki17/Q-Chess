import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { applyMigrations, historicalCommerceDatabase, historicalCommerceMigrations, releaseCommerceMigrations } from './fixtures/commerceDatabaseFixture';

const MAX = 9007199254740991;
const HASH = 'a'.repeat(64);
const LEGACY = 'price_1ULM9fQWzwYDIuXWgs5Uj3yt';
const specs = [
    ['standard_monthly', 300, 0], ['plus_monthly', 600, 0],
    ['hints_1', 100, 1], ['hints_13', 1000, 13], ['hints_27', 2000, 27],
    ['hints_44', 3000, 44], ['hints_77', 5000, 77], ['hints_166', 10000, 166],
] as const;
const price = (sku: string) => `price_${sku.replaceAll('_', '')}`;
let db: PGlite;
let next = 0;
let admissionBefore: string;
let constraintsBefore: unknown[];
const scalar = async <T = any>(sql: string, values: unknown[] = []): Promise<T> => (await db.query<{ result: T }>(sql, values)).rows[0]?.result;
const wallet = (id = 'Alice') => scalar('select to_jsonb(w) as result from public.ticket_wallets w where user_id=$1', [id]);
const claim = (id = 'Alice') => scalar('select public.claim_daily_login_reward($1) as result', [id]);
async function owner(sql: string, values: unknown[] = []) {
    await db.exec('reset role');
    try { return await db.query(sql, values); } finally { await db.exec('set role service_role'); }
}
// SAVEPOINT permits expected SQL errors without abandoning the test transaction.
async function denied(operation: () => Promise<unknown>, pattern: RegExp = /./) {
    await db.exec('savepoint rejected_action');
    try { await expect(operation()).rejects.toThrow(pattern); }
    finally { await db.exec('rollback to savepoint rejected_action'); }
}
async function bind(live = true) {
    for (const [sku] of specs) await owner('insert into public.stripe_commerce_price_bindings values($1,$2,$3)', [sku, price(sku), live]);
}
async function register(sku = 'hints_13', live = true, user = 'Alice', checkout = `cs_${live ? 'live' : 'test'}_PURCHASE${++next}`) {
    const amount = specs.find(s => s[0] === sku)![1];
    await db.query(`select public.register_stripe_commerce_checkout_intent($1,$2,$3,$4,$5,'usd',$6,clock_timestamp()+interval '1 hour')`,
        [user, checkout, sku, price(sku), amount, live]);
    return { user, checkout, sku, price: price(sku), amount, live };
}
async function purchase(intent: Awaited<ReturnType<typeof register>>, event = `evt_PURCHASE${++next}`, changes: Record<string, unknown> = {}) {
    const p = { ...intent, event, hash: HASH, currency: 'usd', status: 'paid', ...changes };
    return scalar(`select public.apply_stripe_commerce_one_time_purchase($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) as result`,
        [p.event, p.hash, p.checkout, p.user, p.sku, p.price, p.amount, p.currency, p.live, p.status]);
}
async function member(sku = 'plus_monthly', live = true, user = 'Alice') {
    const intent = await register(sku, live, user);
    const subscription = `sub_MEMBER${++next}`;
    const lease = await scalar('select public.acquire_stripe_reconciliation($1,$2) as result', [subscription, live]);
    const start = new Date(Date.now() - 86400000).toISOString();
    const end = new Date(Date.now() + 29 * 86400000).toISOString();
    return { ...intent, subscription, token: lease.token, start, end };
}
async function snapshot(m: Awaited<ReturnType<typeof member>>, event = `evt_PERIOD${++next}`, changes: Record<string, unknown> = {}) {
    const p = { ...m, event, hash: HASH, status: 'active', paid: true, currentPrice: m.price, ...changes };
    const result = await scalar(`select public.apply_stripe_canonical_membership_snapshot(
        $1,$2,'invoice.paid',100,clock_timestamp(),$3,$4,$5,$6,$7,$8,$9,$10,$11,false,$12) as result`,
        [p.event, p.hash, p.subscription, p.checkout, `cus_${p.user}`, p.user, p.currentPrice, p.status, p.end, p.live, p.paid, p.token]);
    return { result, event: p.event as string };
}
async function paidPeriod(m: Awaited<ReturnType<typeof member>>, event: string, changes: Record<string, unknown> = {}) {
    const p = { ...m, event, hash: HASH, ...changes };
    return scalar(`select public.apply_stripe_commerce_paid_period($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) as result`,
        [p.event, p.hash, p.subscription, p.checkout, p.user, p.sku, p.price, p.start, p.end, p.live, p.token]);
}

describe('actual isolated PostgreSQL commerce migration chain', () => {
    beforeAll(async () => {
        db = await historicalCommerceDatabase();
        admissionBefore = await scalar("select pg_get_functiondef('public.admit_ranked_match(uuid,text,text,integer,uuid,text,integer,integer)'::regprocedure) as result");
        constraintsBefore = (await db.query(`select conrelid::regclass::text as name,conname,pg_get_constraintdef(oid) as definition
            from pg_constraint where conrelid in ('public.ticket_spend_receipts'::regclass,'public.ranked_match_allocations'::regclass,
            'public.ranked_ticket_refunds'::regclass,'public.cpu_hint_receipts'::regclass) and contype='c' order by 1,2`)).rows;
        // Existing capped wallet state survives upgrade exactly; no reset or guessed provenance.
        await db.exec(`insert into public.profiles(id) values('Upgrade');
            insert into public.ticket_wallets(user_id,ranked_tickets,hint_tickets,member_ranked_tickets,member_hint_tickets,
                test_member_ranked_tickets,test_member_hint_tickets,member_ticket_subscription_id,test_member_ticket_subscription_id) values('Upgrade',20,20,60,60,60,60,'sub_UpgradeLive','sub_UpgradeTest');`);
        await applyMigrations(db, releaseCommerceMigrations);
    }, 60_000);
    afterAll(async () => { await db?.close(); });
    beforeEach(async () => {
        await db.exec(`begin;
            insert into public.profiles(id) values('Alice'),('Bob');
            insert into public.account_terms_consents(user_id,version) values
                ('Alice','2026-09-25.1'),('Alice','2026-10-03.1'),('Bob','2026-09-25.1'),('Bob','2026-10-03.1');
            set role service_role;`);
    });
    afterEach(async () => { await db.exec('rollback; reset role'); });

    it('executes all 21 raw dependency-ordered migrations with real profiles and keeps all new sale gates closed', async () => {
        expect(historicalCommerceMigrations.length + releaseCommerceMigrations.length).toBe(21);
        expect(await scalar("select to_regclass('public.users')::text as result")).toBeNull();
        expect(await scalar('select public.stripe_commerce_protocol_version() as result')).toEqual({ version: 1, newSalesEnabled: false, spendingEnabled: false, reversalsReady: false });
        expect(await scalar('select count(*)::integer as result from public.stripe_commerce_price_bindings')).toBe(0);
        await denied(() => register(), /Unverified commerce SKU binding/);
        expect(await wallet('Upgrade')).toMatchObject({ ranked_tickets: 20, hint_tickets: 20, member_ranked_tickets: 60, member_hint_tickets: 60, test_member_ranked_tickets: 60, test_member_hint_tickets: 60 });
    });
    it('does not add ad-dependent ranked admission, invent pool labels, or relax receipt constraints', async () => {
        expect(await scalar("select pg_get_functiondef('public.admit_ranked_match(uuid,text,text,integer,uuid,text,integer,integer)'::regprocedure) as result")).toBe(admissionBefore);
        const after = (await db.query(`select conrelid::regclass::text as name,conname,pg_get_constraintdef(oid) as definition
            from pg_constraint where conrelid in ('public.ticket_spend_receipts'::regclass,'public.ranked_match_allocations'::regclass,
            'public.ranked_ticket_refunds'::regclass,'public.cpu_hint_receipts'::regclass) and contype='c' order by 1,2`)).rows;
        expect(after).toEqual(constraintsBefore);
    });
    it('cycles [1,1,2,2,3,3,3] and one day-seven hint, resets day eight and missed days, and deduplicates same-day claims', async () => {
        for (let day = 1; day <= 8; day++) {
            if (day > 1) await db.exec("update public.ticket_wallets set last_claim_utc_day=(clock_timestamp() at time zone 'UTC')::date-1 where user_id='Alice'");
            const result = await claim();
            expect(result.rewardPolicyVersion).toBe(2);
            expect(result.streakDays).toBe(day === 8 ? 1 : day);
            expect(result.credited).toEqual({ ranked: [1, 1, 2, 2, 3, 3, 3, 1][day - 1], hint: day === 7 ? 1 : 0 });
            expect((await claim()).claimed).toBe(false);
        }
        await db.exec("update public.ticket_wallets set last_claim_utc_day=(clock_timestamp() at time zone 'UTC')::date-3 where user_id='Alice'");
        expect((await claim()).streakDays).toBe(1);
        expect((await scalar("select public.daily_login_reward_status('Alice') as result")).rewardPolicyVersion).toBe(2);
        expect(await scalar('select public.daily_login_reward_protocol_version() as result')).toBe(2);
    });
    it('uses bigint storage beyond SMALLINT and product caps and enforces the safe integer domain', async () => {
        await claim();
        await db.exec("update public.ticket_wallets set member_ticket_subscription_id='sub_TestLive',test_member_ticket_subscription_id='sub_TestSandbox' where user_id='Alice'");
        await db.exec("update public.ticket_wallets set ranked_tickets=32767,hint_tickets=32767 where user_id='Alice'");
        await db.exec("update public.ticket_wallets set last_claim_utc_day=(clock_timestamp() at time zone 'UTC')::date-1 where user_id='Alice'");
        expect((await claim()).tickets.ranked).toBe(32768);
        for (const column of ['ranked_tickets', 'hint_tickets', 'member_ranked_tickets', 'member_hint_tickets', 'test_member_ranked_tickets', 'test_member_hint_tickets', 'purchased_hint_tickets', 'test_purchased_hint_tickets', 'subscription_hint_tickets', 'test_subscription_hint_tickets']) {
            await db.exec(`update public.ticket_wallets set ${column}=${MAX} where user_id='Alice'`);
            await denied(() => db.exec(`update public.ticket_wallets set ${column}=-1 where user_id='Alice'`), /check constraint/);
            await denied(() => db.exec(`update public.ticket_wallets set ${column}=9007199254740992 where user_id='Alice'`), /check constraint/);
        }
        await db.exec("update public.ticket_wallets set last_claim_utc_day=(clock_timestamp() at time zone 'UTC')::date-1 where user_id='Alice'");
        const before = await wallet();
        await denied(() => claim(), /Wallet arithmetic limit/);
        expect(await wallet()).toEqual(before);
    });
    it.each(specs.filter(s => s[0].startsWith('hints')))('fulfills exact SKU %s at %i cents for %i purchased hints', async (sku, amount, quantity) => {
        await bind();
        const intent = await register(sku);
        expect(intent.amount).toBe(amount);
        expect(await purchase(intent)).toEqual({ applied: true, duplicate: false, credited: quantity });
        expect(await wallet()).toMatchObject({ purchased_hint_tickets: quantity, hint_tickets: 0, member_hint_tickets: 0, subscription_hint_tickets: 0 });
    });
    it('deduplicates by checkout as well as event and rejects mismatched price, currency, amount, owner and unpaid events', async () => {
        await bind();
        const intent = await register();
        for (const change of [{ price: price('hints_1') }, { amount: 1 }, { currency: 'eur' }, { user: 'Bob' }, { status: 'unpaid' }, { sku: 'hints_166' }]) {
            await denied(() => purchase(intent, undefined, change), /Unbound|Invalid paid/);
        }
        const event = 'evt_SAMEEVENT';
        expect((await purchase(intent, event)).credited).toBe(13);
        expect((await purchase(intent, event)).duplicate).toBe(true);
        expect((await purchase(intent, 'evt_SECONDEVENT')).duplicate).toBe(true);
        expect((await wallet()).purchased_hint_tickets).toBe(13);
        await denied(() => purchase(intent, event, { hash: 'b'.repeat(64) }), /Commerce event collision/);
        const other = await register('hints_1');
        await denied(() => purchase(other, event), /Commerce event collision/);
    });
    it('rolls back event and purchase receipts on overflow so a valid retry can complete', async () => {
        await bind();
        const intent = await register();
        await claim();
        await db.exec(`update public.ticket_wallets set purchased_hint_tickets=${MAX - 12} where user_id='Alice'`);
        await denied(() => purchase(intent, 'evt_OVERFLOW'), /Wallet arithmetic limit/);
        expect(await scalar("select count(*)::integer as result from public.stripe_commerce_event_receipts where event_id='evt_OVERFLOW'")).toBe(0);
        expect(await scalar('select count(*)::integer as result from public.stripe_one_time_purchases')).toBe(0);
        await db.exec(`update public.ticket_wallets set purchased_hint_tickets=${MAX - 13} where user_id='Alice'`);
        expect((await purchase(intent, 'evt_OVERFLOW')).credited).toBe(13);
        expect((await wallet()).purchased_hint_tickets).toBe(MAX);
    });
    it('restores a free hint past old caps exactly once without changing purchased or Plus pools', async () => {
        await claim();
        await db.exec(`update public.ticket_wallets set hint_tickets=${MAX - 1},purchased_hint_tickets=13,subscription_hint_tickets=10 where user_id='Alice';
            insert into public.cpu_practice_sessions(session_id,user_id,rules_version,player_side,level,seconds,state,state_hash,white_ms,black_ms)
                values('11111111-1111-4111-8111-111111111111','Alice','quantum-practice-v1','white',1,600,'{}','${HASH}',600000,600000);
            insert into public.cpu_hint_receipts(request_id,user_id,session_id,revision,rules_version,session_hash,move,hint,pool)
                values('22222222-2222-4222-8222-222222222222','Alice','11111111-1111-4111-8111-111111111111',0,'quantum-practice-v1','${HASH}','{}','{}','free');`);
        const restore = () => scalar("select public.restore_cpu_hint_credit('22222222-2222-4222-8222-222222222222','Alice','unrecoverable_delivery') as result");
        expect(await restore()).toBe(1);
        expect(await restore()).toBe(0);
        expect(await wallet()).toMatchObject({ hint_tickets: MAX, purchased_hint_tickets: 13, subscription_hint_tickets: 10 });
    });
    it('survives profile erasure without recreating purchased balance on delayed events', async () => {
        await bind();
        const intent = await register();
        await purchase(intent);
        await owner("delete from public.profiles where id='Alice'");
        expect(await purchase(intent, 'evt_AFTERERASURE')).toMatchObject({ retired: true, credited: 0 });
        expect(await wallet()).toBeUndefined();
        expect(await scalar('select count(*)::integer as result from public.stripe_commerce_consumed_checkouts')).toBe(1);
    });
    it.each(['standard_monthly', 'plus_monthly'])('projects %s unlimited ranked/ad-free only after one verified monthly period', async sku => {
        await bind();
        const m = await member(sku);
        const { event } = await snapshot(m);
        expect((await scalar("select public.stripe_commerce_status('Alice',true) as result")).active).toBe(false);
        expect((await paidPeriod(m, event)).credited).toBe(sku === 'plus_monthly' ? 10 : 0);
        expect(await scalar("select public.stripe_commerce_status('Alice',true) as result")).toMatchObject({ active: true, unlimitedRanked: true, adFree: true, sku });
        expect((await scalar("select public.claim_stripe_live_member_daily_grant('Alice') as result")).credited).toEqual({ ranked: 0, hint: 0 });
    });
    it('grants Plus ten once per subscription paid period across distinct events and grants the next non-overlapping period', async () => {
        await bind();
        const m = await member();
        m.start = new Date(Date.now() - 45 * 86400000).toISOString();
        m.end = new Date(Date.now() - 15 * 86400000).toISOString();
        const first = await snapshot(m, 'evt_FIRSTMONTH');
        expect((await paidPeriod(m, first.event)).credited).toBe(10);
        expect((await paidPeriod(m, first.event)).duplicate).toBe(true);
        const secondEvent = await snapshot(m, 'evt_SAMEMONTHOTHER');
        expect((await paidPeriod(m, secondEvent.event)).duplicate).toBe(true);
        expect((await wallet()).subscription_hint_tickets).toBe(10);
        const nextMonth = { ...m, start: m.end, end: new Date(Date.now() + 15 * 86400000).toISOString() };
        const second = await snapshot(nextMonth, 'evt_NEXTMONTH');
        expect((await paidPeriod(nextMonth, second.event)).credited).toBe(10);
        expect((await wallet()).subscription_hint_tickets).toBe(20);
    });
    it('backfills a missed earlier paid period after the next period grants, then replays the earlier period without another credit', async () => {
        await bind();
        const firstMonth = await member();
        const now = Date.now();
        firstMonth.start = new Date(now - 45 * 86400000).toISOString();
        firstMonth.end = new Date(now - 15 * 86400000).toISOString();
        const first = await snapshot(firstMonth, 'evt_DELAYEDFIRST');
        const secondMonth = { ...firstMonth, start: firstMonth.end, end: new Date(now + 15 * 86400000).toISOString() };
        const second = await snapshot(secondMonth, 'evt_GRANTEDSECOND');
        expect((await paidPeriod(secondMonth, second.event)).credited).toBe(10);
        expect((await wallet()).subscription_hint_tickets).toBe(10);
        expect((await paidPeriod(firstMonth, first.event)).credited).toBe(10);
        expect((await wallet()).subscription_hint_tickets).toBe(20);
        expect((await paidPeriod(firstMonth, first.event)).duplicate).toBe(true);
        expect((await wallet()).subscription_hint_tickets).toBe(20);
        expect(await scalar('select count(*)::integer as result from public.stripe_commerce_paid_periods')).toBe(2);
    });
    it('replays an already-granted earlier period after a later period without consulting current-period equality', async () => {
        await bind();
        const firstMonth = await member();
        const now = Date.now();
        firstMonth.start = new Date(now - 45 * 86400000).toISOString();
        firstMonth.end = new Date(now - 15 * 86400000).toISOString();
        const first = await snapshot(firstMonth, 'evt_EARLYGRANTEDFIRST');
        await paidPeriod(firstMonth, first.event);
        const secondMonth = { ...firstMonth, start: firstMonth.end, end: new Date(now + 15 * 86400000).toISOString() };
        const second = await snapshot(secondMonth, 'evt_LATERGRANTEDSECOND');
        await paidPeriod(secondMonth, second.event);
        expect((await paidPeriod(firstMonth, first.event)).duplicate).toBe(true);
        expect((await wallet()).subscription_hint_tickets).toBe(20);
        expect(await scalar('select count(*)::integer as result from public.stripe_commerce_paid_periods')).toBe(2);
    });
    it.each([
        ['before_renewal', false], ['before_renewal', true],
        ['after_renewal', false], ['after_renewal', true],
    ] as const)('honors durable %s reversal history when an earlier period was granted=%s', async (timing, alreadyGranted) => {
        await bind(false);
        const firstMonth = await member('plus_monthly', false);
        const now = Date.now();
        firstMonth.start = new Date(now - 45 * 86400000).toISOString();
        firstMonth.end = new Date(now - 15 * 86400000).toISOString();
        const first = await snapshot(firstMonth, 'evt_RISKFIRST');
        if (alreadyGranted) await paidPeriod(firstMonth, first.event);
        const secondMonth = { ...firstMonth, start: firstMonth.end, end: new Date(now + 15 * 86400000).toISOString() };
        const reverse = (currentInvoice: string, periodEnd: string) => scalar(`select public.apply_stripe_canonical_membership_reversal(
            'evt_REVERSEDMONTHA',$1,'charge.refunded',$2,'in_MONTHA',$3,$4,$5,$6,$7,false,$8) as result`,
            [HASH, firstMonth.subscription, currentInvoice, firstMonth.checkout, `cus_${firstMonth.user}`, firstMonth.user, periodEnd, firstMonth.token]);
        if (timing === 'before_renewal') {
            expect((await reverse('in_MONTHA', firstMonth.end)).blocked).toBe(true);
            expect(await scalar('select refund_blocked_until is not null as result from public.stripe_memberships where subscription_id=$1', [firstMonth.subscription])).toBe(true);
        }
        const second = await snapshot(secondMonth, 'evt_RISKSECOND');
        expect(await scalar('select refund_blocked_until as result from public.stripe_memberships where subscription_id=$1', [firstMonth.subscription])).toBeNull();
        expect((await paidPeriod(secondMonth, second.event)).credited).toBe(10);
        if (timing === 'after_renewal') expect((await reverse('in_MONTHB', secondMonth.end)).blocked).toBe(false);
        expect(await scalar('select count(*)::integer as result from public.stripe_reversal_receipts where subscription_id=$1', [firstMonth.subscription])).toBe(1);
        const balance = alreadyGranted ? 20 : 10;
        expect((await wallet()).test_subscription_hint_tickets).toBe(balance);
        if (alreadyGranted) expect(await paidPeriod(firstMonth, first.event)).toMatchObject({ duplicate: true, credited: 0 });
        else await denied(() => paidPeriod(firstMonth, first.event), /Canonical paid snapshot|Historical paid period requires risk review/);
        expect((await wallet()).test_subscription_hint_tickets).toBe(balance);
        expect(await scalar('select count(*)::integer as result from public.stripe_commerce_paid_periods')).toBe(alreadyGranted ? 2 : 1);
    });
    it.each(['missing_evidence', 'refund_blocked', 'deleted', 'retired', 'restricted', 'canceled', 'off_price'])(
        'does not backfill an old period through a %s barrier', async barrier => {
            await bind();
            const firstMonth = await member();
            const now = Date.now();
            firstMonth.start = new Date(now - 45 * 86400000).toISOString();
            firstMonth.end = new Date(now - 15 * 86400000).toISOString();
            const first = await snapshot(firstMonth, 'evt_BLOCKEDFIRST', { paid: barrier !== 'missing_evidence' });
            const secondMonth = { ...firstMonth, start: firstMonth.end, end: new Date(now + 15 * 86400000).toISOString() };
            const second = await snapshot(secondMonth, 'evt_BLOCKEDSECOND');
            await paidPeriod(secondMonth, second.event);
            if (barrier === 'refund_blocked') await owner('update public.stripe_memberships set refund_blocked_until=$2 where subscription_id=$1', [firstMonth.subscription, secondMonth.end]);
            if (barrier === 'deleted') await owner("delete from public.profiles where id='Alice'");
            if (barrier === 'retired') await owner('insert into public.stripe_retired_subscriptions(subscription_id,livemode) values($1,true)', [firstMonth.subscription]);
            if (barrier === 'restricted') await owner("insert into public.account_restrictions(user_id,blocked) values('Alice',true)");
            if (barrier === 'canceled') await snapshot(secondMonth, 'evt_CANCELAFTERSECOND', { status: 'canceled', paid: false });
            if (barrier === 'off_price') await snapshot(secondMonth, 'evt_OFFPRICEAFTERSECOND', { currentPrice: 'price_OTHER', paid: false });
            if (barrier === 'retired') expect(await paidPeriod(firstMonth, first.event)).toMatchObject({ retired: true, credited: 0 });
            else await denied(() => paidPeriod(firstMonth, first.event), /Canonical paid snapshot|Membership account unavailable/);
            expect(await scalar('select count(*)::integer as result from public.stripe_commerce_paid_periods')).toBe(1);
            if (barrier === 'deleted') expect(await wallet()).toBeUndefined();
            else expect((await wallet()).subscription_hint_tickets).toBe(10);
        });
    it('rejects period tampering, hash collisions and missing canonical evidence without changing balances', async () => {
        await bind();
        const m = await member();
        await denied(() => paidPeriod(m, 'evt_NOEVIDENCE'), /Canonical paid snapshot/);
        const unpaid = await snapshot(m, 'evt_ACTIVEUNPAID', { paid: false });
        await denied(() => paidPeriod(m, unpaid.event), /Canonical paid snapshot/);
        const { event } = await snapshot(m);
        await paidPeriod(m, event);
        await denied(() => paidPeriod(m, event, { start: new Date(Date.now() - 2 * 86400000).toISOString() }), /Paid period collision/);
        await denied(() => paidPeriod(m, event, { hash: 'b'.repeat(64) }), /Canonical paid snapshot/);
        const shifted = { ...m, start: new Date(Date.now() - 2 * 86400000).toISOString(), end: new Date(Date.now() + 28 * 86400000).toISOString() };
        const newer = await snapshot(shifted);
        await denied(() => paidPeriod(shifted, newer.event), /Overlapping paid period/);
        expect((await wallet()).subscription_hint_tickets).toBe(10);
    });
    it('rolls back an overflowing Plus period grant and credits it once after balance capacity is restored', async () => {
        await bind();
        const m = await member();
        const { event } = await snapshot(m);
        await claim();
        await db.exec(`update public.ticket_wallets set subscription_hint_tickets=${MAX - 9} where user_id='Alice'`);
        await denied(() => paidPeriod(m, event), /Wallet arithmetic limit/);
        expect(await scalar('select count(*)::integer as result from public.stripe_commerce_paid_periods')).toBe(0);
        await db.exec(`update public.ticket_wallets set subscription_hint_tickets=${MAX - 10} where user_id='Alice'`);
        expect((await paidPeriod(m, event)).credited).toBe(10);
        expect((await paidPeriod(m, event)).duplicate).toBe(true);
        expect((await wallet()).subscription_hint_tickets).toBe(MAX);
    });
    it('returns retired before any Plus wallet mutation and preserves business-period replay fences', async () => {
        await bind();
        const m = await member();
        const { event } = await snapshot(m);
        await owner('insert into public.stripe_retired_subscriptions(subscription_id,livemode) values($1,true)', [m.subscription]);
        expect((await paidPeriod(m, event)).retired).toBe(true);
        expect((await snapshot(m, 'evt_RETIRED')).result.retired).toBe(true);
        expect(await wallet()).toBeUndefined();
        expect(await scalar('select count(*)::integer as result from public.stripe_commerce_paid_periods')).toBe(0);
    });
    it('keeps existing legacy $2.99 in-flight Checkout and its refund handling working without wiping purchased/Plus stock', async () => {
        await bind();
        const pack = await register();
        await purchase(pack);
        await db.query("select public.register_stripe_live_checkout_intent('Alice','cs_live_LEGACY',$1,clock_timestamp()+interval '1 hour')", [LEGACY]);
        const lease = await scalar("select public.acquire_stripe_reconciliation('sub_LEGACY',true) as result");
        const m = { ...pack, checkout: 'cs_live_LEGACY', subscription: 'sub_LEGACY', price: LEGACY, token: lease.token, start: new Date(Date.now() - 86400000).toISOString(), end: new Date(Date.now() + 29 * 86400000).toISOString() };
        expect((await snapshot(m)).result.applied).toBe(true);
        expect((await scalar("select public.claim_stripe_live_member_daily_grant('Alice') as result")).credited).toEqual({ ranked: 3, hint: 3 });
        await db.exec("update public.ticket_wallets set member_ranked_tickets=61,member_hint_tickets=61,last_live_member_grant_utc_day=(clock_timestamp() at time zone 'UTC')::date-1 where user_id='Alice'");
        expect((await scalar("select public.claim_stripe_live_member_daily_grant('Alice') as result")).credited).toEqual({ ranked: 0, hint: 0 });
        expect(await wallet()).toMatchObject({ member_ranked_tickets: 61, member_hint_tickets: 61 });
        await db.exec("update public.ticket_wallets set subscription_hint_tickets=10 where user_id='Alice'");
        await scalar(`select public.apply_stripe_canonical_membership_reversal('evt_REFUNDLEGACY',$1,'charge.refunded',
            'sub_LEGACY','in_CURRENT','in_CURRENT','cs_live_LEGACY','cus_Alice','Alice',$2,true,$3) as result`, [HASH, m.end, m.token]);
        expect(await wallet()).toMatchObject({ purchased_hint_tickets: 13, subscription_hint_tickets: 10, member_hint_tickets: 0 });
        await snapshot(m, 'evt_LEGACYCANCELED', { status: 'canceled', paid: false });
        await scalar("select public.claim_stripe_live_member_daily_grant('Alice') as result");
        expect(await wallet()).toMatchObject({ purchased_hint_tickets: 13, subscription_hint_tickets: 10 });
    });
    it('isolates test-mode purchases and Plus grants from live balances and old sandbox daily grants', async () => {
        await bind(false);
        const pack = await register('hints_13', false);
        await purchase(pack);
        const m = await member('plus_monthly', false);
        const { event } = await snapshot(m);
        await paidPeriod(m, event);
        expect((await scalar("select public.claim_stripe_member_daily_grant('Alice') as result")).credited).toEqual({ ranked: 0, hint: 0 });
        expect(await wallet()).toMatchObject({ purchased_hint_tickets: 0, subscription_hint_tickets: 0, test_purchased_hint_tickets: 13, test_subscription_hint_tickets: 10 });
    });
    it('denies client roles and prevents service-role catalog or price-map changes', async () => {
        await denied(() => db.exec("update public.stripe_commerce_catalog set hint_quantity=166 where sku='hints_1'"), /permission denied/);
        await denied(() => db.exec("insert into public.stripe_commerce_price_bindings values('hints_1','price_ATTACK',true)"), /permission denied/);
        for (const role of ['anon', 'authenticated']) {
            await db.exec(`reset role; set role ${role}`);
            await denied(() => scalar('select public.stripe_commerce_protocol_version() as result'), /permission denied|Trusted service/);
            await denied(() => db.query('select * from public.stripe_one_time_purchases'), /permission denied/);
            await denied(() => db.query('select * from public.stripe_commerce_paid_periods'), /permission denied/);
        }
        await db.exec('reset role; set role service_role');
        expect(await scalar("select count(*)::integer as result from pg_proc where pronamespace='public'::regnamespace and proname like '%stripe_commerce%' and prosecdef")).toBe(0);
        expect(await scalar("select bool_and(relrowsecurity) as result from pg_class where relnamespace='public'::regnamespace and relname like 'stripe_commerce_%' and relkind='r'")).toBe(true);
    });
});
