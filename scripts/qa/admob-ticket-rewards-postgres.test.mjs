// DRAFT: Root integrates/reviews this file; the child agent did NOT run it.
// Run only through a Root-owned PostgreSQL 17 disposable loopback cluster.
// From repository cwd, after integration into scripts/qa or directly from outputs:
//   node --test <absolute draft file>
// The imported support hard-codes loopback commerce_upgrade and rejects hosted URLs.
// No process.env.DATABASE_URL, hosted dump, secrets, provider requests, real ads,
// purchases, Auth HTTP operations, source edits, or changes to existing QA inventory.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID, createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';

// BEGIN_DRAFT_SCOPE
export const DRAFT_SCOPE = {
  "contractRevision": "20261013-issuance-snapshot-terms-and-noAds",
  "rpc": {
    "protocol": "ad_ticket_reward_protocol()->2",
    "balance": "ad_ticket_reward_balance(text)->{hint:number,online:number}",
    "create": "create_ad_ticket_reward(text,text)->uuid",
    "status": "ad_ticket_reward_status(text,uuid)->pending|credited|missing",
    "credit": "credit_ad_ticket_reward(uuid,text,text,bigint,text)->{status:credited|duplicate|ignored}"
  },
  "accounting": {
    "hint": "ticket_wallets.hint_tickets+3",
    "online": "ticket_wallets.ranked_tickets+3",
    "max": 9007199254740991
  },
  "lockOrder": [
    "current profile guard",
    "qg-verified-ad:admob:transaction advisory",
    "intent",
    "wallet"
  ],
  "migration": "20261013075925_admob_verified_ticket_rewards.sql",
  "explicitOtherForwardFiles": [
    "20261008054904_match_hint_tickets_and_free_practice.sql",
    "20261008093454_email_account_registration.sql",
    "20261013040752_play_commerce_ledger.sql",
    "20261013071700_conventional_registration_repair.sql"
  ],
  "playMigrationApplied": false,
  "cases": [
    "strict-public-baseline-raw-forward-preservation",
    "service-protocol-free-balance-owned-status",
    "fixed-three-credit-and-snapshot",
    "exact-duplicate-and-changed-binding-collision",
    "same-intent-same-transaction-contention",
    "same-intent-different-transaction-contention",
    "same-transaction-different-owner-kind-intent-contention",
    "independent-rewards-same-wallet-contention",
    "new-wallet-versus-existing-match-grant-fence-both-orders",
    "rollback-retry-no-ghost-receipt",
    "max-boundary-and-overflow-rollback",
    "max-boundary-two-backend-overflow",
    "credit-versus-daily-login-both-orders",
    "credit-versus-match-hint-both-orders",
    "credit-versus-explicit-ranked-spend-both-orders",
    "credit-versus-shared-admission-both-orders",
    "deletion-before-credit",
    "credit-before-deletion",
    "pending-intent-erasure",
    "same-id-reregistration-and-anonymous-tombstone",
    "issuance-versus-paid-activation-both-orders",
    "earned-credit-versus-paid-activation-both-orders",
    "paid-new-intent-denied",
    "earned-credit-after-current-consent-and-policy-change",
    "credit-versus-paid-purchase-refund-both-orders",
    "test-and-legacy-pool-separation",
    "current-restriction-and-account-deletion-guards",
    "timestamp-window-and-seven-day-receive-limit",
    "deadline-after-actual-profile-lock-wait",
    "unknown-intent-ignored-no-award",
    "invalid-input-no-award",
    "non-read-committed-rejected",
    "service-only-rpc-and-table-authority"
  ],
  "limitations": [
    "Draft only; not executed by child agent.",
    "No Google signature, SDK, device, actual ad, hosted schema equivalence, external provider or deployment proof.",
    "Ad OFF routing behavior requires Root's separate HTTP fixture; this is SQL-only.",
    "Public baseline dependencies and explicit forward files only; old ad_allowances migration is never installed."
  ]
};
// END_DRAFT_SCOPE
const scopeSha256 = createHash('sha256').update(JSON.stringify(DRAFT_SCOPE)).digest('hex');
const root = resolve(process.cwd());
const sourceURL = name => pathToFileURL(join(root, name));
const support = await import(sourceURL('scripts/qa/commerce-postgres-support.mjs').href);
const baseline = await import(sourceURL('scripts/qa/fixtures/commerce-postgres-baseline.mjs').href);
const sessionFixture = await import(sourceURL('scripts/qa/fixtures/session-postgres-baseline.mjs').href);
const {
    connect, scalar, wallet, account, bind, member, snapshot, paidPeriod, register,
    purchase, contended, MAX, HASH, LEGACY_PRICE, unique, claim
} = support;
const { setupBaseline, historical, baselineEvidence } = baseline;
const { combinedPendingMigrations, hintPolicyMigrations, emailRegistrationMigrations, learningMigrations, googleAccountMigrations } = sessionFixture;
const MIGRATION = DRAFT_SCOPE.migration;
const PLAY_PARALLEL = '20261013040752_play_commerce_ledger.sql';
const REGISTRATION_REPAIR = '20261013071700_conventional_registration_repair.sql';
// Keep the existing PR19 thirteen-file and public historical lists unchanged.
// PLAY_PARALLEL is explicitly accounted for in inventory but NOT applied or tested
// by this Ad-only suite. At drafting time it is an unrelated parallel WIP file.
const preceding = [...combinedPendingMigrations, ...hintPolicyMigrations,
    ...emailRegistrationMigrations, REGISTRATION_REPAIR,'20261013075800_preserve_legacy_ad_reward_intents.sql'].sort();
const TERMS_RELEASE = '20261013115237_play_commerce_terms_release.sql';
// The learning suite exercises its forward migration; this historical Ad-only proof keeps its boundary.
const reviewedInventory = [...preceding, PLAY_PARALLEL, MIGRATION, TERMS_RELEASE,'20261013135400_play_pending_refund_state.sql',...learningMigrations,...googleAccountMigrations].sort();
const migrationText = name => readFile(sourceURL('supabase/migrations/' + name), 'utf8');
const hashTransaction = transaction => createHash('sha256').update('admob:' + transaction).digest('hex');
const errorCode = (promise, code) => assert.rejects(promise, { code });
const outcome = promise => promise.then(value => ({ value }), error => ({ error: { code: error.code, message: error.message } }));
const createIntent = (db, user, kind = 'hint') => scalar(db,
    'select public.create_ad_ticket_reward($1,$2) as result', [user, kind]);
const balance = (db, user) => scalar(db, 'select public.ad_ticket_reward_balance($1) as result', [user]);
const status = (db, user, intent) => scalar(db, 'select public.ad_ticket_reward_status($1,$2) as result', [user, intent]);
const credit = (db, reward) => scalar(db,
    'select public.credit_ad_ticket_reward($1,$2,$3,$4,$5) as result',
    [reward.intent, reward.kind, reward.transaction, reward.timestamp, reward.evidence]);
const receipt = (db, intent) => scalar(db,
    'select to_jsonb(r) as result from public.ad_ticket_reward_receipts r where intent_id=$1', [intent]);
const receiptCount = db => scalar(db, 'select count(*)::integer as result from public.ad_ticket_reward_receipts');
const intentRow = (db, id) => scalar(db, 'select to_jsonb(i) as result from public.ad_reward_intents i where id=$1', [id]);
const beginDeletion = (db, user, ticket) => scalar(db,
    'select public.begin_account_deletion($1,$2,null) as result', [user, ticket]);
const erase = (db, ticket) => scalar(db, 'select public.erase_account_data($1) as result', [ticket]);
const finishDeletion = (db, ticket) => scalar(db, 'select public.finish_account_deletion($1) as result', [ticket]);
const deletionTicket = () => randomUUID().replaceAll('-', '').repeat(2);
const protectedWalletColumns = [
    'member_ranked_tickets', 'member_hint_tickets', 'member_ticket_subscription_id',
    'test_member_ranked_tickets', 'test_member_hint_tickets', 'test_member_ticket_subscription_id',
    'purchased_hint_tickets', 'subscription_hint_tickets',
    'test_purchased_hint_tickets', 'test_subscription_hint_tickets',
    'last_claim_utc_day', 'streak_days'
];
const protectedValues = row => Object.fromEntries(protectedWalletColumns.map(key => [key, row[key]]));
const assertDelta = (before, after, kind, amount = 3) => {
    for (const key of Object.keys(before)) {
        if (key === (kind === 'hint' ? 'hint_tickets' : 'ranked_tickets')) {
            assert.equal(after[key], Number(before[key]) + amount, key);
        } else if (key !== 'updated_at') {
            assert.deepEqual(after[key], before[key], 'unexpected wallet mutation: ' + key);
        }
    }
};
const recordExistingGrant = (db, user, transaction, changes = {}) => {
    const p = { grant: randomUUID(), user, purpose: 'online_ranked_match', target: randomUUID(),
        provider: 'admob', transaction, evidence: HASH, ...changes };
    return scalar(db,
        'select public.record_verified_rewarded_ad($1,$2,$3,$4,$5,$6,$7,null) as result',
        [p.grant, p.user, p.purpose, p.target, p.provider, p.transaction, p.evidence]);
};
const hintPayload = user => ({
    request: randomUUID(), user, context: randomUUID(), kind: 'match', mode: 'ranked', side: 'white',
    revision: 0, stateHash: HASH, rules: 'quantum-match-v1',
    validUntil: new Date(Date.now() + 3600000).toISOString(),
    move: { pieceId: 'w_1', target: { row: 5, col: 0 } },
    hint: { fromRow: 6, fromCol: 0, toRow: 5, toCol: 0 }
});
const buyHint = (db, p) => scalar(db,
    'select public.buy_match_hint($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) as result',
    [p.request, p.user, p.context, p.kind, p.mode, p.side, p.revision, p.stateHash,
        p.rules, p.validUntil, JSON.stringify(p.move), JSON.stringify(p.hint)]);
const spendRanked = (db, user, event) => scalar(db,
    "select public.spend_game_tickets('ranked_match_start',$1,$2) as result", [event, [user]]);
const issueMatchConsent = (db, user, m) => scalar(db,
    "select public.issue_shared_match_consent($1,$2,$3,'ticket',null) as result", [m.token, user, m.id]);
const admitShared = (db, user, m) => scalar(db,
    "select public.admit_shared_match($1,$2,$3,600,$4,'ranked',$5,$3,1200,4) as result",
    [m.id, user, 'ai:' + m.id, m.owner, JSON.stringify({ [user]: m.token })]);
const terminalShared = (db, m) => scalar(db,
    "select public.void_ranked_admission($1,$2,'synthetic_ad_reward_qa_cleanup') as result", [m.id, m.owner]);
async function verifiedFixture(db, user, kind = 'hint') {
    const intent = await createIntent(db, user, kind);
    assert.match(intent, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    const timestamp = Number(await scalar(db,
        'select floor(extract(epoch from created_at)*1000)::bigint as result from public.ad_reward_intents where id=$1', [intent]));
    return { intent, kind, transaction: unique('SYNTHETIC_ADMOB_'), timestamp, evidence: HASH };
}
async function makeLegacy(admin, user) {
    const subscription = unique('sub_ADLEGACY');
    const checkout = unique('cs_live_ADLEGACY');
    const customer = unique('cus_ADLEGACY');
    await admin.query(
        "insert into public.stripe_checkout_intents(checkout_id,user_id,price_id,livemode,expires_at) values($1,$2,$3,true,clock_timestamp()+interval '1 hour')",
        [checkout, user, LEGACY_PRICE]);
    await admin.query('insert into public.stripe_customer_links(customer_id,user_id) values($1,$2)', [customer, user]);
    await admin.query(
        "insert into public.stripe_memberships(subscription_id,checkout_id,customer_id,user_id,current_price_id,status,period_end,event_created,observed_at) values($1,$2,$3,$4,$5,'active',clock_timestamp()+interval '1 day',1,clock_timestamp())",
        [subscription, checkout, customer, user, LEGACY_PRICE]);
    await admin.query(
        'update public.ticket_wallets set member_ranked_tickets=5,member_hint_tickets=7,member_ticket_subscription_id=$2 where user_id=$1',
        [user, subscription]);
    return subscription;
}
async function activatePaid(db, membership) {
    const s = await snapshot(db, membership);
    await paidPeriod(db, membership, s.event);
    assert.equal((await scalar(db, 'select public.get_shared_match_entitlement($1) as result', [membership.user])).noAds, true);
}
async function waitForActualLock(admin, first, second) {
    const until = Date.now() + 5000;
    while (Date.now() < until) {
        const row = (await admin.query(
            'select wait_event_type,pg_blocking_pids(pid) as blockers from pg_stat_activity where pid=$1', [second.fixturePid])).rows[0];
        if (row?.wait_event_type === 'Lock' && row.blockers.includes(first.fixturePid)) return;
        await delay(10);
    }
    assert.fail('No actual lock wait between independent PostgreSQL backends was observed');
}

test('DRAFT native PostgreSQL AdMob verified free-ticket rewards and erasure-safe replay fence',
    { timeout: 240000 }, async t => {
    const clients = [], checks = [], failures = [];
    let admin, a, b, nativeVersion, sourceSha256, completed = false;
    const open = async role => { const db = await connect(role); clients.push(db); return db; };
    const check = async (name, fn) => {
        await t.test(name, { timeout: 20000 }, async () => {
            try { await fn(); checks.push(name); }
            catch (error) { failures.push({ name, code: error.code, message: error.message }); throw error; }
        });
    };
    const rewardAccount = async (changes = {}) => {
        const user = await account(admin, { quota: 3, ...changes });
        return user;
    };
    try {
        admin = await open();
        await check('strict complete migration inventory; raw public dependency baseline and forward preserve existing wallet',
            async () => {
            const discovered = (await readdir(join(root, 'supabase/migrations')))
                .filter(name => name.endsWith('.sql') && name >= combinedPendingMigrations[0]).sort();
            assert.deepEqual(discovered, reviewedInventory,
                'Every discovered migration must remain explicitly reviewed; do not filter out unlisted files');
            assert.equal(combinedPendingMigrations.length, 13);
            assert.equal(combinedPendingMigrations.at(-1), '20261007141624_dormant_commerce_checkout_retirement.sql');
            nativeVersion = await setupBaseline(admin);
            for (const name of preceding) {
                const sql = await migrationText(name);
                assert.ok(sql.trim(), 'Refuse an EMPTY historical/forward dependency: ' + name);
                await admin.query(sql);
            }
            a = await open('service_role'); b = await open('service_role');
            assert.notEqual(a.fixturePid, b.fixturePid);
            await bind(admin);
            const oldUser = await account(admin, { ranked: 21 });
            await admin.query('update public.ticket_wallets set hint_tickets=61,purchased_hint_tickets=13,test_purchased_hint_tickets=17 where user_id=$1', [oldUser]);
            const before = await wallet(admin, oldUser);
            assert.equal(await scalar(admin, "select to_regclass('public.ad_allowances') as result"), null);
            assert.equal(await scalar(admin, "select to_regclass('public.ad_reward_intents') as result"), null);
            const sql = await migrationText(MIGRATION);
            assert.ok(sql.trim(), 'New Ad SQL is WIP/EMPTY: review final body before executing this draft');
            await admin.query(sql);
            assert.deepEqual(await wallet(admin, oldUser), before);
            assert.equal(await scalar(admin, "select to_regclass('public.ad_allowances') as result"), null);
            assert.equal(await scalar(a, 'select public.ad_ticket_reward_protocol() as result'), 2);
            const paths = [...historical, ...preceding, MIGRATION].map(name => 'supabase/migrations/' + name);
            paths.push('scripts/qa/commerce-postgres-support.mjs', 'scripts/qa/fixtures/commerce-postgres-baseline.mjs',
                'scripts/qa/fixtures/session-postgres-baseline.mjs', 'server/src/services/fixtures/commerceDatabaseFixture.ts');
            sourceSha256 = Object.fromEntries(await Promise.all(paths.map(async path => [
                path, createHash('sha256').update(await readFile(sourceURL(path))).digest('hex')
            ])));
        });
        assert.ok(a && b, 'A successful raw baseline/forward install is mandatory before testing');
        await check('balances expose only safe-number free pools; status is owned and reads never award', async () => {
            const user = await rewardAccount({ ranked: 23 }), other = await rewardAccount();
            await admin.query(
                'update public.ticket_wallets set hint_tickets=67,purchased_hint_tickets=31,subscription_hint_tickets=37,test_purchased_hint_tickets=41,test_subscription_hint_tickets=43 where user_id=$1',
                [user]);
            const before = await wallet(admin, user), count = await receiptCount(admin);
            assert.deepEqual(await balance(a, user), { hint: 67, online: 23 });
            const r = await verifiedFixture(a, user);
            assert.equal(await status(a, user, r.intent), 'pending');
            assert.equal(await status(a, other, r.intent), 'missing');
            assert.equal(await status(a, user, randomUUID()), 'missing');
            assert.deepEqual(await wallet(admin, user), before);
            assert.equal(await receiptCount(admin), count);
        });
        await check('issuance snapshots current terms and noAds false; hint and online each credit exactly three free tickets', async () => {
            for (const kind of ['hint', 'online']) {
                const user = await rewardAccount({ ranked: 19 });
                await admin.query('update public.ticket_wallets set hint_tickets=59 where user_id=$1', [user]);
                const r = await verifiedFixture(a, user, kind), row = await intentRow(admin, r.intent);
                assert.equal(row.user_id, user); assert.equal(row.kind, kind);
                assert.equal(row.terms_version, await scalar(admin, 'select version as result from public.current_terms_policy where singleton'));
                assert.ok(row.terms_accepted_at); assert.equal(row.eligible_no_ads, false);
                assert.equal(Date.parse(row.expires_at) - Date.parse(row.created_at), 3600000);
                const before = await wallet(admin, user);
                assert.equal((await credit(a, r)).status, 'credited');
                assertDelta(before, await wallet(admin, user), kind);
                const saved = await receipt(admin, r.intent);
                assert.equal(saved.amount, 3); assert.equal(saved.kind, kind);
                assert.equal(saved.transaction_sha256, hashTransaction(r.transaction));
                assert.equal(saved.evidence_sha256, r.evidence);
                assert.equal(await status(a, user, r.intent), 'credited');
            }
        });
        await check('exact replays award nothing; changed evidence, kind, intent or transaction collides', async () => {
            const user = await rewardAccount(), r = await verifiedFixture(a, user), count = await receiptCount(admin);
            await credit(a, r); const before = await wallet(admin, user);
            assert.equal((await credit(b, r)).status, 'duplicate');
            for (const changed of [
                { evidence: 'b'.repeat(64) }, { kind: 'online' },
                { intent: await createIntent(a, user, 'hint') }, { transaction: unique('SYNTHETIC_OTHER_') }
            ]) await errorCode(credit(a, { ...r, ...changed }), '23505');
            assert.deepEqual(await wallet(admin, user), before); assert.equal(await receiptCount(admin), count + 1);
        });
        await check('same intent and transaction in two real backends adds three once', async () => {
            const user = await rewardAccount(), r = await verifiedFixture(a, user);
            const values = await contended(admin, a, b, db => credit(db, r), db => credit(db, r));
            assert.deepEqual(values.map(v => v.status), ['credited', 'duplicate']);
            assert.equal((await balance(a, user)).hint, 3);
        });
        await check('different transactions for one intent contend and only one can credit', async () => {
            const user = await rewardAccount(), r = await verifiedFixture(a, user);
            const [, right] = await contended(admin, a, b, db => credit(db, r),
                db => outcome(credit(db, { ...r, transaction: unique('SYNTHETIC_COLLISION_') })));
            assert.equal(right.error?.code, '23505');
            assert.equal((await balance(a, user)).hint, 3);
        });
        await check('one provider transaction cannot move across owner kind or intent under contention', async () => {
            const first = await rewardAccount(), other = await rewardAccount();
            const left = await verifiedFixture(a, first), right = { ...await verifiedFixture(b, other, 'online'), transaction: left.transaction };
            const [, result] = await contended(admin, a, b, db => credit(db, left), db => outcome(credit(db, right)));
            assert.equal(result.error?.code, '23505');
            assert.deepEqual(await balance(a, first), { hint: 3, online: 0 });
            assert.deepEqual(await balance(a, other), { hint: 0, online: 0 });
            assert.equal(await status(a, other, right.intent), 'pending');
        });
        await check('different valid rewards serialize on one wallet without lost additions', async () => {
            const user = await rewardAccount(), left = await verifiedFixture(a, user), right = await verifiedFixture(b, user);
            assert.deepEqual((await contended(admin, a, b, db => credit(db, left), db => credit(db, right))).map(v => v.status), ['credited', 'credited']);
            assert.equal((await balance(a, user)).hint, 6);
        });
        await check('wallet and existing match grant share the provider fence in both insertion orders', async () => {
            for (const first of ['wallet', 'grant']) {
                const user = await rewardAccount(), r = await verifiedFixture(a, user);
                const grant = db => recordExistingGrant(db, user, r.transaction);
                const [, second] = await contended(admin, a, b,
                    db => first === 'wallet' ? credit(db, r) : grant(db),
                    db => outcome(first === 'wallet' ? grant(db) : credit(db, r)));
                assert.equal(second.error?.code, '23505');
                assert.equal((await balance(a, user)).hint, first === 'wallet' ? 3 : 0);
                assert.equal(await scalar(admin, 'select count(*)::integer as result from public.verified_rewarded_ad_grants where provider=$1 and transaction_id=$2', ['admob', r.transaction]), first === 'grant' ? 1 : 0);
            }
        });
        await check('rollback before commit leaves no burned transaction and a waiting valid retry credits once', async () => {
            const user = await rewardAccount(), r = await verifiedFixture(a, user), count = await receiptCount(admin);
            const [, second] = await contended(admin, a, b, db => credit(db, r), db => credit(db, r), { rollback: true });
            assert.equal(second.status, 'credited');
            assert.equal((await balance(a, user)).hint, 3); assert.equal(await receiptCount(admin), count + 1);
            assert.equal((await credit(a, r)).status, 'duplicate');
        });
        await check('whole plus-three boundary succeeds or rolls back atomically without a partial receipt', async () => {
            for (const kind of ['hint', 'online']) {
                const column = kind === 'hint' ? 'hint_tickets' : 'ranked_tickets';
                const user = await rewardAccount();
                await admin.query('update public.ticket_wallets set ' + column + '=$2 where user_id=$1', [user, MAX - 2]);
                const r = await verifiedFixture(a, user, kind), before = await wallet(admin, user);
                await errorCode(credit(a, r), '22003');
                assert.deepEqual(await wallet(admin, user), before); assert.equal(await receipt(admin, r.intent), undefined);
                assert.equal(await status(a, user, r.intent), 'pending');
                await admin.query('update public.ticket_wallets set ' + column + '=$2 where user_id=$1', [user, MAX - 3]);
                assert.equal((await credit(a, r)).status, 'credited'); assert.equal((await wallet(admin, user))[column], MAX);
            }
        });
        await check('two independent credits at maximum serialize; losing overflow remains retryable', async () => {
            const user = await rewardAccount();
            await admin.query('update public.ticket_wallets set hint_tickets=$2 where user_id=$1', [user, MAX - 3]);
            const left = await verifiedFixture(a, user), right = await verifiedFixture(b, user);
            const [, result] = await contended(admin, a, b, db => credit(db, left), db => outcome(credit(db, right)));
            assert.equal(result.error?.code, '22003'); assert.equal((await balance(a, user)).hint, MAX);
            assert.equal(await receipt(admin, right.intent), undefined); assert.equal(await status(a, user, right.intent), 'pending');
        });
        await check('reward and login claim preserve both awards in either profile-lock order', async () => {
            for (const first of ['reward', 'claim']) {
                const user = await rewardAccount(), r = await verifiedFixture(a, user), before = await wallet(admin, user);
                const result = await contended(admin, a, b,
                    db => first === 'reward' ? credit(db, r) : claim(db, user),
                    db => first === 'reward' ? claim(db, user) : credit(db, r));
                const claimed = result[first === 'claim' ? 0 : 1];
                assert.equal(claimed.claimed, true);
                assert.equal((await balance(a, user)).hint, Number(before.hint_tickets) + claimed.credited.hint + 3);
                assert.equal((await balance(a, user)).online, Number(before.ranked_tickets) + claimed.credited.ranked);
                assert.equal((await credit(a, r)).status, 'duplicate');
            }
        });
        await check('reward versus current match-hint debit conserves free origin in both orders', async () => {
            for (const first of ['reward', 'hint']) {
                const user = await rewardAccount();
                await admin.query('update public.ticket_wallets set hint_tickets=1 where user_id=$1', [user]);
                const r = await verifiedFixture(a, user), p = hintPayload(user), before = await wallet(admin, user);
                const values = await contended(admin, a, b,
                    db => first === 'reward' ? credit(db, r) : buyHint(db, p),
                    db => first === 'reward' ? buyHint(db, p) : credit(db, r));
                assert.ok(values[first === 'hint' ? 0 : 1].receiptId);
                const after = await wallet(admin, user);
                assert.equal(after.hint_tickets, 3); assert.deepEqual(protectedValues(after), protectedValues(before));
                assert.equal(await scalar(admin, 'select origin as result from public.match_hint_receipts where request_id=$1', [p.request]), 'free');
            }
        });
        await check('reward versus explicit ranked ticket spend conserves free stock in both orders', async () => {
            for (const first of ['reward', 'spend']) {
                const user = await rewardAccount({ quota: 20, ranked: 1 }), r = await verifiedFixture(a, user, 'online'), id = randomUUID();
                const values = await contended(admin, a, b,
                    db => first === 'reward' ? credit(db, r) : spendRanked(db, user, id),
                    db => first === 'reward' ? spendRanked(db, user, id) : credit(db, r));
                assert.equal(values[first === 'spend' ? 0 : 1].applied, true);
                assert.equal((await balance(a, user)).online, 3);
                assert.equal((await spendRanked(a, user, id)).duplicate, true);
                assert.equal((await balance(a, user)).online, 3);
            }
        });
        await check('reward versus shared admission uses existing explicit ticket consent in both orders', async () => {
            for (const first of ['reward', 'admission']) {
                const user = await rewardAccount({ ranked: 1 }), r = await verifiedFixture(a, user, 'online');
                const m = { id: randomUUID(), owner: randomUUID(), token: randomUUID() };
                await a.query('select public.renew_ranked_server_lease($1)', [m.owner]);
                await issueMatchConsent(a, user, m);
                const values = await contended(admin, a, b,
                    db => first === 'reward' ? credit(db, r) : admitShared(db, user, m),
                    db => first === 'reward' ? admitShared(db, user, m) : credit(db, r));
                assert.equal(values[first === 'admission' ? 0 : 1].state, 'active');
                assert.equal((await balance(a, user)).online, 3);
                assert.equal(await scalar(admin, 'select source as result from public.shared_match_allocations where match_id=$1 and user_id=$2', [m.id, user]), 'free_ticket');
                await terminalShared(a, m);
            }
        });
        await check('deletion admission wins profile lock and waiting new credit fails before accounting', async () => {
            const user = await rewardAccount(), r = await verifiedFixture(a, user), ticket = deletionTicket(), before = await wallet(admin, user);
            const [, result] = await contended(admin, a, b, db => beginDeletion(db, user, ticket), db => outcome(credit(db, r)));
            assert.equal(result.error?.code, '42501'); assert.deepEqual(await wallet(admin, user), before);
            assert.equal(await receipt(admin, r.intent), undefined);
        });
        await check('committed reward followed by waiting deletion erases wallet and intent but preserves anonymous duplicate fence', async () => {
            const user = await rewardAccount(), r = await verifiedFixture(a, user), ticket = deletionTicket();
            await contended(admin, a, b, db => credit(db, r), db => beginDeletion(db, user, ticket));
            await erase(a, ticket); await finishDeletion(a, ticket);
            assert.equal(await wallet(admin, user), undefined); assert.equal(await intentRow(admin, r.intent), undefined);
            const saved = await receipt(admin, r.intent); assert.ok(saved); assert.equal('user_id' in saved, false);
            assert.equal((await credit(b, r)).status, 'duplicate'); assert.equal(await wallet(admin, user), undefined);
        });
        await check('uncredited pending intent disappears on erasure and late verified input is ignored without award', async () => {
            const user = await rewardAccount(), r = await verifiedFixture(a, user), ticket = deletionTicket();
            await beginDeletion(a, user, ticket); await erase(a, ticket); await finishDeletion(a, ticket);
            const count = await receiptCount(admin);
            assert.equal((await credit(b, r)).status, 'ignored');
            assert.equal(await receiptCount(admin), count); assert.equal(await wallet(admin, user), undefined);
        });
        await check('same-ID re-registration cannot reclaim old intent or provider transaction', async () => {
            const user = await rewardAccount(), old = await verifiedFixture(a, user), ticket = deletionTicket();
            await credit(a, old); await beginDeletion(a, user, ticket); await erase(a, ticket); await finishDeletion(a, ticket);
            await admin.query('insert into public.profiles(id,name) values($1,$1)', [user]);
            await admin.query('insert into public.account_terms_consents(user_id,version) select $1,version from public.current_terms_policy where singleton', [user]);
            await admin.query('insert into public.ticket_wallets(user_id) values($1)', [user]);
            assert.equal(await status(a, user, old.intent), 'missing');
            assert.equal((await credit(a, old)).status, 'duplicate');
            assert.deepEqual(await balance(a, user), { hint: 0, online: 0 });
            const fresh = { ...await verifiedFixture(a, user), transaction: old.transaction };
            await errorCode(credit(a, fresh), '23505');
            await errorCode(recordExistingGrant(a, user, old.transaction), '23505');
            assert.deepEqual(await balance(a, user), { hint: 0, online: 0 });
        });
        await check('reward versus paid purchase refund preserves free reward and exact source quantities in both orders', async () => {
            // Synthetic provider and a disposable billing mode pin only.
            await admin.query('delete from public.stripe_billing_mode_pin');
            for (const first of ['reward', 'refund']) {
                const user = await rewardAccount(), r = await verifiedFixture(a, user);
                const bought = await register(a, user, 'hints_13', true);
                bought.token = (await scalar(a, 'select public.acquire_stripe_commerce_reconciliation($1,$2) as result', [bought.checkout, true])).token;
                assert.ok(bought.token); await purchase(a, bought);
                const key = bought.checkout.replaceAll('_', '');
                const evidence = {
                    eventId: unique('evt_ADREWARDRISK'), payloadHash: HASH, observedAt: new Date().toISOString(),
                    checkoutId: bought.checkout, userId: user, sku: bought.sku, priceId: bought.price,
                    amountTotal: bought.amount, currency: 'usd', livemode: true,
                    subscriptionId: null, invoiceId: null, periodStart: null, periodEnd: null, token: bought.token,
                    paymentSource: {
                        paymentIntentId: 'pi_' + key, chargeId: 'ch_' + key, customerId: null,
                        amountRefunded: bought.amount, riskState: 'refunded', disputeId: null, disputeStatus: null
                    }
                };
                const refund = db => scalar(db, 'select public.apply_stripe_commerce_source_risk($1::jsonb) as result', [JSON.stringify(evidence)]);
                await contended(admin, a, b,
                    db => first === 'reward' ? credit(db, r) : refund(db),
                    db => first === 'reward' ? refund(db) : credit(db, r));
                const after = await wallet(admin, user);
                assert.equal(after.hint_tickets, 3); assert.equal(after.purchased_hint_tickets, 0);
                const source = await scalar(admin, 'select to_jsonb(s) as result from public.stripe_commerce_sources s where checkout_id=$1', [bought.checkout]);
                assert.equal(source.state, 'revoked');
                const counts = Object.fromEntries(['quantity','available','held','consumed','revoked'].map(k => [k, Number(source[k])]));
                assert.deepEqual(counts, { quantity: 13, available: 0, held: 0, consumed: 0, revoked: 13 });
            }
            await admin.query('delete from public.stripe_billing_mode_pin');
        });
        await check('test subscriptions grant no live noAds and do not absorb free ad rewards', async () => {
            // Synthetic billing mode pin reset belongs only to this isolated fixture.
            await admin.query('delete from public.stripe_billing_mode_pin');
            const user = await rewardAccount(), sub = await member(a, user, 'plus_monthly', false);
            const s = await snapshot(a, sub); await paidPeriod(a, sub, s.event);
            const entitlement = await scalar(a, 'select public.get_shared_match_entitlement($1) as result', [user]);
            assert.equal(entitlement.noAds, false);
            const before = await wallet(admin, user), r = await verifiedFixture(a, user);
            await credit(a, r); assertDelta(before, await wallet(admin, user), 'hint');
            await admin.query('delete from public.stripe_billing_mode_pin');
        });
        await check('legacy member pools stay separate and canonical legacy noAds false allows ad issuance', async () => {
            const user = await rewardAccount(); await makeLegacy(admin, user);
            const entitlement = await scalar(a, 'select public.get_shared_match_entitlement($1) as result', [user]);
            assert.equal(entitlement.plan, 'legacy299'); assert.equal(entitlement.noAds, false);
            const before = await wallet(admin, user), r = await verifiedFixture(a, user, 'online');
            await credit(a, r); assertDelta(before, await wallet(admin, user), 'online');
        });
        await check('intent issuance versus paid activation respects profile lock ordering in both orders', async () => {
            for (const first of ['intent', 'paid']) {
                const user = await rewardAccount(), sub = await member(a, user, 'plus_monthly', true);
                const values = await contended(admin, a, b,
                    db => first === 'intent' ? createIntent(db, user) : activatePaid(db, sub),
                    db => outcome(first === 'intent' ? activatePaid(db, sub) : createIntent(db, user)));
                if (first === 'intent') {
                    assert.match(values[0], /^[0-9a-f-]{36}$/i);
                    assert.equal(values[1].error, undefined);
                } else assert.equal(values[1].error?.code, '42501');
            }
        });
        await check('earned reward versus paid activation credits the approved issuance snapshot in both orders', async () => {
            for (const first of ['reward', 'paid']) {
                const user = await rewardAccount(), r = await verifiedFixture(a, user), sub = await member(a, user, 'plus_monthly', true);
                const values = await contended(admin, a, b,
                    db => first === 'reward' ? credit(db, r) : activatePaid(db, sub),
                    db => first === 'reward' ? activatePaid(db, sub) : credit(db, r));
                assert.equal(values[first === 'reward' ? 0 : 1].status, 'credited');
                assert.equal((await balance(a, user)).hint, 3);
                await errorCode(createIntent(a, user), '42501');
                assert.equal((await credit(a, r)).status, 'duplicate');
                // Existing grant domain keeps its original current noAds policy.
                await errorCode(recordExistingGrant(a, user, unique('SYNTHETIC_NOWPAID_')), '42501');
            }
        });
        await check('new paid intents reject while existing owned status/balance and exact receipt replay still work', async () => {
            const user = await rewardAccount(), r = await verifiedFixture(a, user);
            await credit(a, r); const sub = await member(a, user, 'standard_monthly', true); await activatePaid(a, sub);
            await errorCode(createIntent(a, user, 'hint'), '42501');
            await errorCode(createIntent(a, user, 'online'), '42501');
            assert.equal(await status(a, user, r.intent), 'credited');
            assert.deepEqual(await balance(a, user), { hint: 3, online: 0 });
            assert.equal((await credit(a, r)).status, 'duplicate');
        });
        await check('earned issuance survives withdrawn current consent; new intent and old grant require current consent', async () => {
            const user = await rewardAccount(), r = await verifiedFixture(a, user);
            await admin.query('delete from public.account_terms_consents where user_id=$1', [user]);
            assert.equal(await scalar(a, 'select public.has_current_ticket_terms($1) as result', [user]), false);
            await errorCode(createIntent(a, user), '42501');
            await errorCode(recordExistingGrant(a, user, unique('SYNTHETIC_NEEDS_TERMS_')), '42501');
            assert.equal((await credit(a, r)).status, 'credited');
            assert.equal((await credit(b, r)).status, 'duplicate');
            assert.equal((await balance(a, user)).hint, 3);
        });
        await check('later published terms version never invalidates a previously approved earned intent', async () => {
            const user = await rewardAccount(), r = await verifiedFixture(a, user);
            const policy = await scalar(admin, 'select to_jsonb(p) as result from public.current_terms_policy p where singleton');
            const versionConstraints = (await admin.query(
                "select conname,pg_get_constraintdef(oid) as definition from pg_constraint where conrelid='public.current_terms_policy'::regclass and contype='c' and pg_get_constraintdef(oid) like '%version%'")).rows;
            // Synthetic public policy publication, not a production policy change:
            // replace the exact-version CHECK as a later forward publication would.
            const quote = name => '"' + name.replaceAll('"', '""') + '"';
            try {
                for (const c of versionConstraints) await admin.query('alter table public.current_terms_policy drop constraint ' + quote(c.conname));
                await admin.query("update public.current_terms_policy set version='2026-10-13.synthetic',effective_date=(clock_timestamp() at time zone 'Asia/Tokyo')::date where singleton");
                await admin.query("alter table public.current_terms_policy add constraint qa_later_terms_version check(version='2026-10-13.synthetic')");
                await errorCode(createIntent(a, user), '42501');
                assert.equal((await credit(a, r)).status, 'credited');
                assert.equal((await credit(b, r)).status, 'duplicate');
            } finally {
                await admin.query('alter table public.current_terms_policy drop constraint if exists qa_later_terms_version');
                await admin.query('update public.current_terms_policy set version=$1,effective_date=$2 where singleton', [policy.version, policy.effective_date]);
                for (const c of versionConstraints) await admin.query('alter table public.current_terms_policy add constraint ' + quote(c.conname) + ' ' + c.definition);
            }
        });
        await check('current account restrictions and deletion guard reject new credit despite valid issuance snapshot', async () => {
            for (const kind of ['restriction', 'deletion']) {
                const user = await rewardAccount(), r = await verifiedFixture(a, user), before = await wallet(admin, user);
                if (kind === 'restriction') await admin.query('insert into public.account_restrictions(user_id,blocked) values($1,true)', [user]);
                else await beginDeletion(a, user, deletionTicket());
                await errorCode(credit(a, r), '42501'); await errorCode(createIntent(a, user), '42501');
                assert.deepEqual(await wallet(admin, user), before); assert.equal(await receipt(admin, r.intent), undefined);
            }
        });
        await check('earned timestamp is bounded by issuance minus five minutes and expiry plus five minutes', async () => {
            for (const [boundary, offset, accepted] of [
                ['created_at', -300000, true], ['created_at', -301000, false],
                ['expires_at', 300000, true], ['expires_at', 301000, false]
            ]) {
                const user = await rewardAccount(), r = await verifiedFixture(a, user);
                if (boundary === 'expires_at') {
                    // Keep earned evidence in the past; the SQL and HTTP verifier
                    // also reject evidence over five minutes into the future.
                    await admin.query(
                        "update public.ad_reward_intents set created_at=clock_timestamp()-interval '2 hours',expires_at=clock_timestamp()-interval '1 hour',terms_accepted_at=clock_timestamp()-interval '3 hours' where id=$1", [r.intent]);
                }
                // PostgreSQL timestamps carry microseconds, SSV carries integral
                // milliseconds. ceil protects the inclusive lower boundary;
                // floor protects the inclusive upper boundary.
                const rounding = boundary === 'created_at' ? 'ceil' : 'floor';
                r.timestamp = Number(await scalar(admin,
                    'select ' + rounding + '(extract(epoch from ' + boundary + ')*1000)::bigint as result from public.ad_reward_intents where id=$1', [r.intent])) + offset;
                if (accepted) assert.equal((await credit(a, r)).status, 'credited');
                else {
                    assert.equal((await credit(a, r)).status, 'ignored');
                    assert.equal(await receipt(admin, r.intent), undefined);
                    assert.equal((await balance(a, user)).hint, 0);
                }
            }
        });
        await check('receipt beyond expiry plus seven days is refused without awarding', async () => {
            const user = await rewardAccount(), r = await verifiedFixture(a, user);
            // Fixture time relocation isolates arrival-age rejection; it does not
            // create a new public policy or bypass service-only creation authority.
            await admin.query(
                "update public.ad_reward_intents set created_at=clock_timestamp()-interval '8 days 1 hour',expires_at=clock_timestamp()-interval '8 days',terms_accepted_at=clock_timestamp()-interval '8 days 2 hours' where id=$1", [r.intent]);
            r.timestamp = Number(await scalar(admin,
                'select floor(extract(epoch from created_at)*1000)::bigint as result from public.ad_reward_intents where id=$1', [r.intent]));
            assert.equal((await credit(a, r)).status, 'ignored');
            assert.equal(await receipt(admin, r.intent), undefined); assert.equal((await balance(a, user)).hint, 0);
        });
        await check('arrival deadline is read after an observed profile-lock wait', async () => {
            const user = await rewardAccount(), r = await verifiedFixture(a, user);
            const edge = await scalar(admin, "select clock_timestamp()+interval '1 second' as result");
            await admin.query(
                "update public.ad_reward_intents set created_at=$2::timestamptz-interval '7 days 1 hour',expires_at=$2::timestamptz-interval '7 days',terms_accepted_at=$2::timestamptz-interval '7 days 2 hours' where id=$1", [r.intent, edge]);
            r.timestamp = Number(await scalar(admin,
                'select floor(extract(epoch from created_at)*1000)::bigint as result from public.ad_reward_intents where id=$1', [r.intent]));
            await a.query('begin');
            let pending;
            try {
                await a.query('select 1 from public.profiles where id=$1 for update', [user]);
                pending = outcome(credit(b, r));
                await waitForActualLock(admin, a, b);
                while (!await scalar(admin, 'select clock_timestamp()>=$1::timestamptz as result', [edge])) await delay(10);
                await a.query('commit');
                const result = await pending; assert.equal(result.value?.status, 'ignored');
                assert.equal(await receipt(admin, r.intent), undefined); assert.equal((await balance(a, user)).hint, 0);
            } finally {
                await a.query('rollback'); if (pending) await pending;
            }
        });
        await check('unknown valid verified intent is ignored and neither creates a wallet nor a receipt', async () => {
            const before = await receiptCount(admin);
            const count = await scalar(admin, 'select count(*)::integer as result from public.ticket_wallets');
            assert.equal((await credit(a, { intent: randomUUID(), kind: 'hint', transaction: unique('SYNTHETIC_UNKNOWN_'), timestamp: Date.now(), evidence: HASH })).status, 'ignored');
            assert.equal(await receiptCount(admin), before);
            assert.equal(await scalar(admin, 'select count(*)::integer as result from public.ticket_wallets'), count);
        });
        await check('invalid service credit/create inputs never become a callback award', async () => {
            const user = await rewardAccount(), r = await verifiedFixture(a, user), before = await wallet(admin, user);
            for (const changed of [
                { kind: null }, { kind: 'crown' }, { transaction: null }, { transaction: 'bad' },
                { timestamp: null }, { timestamp: -1 }, { evidence: null }, { evidence: 'bad' }
            ]) await errorCode(credit(a, { ...r, ...changed }), '22023');
            await errorCode(createIntent(a, user, 'crown'), '22023');
            for (const id of ['Guest', 'guest-123', 'CPU', 'ai:' + randomUUID()]) await assert.rejects(createIntent(a, id), error => ['22023', '42501'].includes(error.code));
            assert.deepEqual(await wallet(admin, user), before); assert.equal(await receipt(admin, r.intent), undefined);
        });
        await check('non-read-committed snapshots fail before creating or crediting an intent', async () => {
            const user = await rewardAccount(), r = await verifiedFixture(a, user), before = await wallet(admin, user);
            for (const isolation of ['read uncommitted', 'repeatable read', 'serializable']) {
                for (const operation of [db => createIntent(db, user), db => credit(db, r)]) {
                    await a.query('begin isolation level ' + isolation);
                    try { await assert.rejects(operation(a), error => ['25001', '40001'].includes(error.code) && /READ_COMMITTED_REQUIRED/.test(error.message)); }
                    finally { await a.query('rollback'); }
                }
            }
            assert.deepEqual(await wallet(admin, user), before); assert.equal(await receipt(admin, r.intent), undefined);
        });
        await check('RPC and tables are service-only; anonymous receipt has no account or intent cascade dependency', async () => {
            const user = await rewardAccount(), r = await verifiedFixture(a, user);
            for (const role of ['anon', 'authenticated']) {
                const db = await open(role);
                await errorCode(db.query('select public.ad_ticket_reward_protocol()'), '42501');
                await errorCode(balance(db, user), '42501'); await errorCode(createIntent(db, user), '42501');
                await errorCode(status(db, user, r.intent), '42501'); await errorCode(credit(db, r), '42501');
                for (const table of ['ad_reward_intents', 'ad_ticket_reward_receipts']) await errorCode(db.query('select * from public.' + table), '42501');
            }
            const functions = (await admin.query(
                "select proname,prosecdef,proconfig from pg_proc where pronamespace='public'::regnamespace and proname in ('ad_ticket_reward_protocol','ad_ticket_reward_balance','create_ad_ticket_reward','ad_ticket_reward_status','credit_ad_ticket_reward')")).rows;
            assert.equal(functions.length, 5);
            for (const fn of functions) {
                assert.equal(fn.prosecdef, false); assert.ok(fn.proconfig.some(value => /^search_path=$|^search_path=""$/.test(value)), fn.proname);
            }
            for (const table of ['ad_reward_intents', 'ad_ticket_reward_receipts']) assert.equal(await scalar(admin,
                'select relrowsecurity as result from pg_class where oid=$1::regclass', ['public.' + table]), true);
            assert.equal(await scalar(admin,
                "select count(*)::integer as result from information_schema.columns where table_schema='public' and table_name='ad_ticket_reward_receipts' and column_name in ('user_id','auth_user_id','email','raw_query')"), 0);
            assert.equal(await scalar(admin,
                "select count(*)::integer as result from pg_constraint where conrelid='public.ad_ticket_reward_receipts'::regclass and contype='f'"), 0);
            assert.equal(await scalar(admin,
                "select count(*)::integer as result from pg_constraint where conrelid='public.ad_reward_intents'::regclass and confrelid='public.profiles'::regclass and contype='f' and confdeltype='c'"), 1);
        });
        assert.equal(failures.length, 0);
        completed = true;
    } finally {
        const report = {
            draft: true, completed, passed: checks.length, failed: failures.length, checks, failures,
            nativeVersion, nativePostgreSQL: true, independentBackends: true, observedBlockingPids: true,
            scope: DRAFT_SCOPE, scopeSha256, sourceSha256,
            draftSha256: createHash('sha256').update(await readFile(fileURLToPath(import.meta.url))).digest('hex'),
            baseline: baselineEvidence, appliedHistorical: historical, appliedForward: [...preceding, MIGRATION],
            reviewedInventory, explicitlyNotApplied: [PLAY_PARALLEL],
            limitations: DRAFT_SCOPE.limitations
        };
        await writeFile(process.env.QG_AD_REWARD_REPORT ?? join(tmpdir(), 'admob-ticket-postgres-draft-results.json'),
            JSON.stringify(report, null, 2) + '\n');
        await Promise.allSettled(clients.map(db => db.end()));
        console.log(JSON.stringify({ completed, passed: checks.length, failed: failures.length, scopeSha256 }));
    }
});
