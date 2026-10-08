import { expect, it } from 'vitest';
import { applyMigrations, historicalCommerceDatabase, releaseCommerceMigrations } from './fixtures/commerceDatabaseFixture';

const MIGRATION = '20261006192347_durable_commerce_checkout_consent.sql';

it('backfills only provable original Checkout consent and preserves ambiguous receipts for review', async () => {
    const db = await historicalCommerceDatabase();
    const cases = ['valid', 'missing', 'beforePublication', 'afterCheckout'] as const;
    try {
        await applyMigrations(db, releaseCommerceMigrations.filter(name => name < MIGRATION));
        await db.exec("insert into public.stripe_commerce_price_bindings values('hints_13','price_UpgradeConsent',false)");
        for (const user of cases) {
            await db.query('insert into public.profiles(id) values($1)', [user]);
            await db.query("insert into public.account_terms_consents(user_id,version) values($1,'2026-10-03.1')", [user]);
            await db.exec('set role service_role');
            await db.query(`select public.register_stripe_commerce_checkout_intent(
                $1,$2,'hints_13','price_UpgradeConsent',1000,'usd',false,clock_timestamp()+interval '1 hour')`, [user, `cs_test_${user}`]);
            await db.exec('reset role');
        }
        await db.exec(`delete from public.account_terms_consents where user_id='missing';
            update public.account_terms_consents set accepted_at='2026-10-02T14:59:59Z' where user_id='beforePublication';
            update public.account_terms_consents c set accepted_at=i.created_at+interval '1 second'
                from public.stripe_commerce_checkout_intents i where c.user_id='afterCheckout' and i.user_id=c.user_id;`);
        const originals = (await db.query('select * from public.stripe_commerce_checkout_intents order by user_id')).rows;
        await applyMigrations(db, [MIGRATION]);
        const upgraded = (await db.query('select * from public.stripe_commerce_checkout_intents order by user_id')).rows;
        for (const row of upgraded) {
            const { terms_version, terms_accepted_at, terms_effective_date, ...intent } = row;
            expect(intent).toEqual(originals.find(original => original.user_id === row.user_id));
            if (row.user_id === 'valid') {
                expect(terms_version).toBe('2026-10-03.1');
                expect(terms_effective_date).toEqual(new Date('2026-10-03T00:00:00Z'));
                expect(terms_accepted_at).not.toBeNull();
            } else {
                expect([terms_version, terms_accepted_at, terms_effective_date]).toEqual([null, null, null]);
            }
        }
        // Even valid present-day consent cannot retroactively authorize an
        // ambiguous old Checkout when its exact registration is retried.
        const ambiguous = upgraded.find(row => row.user_id === 'afterCheckout')!;
        await db.exec('set role service_role');
        await expect(db.query(`select public.register_stripe_commerce_checkout_intent(
            $1,$2,'hints_13','price_UpgradeConsent',1000,'usd',false,$3)`,
        [ambiguous.user_id, ambiguous.checkout_id, ambiguous.expires_at])).rejects.toThrow('COMMERCE_RECONCILIATION_REVIEW_REQUIRED');
        await db.exec('reset role');
        await db.exec('update public.current_terms_policy set effective_date=null; set role service_role');
        for (const user of cases) {
            const fulfill = () => db.query<{ result: { applied: boolean; credited: number; duplicate?: boolean } }>(
                'select public.fulfill_stripe_commerce_one_time($1::jsonb) as result', [JSON.stringify({
                    eventId: `evt_Upgrade${user}`, payloadHash: 'a'.repeat(64), checkoutId: `cs_test_${user}`,
                    userId: user, sku: 'hints_13', priceId: 'price_UpgradeConsent', amountTotal: 1000,
                    currency: 'usd', livemode: false, paymentStatus: 'paid',
                })]);
            if (user === 'valid') {
                expect((await fulfill()).rows[0].result).toMatchObject({ applied: true, credited: 13 });
                expect((await fulfill()).rows[0].result).toMatchObject({ duplicate: true, credited: 0 });
            } else {
                await expect(fulfill()).rejects.toThrow('COMMERCE_RECONCILIATION_REVIEW_REQUIRED');
                expect((await db.query('select * from public.stripe_commerce_event_receipts where event_id=$1', [`evt_Upgrade${user}`])).rows).toEqual([]);
                expect((await db.query('select * from public.stripe_commerce_consumed_checkouts where checkout_id=$1', [`cs_test_${user}`])).rows).toEqual([]);
                expect((await db.query('select * from public.ticket_wallets where user_id=$1', [user])).rows).toEqual([]);
            }
        }
    } finally { await db.close(); }
}, 60_000);

for (const live of [false, true]) it(`publishes 2026-10-07.1 with explicit re-consent and immutable prior paid contracts (${live ? 'live' : 'test'})`, async () => {
    const release = '20261007124401_commerce_terms_release_20261007.sql';
    const db = await historicalCommerceDatabase();
    const scalar = async (sql: string, params: unknown[] = []) => (await db.query<{ result: any }>(sql, params)).rows[0]?.result;
    try {
        await applyMigrations(db, releaseCommerceMigrations.filter(name => name < release));
        await db.exec(`insert into public.profiles(id) values('TermsUpgrade');
            insert into public.account_terms_consents(user_id,version) values('TermsUpgrade','2026-09-25.1'),('TermsUpgrade','2026-10-03.1');
            insert into public.ticket_wallets(user_id,ranked_tickets,hint_tickets) values('TermsUpgrade',20,20);`);
        await db.query("insert into public.stripe_commerce_price_bindings values('hints_13','price_TermsUpgrade',$1)", [live]);
        const oldCheckout = `cs_${live ? 'live' : 'test'}_TermsOld`;
        const register = (checkout: string) => db.query(`select public.register_stripe_commerce_checkout_intent(
            'TermsUpgrade',$1,'hints_13','price_TermsUpgrade',1000,'usd',$2,clock_timestamp()+interval '1 hour')`, [checkout, live]);
        await db.exec('set role service_role'); await register(oldCheckout);
        const consentBefore = (await db.query('select * from public.account_terms_consents order by version')).rows;
        const checkoutBefore = (await db.query('select * from public.stripe_commerce_checkout_intents')).rows;
        const walletBefore = (await db.query('select * from public.ticket_wallets')).rows;
        await db.exec('reset role'); await applyMigrations(db, [release]); await db.exec('set role service_role');
        expect((await db.query('select * from public.account_terms_consents order by version')).rows).toEqual(consentBefore);
        expect((await db.query('select * from public.stripe_commerce_checkout_intents')).rows).toEqual(checkoutBefore);
        expect((await db.query('select * from public.ticket_wallets')).rows).toEqual(walletBefore);
        expect(await scalar("select public.current_account_terms_status('TermsUpgrade') as result")).toMatchObject({
            currentVersion: '2026-10-07.1', effectiveDate: '2026-10-07', effective: true, consent: null,
        });
        expect(await scalar("select public.has_current_ticket_terms('TermsUpgrade') as result")).toBe(false);
        await expect(db.query("select public.accept_current_account_terms('TermsUpgrade','2026-10-03.1')")).rejects.toThrow('Current terms not effective');
        await expect(db.query("select public.claim_daily_login_reward('TermsUpgrade')")).rejects.toThrow('Reward account unavailable');
        await expect(register(`cs_${live ? 'live' : 'test'}_TermsDenied`)).rejects.toThrow('Checkout account unavailable');
        // A previously accepted, already-paid order still uses its original
        // snapshot, without turning that snapshot into acceptance of new terms.
        expect(await scalar('select public.fulfill_stripe_commerce_one_time($1::jsonb) as result', [JSON.stringify({
            eventId: 'evt_TermsOldPaid', payloadHash: 'a'.repeat(64), checkoutId: oldCheckout,
            userId: 'TermsUpgrade', sku: 'hints_13', priceId: 'price_TermsUpgrade', amountTotal: 1000,
            currency: 'usd', livemode: live, paymentStatus: 'paid',
        })])).toMatchObject({ applied: true, credited: 13 });
        expect(await scalar("select public.has_current_ticket_terms('TermsUpgrade') as result")).toBe(false);
        const accepted = await scalar("select public.accept_current_account_terms('TermsUpgrade','2026-10-07.1') as result");
        expect(accepted.consent.version).toBe('2026-10-07.1');
        expect(await scalar("select public.accept_current_account_terms('TermsUpgrade','2026-10-07.1') as result")).toEqual(accepted);
        expect(await scalar("select public.claim_daily_login_reward('TermsUpgrade') as result")).toMatchObject({rewardPolicyVersion: 2, credited: {ranked: 1, hint: 0}});
        const newCheckout = `cs_${live ? 'live' : 'test'}_TermsNew`; await register(newCheckout);
        expect((await db.query('select terms_version,terms_effective_date from public.stripe_commerce_checkout_intents where checkout_id=$1',[newCheckout])).rows[0])
            .toMatchObject({terms_version:'2026-10-07.1',terms_effective_date:new Date('2026-10-07T00:00:00Z')});
        expect((await db.query('select * from public.stripe_commerce_checkout_intents where checkout_id=$1',[oldCheckout])).rows).toEqual(checkoutBefore);
        expect((await db.query("select * from public.account_terms_consents where version<>'2026-10-07.1' order by version")).rows).toEqual(consentBefore);
        await expect(db.query("update public.current_terms_policy set effective_date=null")).rejects.toThrow(/permission denied/);
        for(const role of ['anon','authenticated']) {
            await db.exec(`reset role; set role ${role}`);
            await expect(db.query("select public.accept_current_account_terms('TermsUpgrade','2026-10-07.1')")).rejects.toThrow(/permission denied/);
        }
        await db.exec('reset role');
        await expect(db.query("update public.current_terms_policy set version='2026-10-03.1'")).rejects.toThrow(/check constraint/);
    } finally { await db.close(); }
}, 60_000);