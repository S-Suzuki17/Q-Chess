// PR21's raw forward migration on a disposable native PostgreSQL 17 fixture.
// No hosted database, real account, substituted crypt or provider request.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash, randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { connect, scalar, wallet, contended, HASH } from './commerce-postgres-support.mjs';
import { setupBaseline } from './fixtures/commerce-postgres-baseline.mjs';
import {
    applyHintPolicyRelease, applyEmailRegistrationForward, sessionBaselineEvidence,
    combinedHistoricalMigrations, combinedPendingMigrations, hintPolicyMigrations,
    emailRegistrationMigrations,
} from './fixtures/session-postgres-baseline.mjs';

const PASSWORD = 'synthetic-registration-password-17';
const OTHER_PASSWORD = 'synthetic-alternative-password-17';
const EXPECTED_CHECKS = 10;
const registerLegacy = (client, id, password = PASSWORD) => scalar(client,
    'select public.register_account_secure($1,$2) as result', [id, password]);
const registerEmail = (client, id, email = 'new@example.test', password = PASSWORD) => scalar(client,
    'select public.register_account_with_email($1,$2,$3) as result', [id, password, email]);
const login = (client, id, password = PASSWORD) => scalar(client,
    'select public.login_user($1,$2) as result', [id, password]);

const limitations = [
    ...sessionBaselineEvidence.limitations,
    'PR21 native SQL proof covers synthetic accounts only, not hosted schema/ACL equivalence or production migration state.',
    'No PostgREST, provider email verification, actual email delivery, HTTP/UI, payment, deployment or real-device proof.',
];

test('native PostgreSQL email registration after the released PR20 policy', { timeout: 180_000 }, async t => {
    const clients = [], checks = [];
    let failures = 0, completed = false, postgres, admin, service, second;
    let before, oldReceipt, oldRequest, oldContext;
    const open = async role => { const client = await connect(role); clients.push(client); return client; };
    const check = (name, fn) => t.test(name, { timeout: 20_000 }, async () => {
        try { await fn(); checks.push(name); } catch (error) { failures++; throw error; }
    });
    const rowCount = (table, id) => scalar(admin,
        `select count(*)::integer as result from ${table} where user_id=$1`, [id]);
    const profile = id => scalar(admin, 'select to_jsonb(p) as result from public.profiles p where id=$1', [id]);
    const contact = id => scalar(admin, 'select email as result from qg_private.registration_contacts where user_id=$1', [id]);
    const definitions = () => scalar(admin, `select jsonb_object_agg(oid::regprocedure::text,pg_get_functiondef(oid)) as result
        from pg_proc where oid in ('public.login_user(text,text)'::regprocedure,
            'public.register_account_secure(text,text)'::regprocedure,
            'qg_private.register_account(text,text)'::regprocedure,
            'public.reset_legacy_account_password(text,text,uuid,text)'::regprocedure)`);
    const oldState = async () => ({
        profile: await profile('BeforeEmail'),
        wallet: await wallet(admin, 'BeforeEmail'),
        receipt: await scalar(admin, 'select to_jsonb(r) as result from public.match_hint_receipts r where request_id=$1', [oldRequest]),
        definitions: await definitions(),
        session: await scalar(admin, 'select to_jsonb(a) as result from qg_private.legacy_session_accounts a where user_id=$1', ['BeforeEmail']),
    });
    try {
        admin = await open();
        await check('native pgcrypto and unchanged PR19 then PR20 upgrades create a paid existing receipt', async () => {
            await setupBaseline(admin);
            postgres = await scalar(admin, 'select version() as result');
            assert.equal(await scalar(admin, `select l.lanname as result from pg_proc p join pg_language l on l.oid=p.prolang
                where p.oid='extensions.crypt(text,text)'::regprocedure`), 'c');
            assert.equal(combinedPendingMigrations.length, 13);
            assert.deepEqual(hintPolicyMigrations, ['20261008054904_match_hint_tickets_and_free_practice.sql']);
            await applyHintPolicyRelease(admin);
            assert.equal(await scalar(admin, "select to_regprocedure('public.register_account_with_email(text,text,text)') as result"), null);
            service = await open('service_role'); second = await open('service_role');
            assert.equal(await registerLegacy(service, 'BeforeEmail'), true);
            await service.query("select public.accept_current_account_terms('BeforeEmail','2026-10-08.1')");
            await admin.query("insert into public.ticket_wallets(user_id,hint_tickets) values('BeforeEmail',3)");
            oldRequest = randomUUID(); oldContext = randomUUID();
            oldReceipt = await scalar(service, `select public.buy_match_hint($1,'BeforeEmail',$2,'match','ranked','white',0,$3,
                'quantum-match-v1',clock_timestamp()+interval '1 hour',$4::jsonb,$5::jsonb) as result`,
            [oldRequest, oldContext, HASH, JSON.stringify({ pieceId: 'w_1', target: { row: 5, col: 0 } }),
                JSON.stringify({ fromRow: 6, fromCol: 0, toRow: 5, toCol: 0 })]);
            assert.ok(oldReceipt.receiptId);
            assert.equal((await wallet(admin, 'BeforeEmail')).hint_tickets, 2);
            before = await oldState();
        });
        assert.ok(before && service && second, 'Released baseline must succeed before the forward proof');

        await check('raw email forward preserves existing profile, wallet, receipt, session and authentication definitions', async () => {
            assert.deepEqual(emailRegistrationMigrations, ['20261008093454_email_account_registration.sql']);
            await applyEmailRegistrationForward(admin);
            assert.deepEqual(await oldState(), before);
            assert.equal(await contact('BeforeEmail'), undefined);
            assert.deepEqual(await scalar(service, 'select public.read_match_hint_receipt($1,$2,$3,0) as result',
                [oldRequest, 'BeforeEmail', oldContext]), oldReceipt);
            assert.equal(await scalar(admin, 'select version as result from public.current_terms_policy where singleton'), '2026-10-08.1');
        });
        assert.equal(failures, 0, 'The raw forward migration must succeed before registration scenarios');

        await check('old accounts, new two-field registration and email registration all retain real bcrypt account-name login', async () => {
            assert.equal(await login(service, 'BeforeEmail'), true);
            assert.equal(await registerLegacy(service, 'LegacyAfter'), true);
            assert.equal(await registerEmail(service, 'EmailAfter'), true);
            for (const id of ['BeforeEmail', 'LegacyAfter', 'EmailAfter']) {
                const row = await profile(id);
                assert.match(row.password_hash, /^\$2[aby]\$10\$/);
                assert.equal(await scalar(admin, 'select $1=extensions.crypt($2,$1) as result', [row.password_hash, PASSWORD]), true);
                assert.equal(await login(service, id), true);
                assert.equal(await login(service, id, OTHER_PASSWORD), false);
            }
            assert.equal(await contact('EmailAfter'), 'new@example.test');
            assert.equal(await contact('LegacyAfter'), undefined);
        });

        await check('duplicate names cannot replace existing passwords or attach or overwrite contact emails', async () => {
            for (const id of ['BeforeEmail', 'LegacyAfter', 'EmailAfter']) {
                const original = await profile(id), email = await contact(id);
                assert.equal(await registerEmail(service, id, 'replacement@example.test', OTHER_PASSWORD), false);
                assert.equal(await registerLegacy(service, id, OTHER_PASSWORD), false);
                assert.deepEqual(await profile(id), original);
                assert.equal(await contact(id), email);
            }
        });

        await check('invalid emails, names and passwords leave no profile, contact or durable-session identity', async () => {
            const invalidEmails = [null, '', 'invalid', 'a@b', 'a@@b.test', 'A@example.test', ' a@example.test',
                'a@example.test ', 'a b@example.test', 'a\n@example.test', '<a>@example.test', 'a'.repeat(255)+'@b.test'];
            let index = 0;
            for (const email of invalidEmails) {
                const id = 'Invalid'+index++;
                await assert.rejects(registerEmail(service, id, email), { code: '22023' });
                assert.equal(await profile(id), undefined);
                assert.equal(await rowCount('qg_private.registration_contacts', id), 0);
                assert.equal(await rowCount('qg_private.legacy_session_accounts', id), 0);
            }
            for (const [id, password] of [['No', PASSWORD], ['InvalidNameLongerThan15', PASSWORD],
                ['InvalidName!', PASSWORD], ['BadPassword', 'short'], ['LongPassword', 'x'.repeat(73)],
                ['NullPassword', null], ['ControlPassword', 'long-password\n']]) {
                await assert.rejects(registerEmail(service, id, 'valid@example.test', password), { code: '22023' });
                assert.equal(await profile(id), undefined);
                assert.equal(await rowCount('qg_private.registration_contacts', id), 0);
                assert.equal(await rowCount('qg_private.legacy_session_accounts', id), 0);
            }
        });

        await check('service-only wrappers and private RLS contacts deny direct reads, writes and public execution', async () => {
            const signatures = ['public.register_account_with_email(text,text,text)', 'qg_private.register_account_with_email(text,text,text)'];
            assert.equal(await scalar(admin, "select relrowsecurity as result from pg_class where oid='qg_private.registration_contacts'::regclass"), true);
            for (const role of ['anon', 'authenticated', 'service_role']) {
                const client = await open(role);
                for (const signature of signatures) {
                    assert.equal(await scalar(admin, "select has_function_privilege($1,$2,'EXECUTE') as result", [role, signature]), role === 'service_role');
                }
                for (const privilege of ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) {
                    assert.equal(await scalar(admin, "select has_table_privilege($1,'qg_private.registration_contacts',$2) as result", [role, privilege]), false);
                }
                for (const sql of ['select * from qg_private.registration_contacts',
                    "insert into qg_private.registration_contacts values('EmailAfter','forged@example.test')",
                    "update qg_private.registration_contacts set email='forged@example.test'",
                    'delete from qg_private.registration_contacts', 'truncate qg_private.registration_contacts']) {
                    await assert.rejects(client.query(sql), { code: '42501' });
                }
                if (role !== 'service_role') {
                    await assert.rejects(registerEmail(client, 'Forbidden'), { code: '42501' });
                    await assert.rejects(client.query("select qg_private.register_account_with_email('Forbidden',$1,'forged@example.test')", [PASSWORD]), { code: '42501' });
                }
            }
            assert.equal(await scalar(admin, `select count(*)::integer as result from pg_proc p,
                lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
                where p.oid=any($1::regprocedure[]) and a.grantee=0 and a.privilege_type='EXECUTE'`, [signatures]), 0);
            assert.equal(await contact('EmailAfter'), 'new@example.test');
            assert.equal(await profile('Forbidden'), undefined);
        });

        await check('unverified email remains contact-only and grants neither email login nor verified recovery identity', async () => {
            assert.equal(await login(service, 'new@example.test'), false);
            assert.equal(await scalar(admin, 'select count(*)::integer as result from public.account_recovery_emails where user_id=$1', ['EmailAfter']), 0);
            assert.equal(await scalar(admin, 'select count(*)::integer as result from auth.users'), 0);
            assert.equal((await profile('EmailAfter')).email, null);
            assert.equal(await login(service, 'EmailAfter'), true);
        });

        await check('failure after profile insertion rolls back contact, profile and session-trigger side effects atomically', async () => {
            await admin.query(`create function pg_temp.reject_registration_contact() returns trigger language plpgsql as $$
                begin raise exception 'synthetic contact storage failure' using errcode='23514'; end $$;
                create trigger synthetic_contact_failure before insert on qg_private.registration_contacts
                for each row execute function pg_temp.reject_registration_contact()`);
            try {
                await assert.rejects(registerEmail(service, 'AtomicEmail'), { code: '23514' });
                assert.equal(await profile('AtomicEmail'), undefined);
                assert.equal(await rowCount('qg_private.registration_contacts', 'AtomicEmail'), 0);
                assert.equal(await rowCount('qg_private.legacy_session_accounts', 'AtomicEmail'), 0);
            } finally {
                await admin.query('drop trigger synthetic_contact_failure on qg_private.registration_contacts');
            }
            assert.equal(await registerEmail(service, 'AtomicEmail'), true, 'The exact failed name is reusable after rollback');
        });

        await check('independent-backend duplicate contention commits one profile and its matching contact only', async () => {
            assert.deepEqual(await contended(admin, service, second,
                client => registerEmail(client, 'RaceEmail', 'first@example.test'),
                client => registerEmail(client, 'RaceEmail', 'second@example.test', OTHER_PASSWORD)), [true, false]);
            assert.equal(await rowCount('qg_private.registration_contacts', 'RaceEmail'), 1);
            assert.equal(await rowCount('qg_private.legacy_session_accounts', 'RaceEmail'), 1);
            assert.equal(await contact('RaceEmail'), 'first@example.test');
            assert.equal(await login(service, 'RaceEmail'), true);
            assert.equal(await login(service, 'RaceEmail', OTHER_PASSWORD), false);
        });

        await check('profile erasure cascades the private contact and leaves unrelated charged receipts and wallets intact', async () => {
            assert.equal(await registerEmail(service, 'EraseEmail', 'erase@example.test'), true);
            assert.equal(await rowCount('qg_private.registration_contacts', 'EraseEmail'), 1);
            await admin.query('delete from public.profiles where id=$1', ['EraseEmail']);
            assert.equal(await rowCount('qg_private.registration_contacts', 'EraseEmail'), 0);
            assert.equal(await rowCount('qg_private.legacy_session_accounts', 'EraseEmail'), 0);
            assert.equal(await login(service, 'EraseEmail'), false);
            assert.deepEqual(await oldState(), before);
        });
        assert.equal(failures, 0, 'Every email registration scenario must pass');
        assert.equal(checks.length, EXPECTED_CHECKS, 'No incomplete or skipped registration proof');
        completed = true;
    } finally {
        const files = [...new Set([...combinedHistoricalMigrations, ...combinedPendingMigrations,
            ...hintPolicyMigrations, ...emailRegistrationMigrations])].map(name => 'supabase/migrations/'+name);
        files.push('scripts/qa/email-registration-postgres.test.mjs', 'scripts/qa/fixtures/session-postgres-baseline.mjs',
            'scripts/qa/fixtures/commerce-postgres-baseline.mjs', 'scripts/qa/commerce-postgres-support.mjs');
        const sourceSha256 = Object.fromEntries(await Promise.all(files.map(async file =>
            [file, createHash('sha256').update(await readFile(new URL('../../'+file, import.meta.url))).digest('hex')])));
        const report = { completed, verifiedAt: new Date().toISOString(), postgres, passed: checks.length, failed: failures,
            expectedChecks: EXPECTED_CHECKS, checks, sourceSha256, baseline: sessionBaselineEvidence,
            forwardMigrationsApplied: [...hintPolicyMigrations, ...emailRegistrationMigrations],
            independentBackends: true, observedBlockingPids: completed, limitations };
        await writeFile(join(tmpdir(), 'email-registration-postgres-results.json'), JSON.stringify(report, null, 2)+'\n');
        await Promise.allSettled(clients.map(client => client.end()));
    }
});
