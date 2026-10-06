import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash, randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import {
    PASSWORD, NEW_PASSWORD, connectSession, scalar, tokenHash, account, issue, verify,
    revoke, revokeUser, epoch, recovery, reset, beginDeletion, contend, waitBlocked,
} from './session-postgres-support.mjs';
import { setupSessionBaseline, applySessionPending, durableSessionMigration, sessionBaselineEvidence } from './fixtures/session-postgres-baseline.mjs';

const INVALID = { status: 'invalid' }, REVOKED = { status: 'revoked' };
const FAIL = error => ({ ok: false, error });
const rpcNames = ['legacy_session_protocol_version', 'issue_legacy_session', 'verify_legacy_session',
    'revoke_legacy_session', 'revoke_user_legacy_sessions', 'cleanup_legacy_sessions'];
const EXPECTED_CHECKS = 35;

test('dormant durable sessions on native PostgreSQL, public-source baseline only', { timeout: 180_000 }, async t => {
    const clients = [], results = [];
    let failures = 0, nativeVersion, preexisting, a, b;
    const open = async role => { const c = await connectSession(role); clients.push(c); return c; };
    const admin = await open();
    t.after(async () => { await Promise.allSettled(clients.map(c => c.end())); });
    const check = async (name, fn) => t.test(name, { timeout: 20_000 }, async () => {
        try { await fn(); results.push(name); } catch (error) { failures++; throw error; }
    });
    const rowCount = (table, user) => scalar(admin, `select count(*)::integer as result from ${table} where user_id=$1`, [user]);
    const successful = result => { assert.equal(result.ok, true); return result; };
    const definitions = () => scalar(admin, `select jsonb_object_agg(proname,pg_get_functiondef(oid)) as result
        from pg_proc where pronamespace='public'::regnamespace and proname in
        ('login_user','reset_legacy_account_password','begin_account_deletion')`);

    await check('combined four-file raw upgrade preserves public auth functions, native pgcrypto and atomic profile backfill', async () => {
        nativeVersion = await setupSessionBaseline(admin);
        assert.equal(await scalar(admin, "select extname as result from pg_extension where extname='pgcrypto'"), 'pgcrypto');
        assert.equal(await scalar(admin, `select l.lanname as result from pg_proc p join pg_language l on l.oid=p.prolang
            where p.oid='extensions.crypt(text,text)'::regprocedure`), 'c', 'Password proof must be native pgcrypto');
        preexisting = await account(admin); const unchanged = await definitions();
        const original = await scalar(admin, "select prosrc as result from pg_proc where oid='public.erase_account_data(text)'::regprocedure");
        const oldLock = '    select * into job from public.account_deletion_jobs where ticket_hash=p_ticket_hash for update;';
        const profileLock = '    perform 1 from public.profiles where id=target for update;';
        const recheck = `${oldLock}\n    if not found then raise exception 'Deletion unavailable' using errcode='22023'; end if;
    if job.phase<>'pending' then return; end if;
    if job.user_id is distinct from target then
        raise exception 'Deletion changed while waiting' using errcode='40001';
    end if;`;
        assert.equal(original.split(oldLock).length, 2); assert.equal(original.split(profileLock).length, 2);
        const expected = original.replace(oldLock, oldLock.replace(' for update;', ';')).replace(profileLock, `${profileLock}\n${recheck}`);
        await applySessionPending(admin);
        assert.deepEqual(await definitions(), unchanged);
        assert.equal(await scalar(admin, "select prosrc as result from pg_proc where oid='public.erase_account_data(text)'::regprocedure"), expected,
            'Erasure changed outside the reviewed public-source lock prelude');
        assert.equal(await rowCount('qg_private.legacy_session_accounts', preexisting), 1);
        a = await open('service_role'); b = await open('service_role'); assert.notEqual(a.fixturePid, b.fixturePid);
        assert.deepEqual(await scalar(a, 'select public.legacy_session_protocol_version() as result'), { version: 1, activationReady: false });
        assert.deepEqual(await scalar(a, 'select public.stripe_commerce_protocol_version() as result'),
            { version: 1, newSalesEnabled: false, spendingEnabled: false, reversalsReady: false });
        assert.equal(await scalar(a, 'select count(*)::integer as result from public.stripe_commerce_price_bindings'), 0);
    });
    assert.ok(a && b && preexisting, 'Baseline did not finish');

    await check('only hash is stored; OFF=one absolute hour, ON=720 absolute hours and verification never slides', async () => {
        const hashes = [tokenHash(), tokenHash()];
        for (const [index, persistent] of [false, true].entries()) {
            const result = successful(await issue(a, preexisting, hashes[index], persistent));
            assert.deepEqual(Object.keys(result).sort(), ['expiresAt','generation','incarnation','issuedAt','ok','persistent','userId']);
            assert.equal(Date.parse(result.expiresAt) - Date.parse(result.issuedAt), (persistent ? 720 : 1) * 3600000);
            assert.equal(result.generation, '0'); assert.equal(result.persistent, persistent);
            const first = await verify(b, hashes[index]); assert.equal(first.status, 'valid');
            assert.deepEqual(await verify(a, hashes[index]), first);
            const stored = await scalar(admin, 'select to_jsonb(s) as result from qg_private.legacy_sessions s where token_hash=$1', [hashes[index]]);
            assert.equal(stored.token_hash, hashes[index]); assert.equal(Object.keys(stored).some(k => /password|^token$|refresh/i.test(k)), false);
        }
    });
    await check('nondefault transaction snapshots cannot over-admit capacity or verify a stale revoked session', async () => {
        for (const isolation of ['read uncommitted','repeatable read','serializable']) {
            const user = await account(admin), hash = tokenHash(); successful(await issue(a, user, hash));
            await a.query(`begin isolation level ${isolation}`);
            await a.query('select count(*) from qg_private.legacy_sessions');
            await revoke(b, hash);
            await assert.rejects(verify(a, hash), { code: '25000' }); await a.query('rollback');
            await a.query(`begin isolation level ${isolation}`);
            await assert.rejects(issue(a, user), { code: '25000' }); await a.query('rollback');
            assert.equal(await rowCount('qg_private.legacy_sessions', user), 1);
            assert.deepEqual(await verify(a, hash), REVOKED);
        }
    });
    await check('independent replacement process reuses committed session with no local memory', async () => {
        const user = await account(admin), hash = tokenHash(); successful(await issue(a, user, hash, true));
        const child = spawn(process.execPath, [fileURLToPath(new URL('./session-postgres-reuse.mjs', import.meta.url)), hash, user],
            { env: process.env, stdio: ['ignore','pipe','pipe'] });
        let stdout = '', stderr = '';
        child.stdout.on('data', data => { stdout += data; }); child.stderr.on('data', data => { stderr += data; });
        const code = await new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', resolve); });
        assert.equal(code, 0, stderr); const result = JSON.parse(stdout);
        assert.equal(result.status, 'valid'); assert.equal(result.userId, user); assert.notEqual(result.backendPid, a.fixturePid);
    });
    await check('bad input, unknown token, owner mismatch and failed password expose no identity or credential', async () => {
        const user = await account(admin), hash = tokenHash(); successful(await issue(a, user, hash));
        for (const bad of [null, '', 'x', 'a'.repeat(63), 'A'.repeat(64), 'a'.repeat(65)]) assert.deepEqual(await verify(a, bad), INVALID);
        assert.deepEqual(await verify(a, tokenHash()), INVALID); assert.deepEqual(await verify(a, hash, 'DifferentUser'), INVALID);
        assert.deepEqual(await issue(a, user, tokenHash(), false, 'deliberately-wrong'), FAIL('INVALID_CREDENTIALS'));
        assert.deepEqual(await issue(a, 'MissingAccount'), FAIL('INVALID_CREDENTIALS'));
        assert.deepEqual(await issue(a, user, 'not-a-hash'), FAIL('INVALID_REQUEST'));
        assert.deepEqual(await issue(a, user, tokenHash(), null), FAIL('INVALID_REQUEST'));
        assert.deepEqual(await issue(a, user, tokenHash(), false, 'x'.repeat(1025)), FAIL('INVALID_REQUEST'));
        assert.equal(await rowCount('qg_private.legacy_sessions', user), 1);
    });
    await check('budget uses the exact public login function and admits ten shared attempts per minute under contention', async () => {
        const user = await account(admin);
        for (let i = 0; i < 9; i++) assert.equal(await scalar(a, 'select public.login_user($1,$2) as result', [user, 'wrong']), false);
        assert.deepEqual(await contend(admin, a, b, c => issue(c, user, tokenHash(), false, 'wrong'), c => issue(c, user)),
            [FAIL('INVALID_CREDENTIALS'), FAIL('INVALID_CREDENTIALS')]);
        assert.equal(await scalar(admin, "select attempts as result from qg_private.password_attempt_budgets where account_key=sha256(convert_to($1,'UTF8'))", [user]), 10);
        assert.equal(await rowCount('qg_private.legacy_sessions', user), 0);
        await admin.query("update qg_private.password_attempt_budgets set window_started=clock_timestamp()-interval '2 minutes' where account_key=sha256(convert_to($1,'UTF8'))", [user]);
        successful(await issue(b, user));
    });
    await check('two first-use logins contend on profile and retain independent valid tokens', async () => {
        const user = await account(admin), left = tokenHash(), right = tokenHash(), before = await epoch(admin, user);
        (await contend(admin, a, b, c => issue(c, user, left), c => issue(c, user, right))).forEach(successful);
        assert.deepEqual(await epoch(admin, user), before);
        assert.equal((await verify(a, left)).status, 'valid'); assert.equal((await verify(b, right)).status, 'valid');
    });
    await check('profile and first epoch commit together; missing state fails closed and is never lazily recreated', async () => {
        const user = `Pending${randomUUID()}`;
        await admin.query('begin'); await account(admin, user);
        assert.deepEqual(await issue(a, user), FAIL('INVALID_CREDENTIALS')); await admin.query('commit'); successful(await issue(a, user));
        await admin.query('delete from qg_private.legacy_session_accounts where user_id=$1', [user]);
        assert.deepEqual(await issue(a, user), FAIL('INVALID_CREDENTIALS')); assert.equal(await rowCount('qg_private.legacy_session_accounts', user), 0);
    });
    await check('token-only revocation is idempotent and leaves another device and account generation intact', async () => {
        const user = await account(admin), left = tokenHash(), right = tokenHash();
        successful(await issue(a, user, left)); successful(await issue(b, user, right)); const before = await epoch(admin, user);
        assert.deepEqual(await revoke(b, left), { revoked: 1 }); assert.deepEqual(await revoke(a, left), { revoked: 0 });
        assert.deepEqual(await revoke(a, tokenHash()), { revoked: 0 }); assert.deepEqual(await verify(b, left), REVOKED);
        assert.equal((await verify(a, right)).status, 'valid'); assert.deepEqual(await epoch(admin, user), before);
    });
    await check('explicit global revocation rejects all old sessions and permits a fresh later login', async () => {
        const user = await account(admin), hashes = [tokenHash(), tokenHash()];
        for (const h of hashes) successful(await issue(a, user, h));
        assert.deepEqual(await revokeUser(b, user), { revoked: 2 });
        for (const h of hashes) assert.deepEqual(await verify(a, h), REVOKED);
        assert.equal(successful(await issue(b, user)).generation, '1');
    });
    await check('global logout fences issuance that captured its generation before waiting for the profile lock', async () => {
        const user = await account(admin), hash = tokenHash();
        await a.query('begin'); await a.query('select id from public.profiles where id=$1 for update', [user]);
        const pending = issue(b, user, hash); await waitBlocked(admin, a, b);
        assert.deepEqual(await revokeUser(a, user), { revoked: 0 }); await a.query('commit');
        assert.deepEqual(await pending, FAIL('STALE_AUTHENTICATION')); assert.deepEqual(await verify(a, hash), INVALID);
        successful(await issue(b, user));
    });
    await check('logout ordered after an uncommitted issuance invalidates the committed token', async () => {
        const user = await account(admin), hash = tokenHash();
        const r = await contend(admin, a, b, c => issue(c, user, hash), c => revokeUser(c, user));
        successful(r[0]); assert.deepEqual(r[1], { revoked: 1 }); assert.deepEqual(await verify(a, hash), REVOKED);
    });
    await check('rolled-back logout does not invalidate waiting or existing sessions', async () => {
        const user = await account(admin), old = tokenHash(), next = tokenHash(); successful(await issue(a, user, old));
        successful((await contend(admin, a, b, c => revokeUser(c, user), c => issue(c, user, next), true))[1]);
        assert.equal((await verify(a, old)).status, 'valid'); assert.equal((await verify(b, next)).status, 'valid');
    });
    await check('real recovery password reset invalidates sessions transactionally; no-op hash update does not', async () => {
        const user = await account(admin), identity = await recovery(admin, user), hash = tokenHash(); successful(await issue(a, user, hash));
        const before = await epoch(admin, user); await a.query('update public.profiles set password_hash=password_hash where id=$1', [user]);
        assert.deepEqual(await epoch(admin, user), before); await reset(a, identity); assert.deepEqual(await verify(b, hash), REVOKED);
        assert.deepEqual(await issue(b, user), FAIL('INVALID_CREDENTIALS')); successful(await issue(b, user, tokenHash(), false, NEW_PASSWORD));
    });
    await check('reset race fences a waiting login even if its password matches the new hash', async () => {
        const user = await account(admin), identity = await recovery(admin, user), hash = tokenHash();
        await a.query('begin'); await a.query('select id from public.profiles where id=$1 for update', [user]);
        const pending = issue(b, user, hash, false, NEW_PASSWORD); await waitBlocked(admin, a, b);
        await reset(a, identity); await a.query('commit'); assert.deepEqual(await pending, FAIL('STALE_AUTHENTICATION'));
        assert.deepEqual(await verify(a, hash), INVALID); successful(await issue(b, user, tokenHash(), false, NEW_PASSWORD));
    });
    await check('reset ordered after issuance revokes it and reset rollback restores password and epoch', async () => {
        const user = await account(admin), identity = await recovery(admin, user), hash = tokenHash();
        await contend(admin, a, b, c => issue(c, user, hash), c => reset(c, identity)); assert.deepEqual(await verify(a, hash), REVOKED);
        const live = tokenHash(); successful(await issue(a, user, live, false, NEW_PASSWORD)); const before = await epoch(admin, user);
        await a.query('begin'); await reset(a, identity, 'another-synthetic-password'); await a.query('rollback');
        assert.deepEqual(await epoch(admin, user), before); assert.equal((await verify(b, live)).status, 'valid');
        successful(await issue(b, user, tokenHash(), false, NEW_PASSWORD));
    });
    await check('restriction does not erase identity or prevent real recovery and self-service deletion', async () => {
        const user = await account(admin), identity = await recovery(admin, user), hash = tokenHash();
        await admin.query('insert into public.account_restrictions(user_id,blocked) values($1,true)', [user]);
        successful(await issue(a, user, hash)); assert.equal((await verify(b, hash)).userId, user);
        await reset(a, identity); successful(await issue(b, user, tokenHash(), false, NEW_PASSWORD));
        await beginDeletion(a, user); assert.equal(await rowCount('public.account_deletion_jobs', user), 1);
    });
    await check('deletion intent serializes with pending issuance and revokes identity before erasure', async () => {
        const user = await account(admin), old = tokenHash(), pendingHash = tokenHash(); successful(await issue(a, user, old));
        await a.query('begin'); await a.query('select id from public.profiles where id=$1 for update', [user]);
        const pending = issue(b, user, pendingHash); await waitBlocked(admin, a, b);
        await beginDeletion(a, user); await a.query('commit'); assert.deepEqual(await pending, FAIL('INVALID_CREDENTIALS'));
        assert.deepEqual(await verify(a, old), REVOKED); assert.deepEqual(await verify(a, pendingHash), INVALID);
    });
    await check('issuance then deletion, ticket rotation and actual public erasure retain no session or epoch records', async () => {
        const user = await account(admin), hash = tokenHash(), ticket = tokenHash();
        await contend(admin, a, b, c => issue(c, user, hash), c => beginDeletion(c, user, ticket)); assert.deepEqual(await verify(a, hash), REVOKED);
        const rotated = tokenHash(); await beginDeletion(b, user, rotated); await a.query('select public.erase_account_data($1)', [rotated]);
        assert.equal(await rowCount('qg_private.legacy_sessions', user), 0); assert.equal(await rowCount('qg_private.legacy_session_accounts', user), 0);
        assert.deepEqual(await verify(a, hash), INVALID); await a.query('select public.finish_account_deletion($1)', [rotated]);
        assert.equal(await rowCount('public.account_deletion_jobs', user), 0);
    });
    await check('deletion intent rollback allows the waiting issuance and leaves its profile usable', async () => {
        const user = await account(admin), hash = tokenHash();
        successful((await contend(admin, a, b, c => beginDeletion(c, user), c => issue(c, user, hash), true))[1]);
        assert.equal((await verify(a, hash)).status, 'valid'); assert.equal(await rowCount('public.account_deletion_jobs', user), 0);
    });
    await check('ticket rotation while erasure waits cannot deadlock or let the stale ticket erase data', async () => {
        const user = await account(admin), ticket = tokenHash(), rotated = tokenHash(); await beginDeletion(a, user, ticket);
        await a.query('begin'); await a.query('select id from public.profiles where id=$1 for update', [user]);
        const pending = b.query('select public.erase_account_data($1)', [ticket]).then(value => ({ value }), error => ({ error }));
        await waitBlocked(admin, a, b); await beginDeletion(a, user, rotated); await a.query('commit');
        const rejected = await pending; assert.equal(rejected.error?.code, '22023'); assert.equal(rejected.error?.message, 'Deletion unavailable');
        assert.equal(await rowCount('qg_private.legacy_session_accounts', user), 1);
        assert.equal(await scalar(admin, 'select phase as result from public.account_deletion_jobs where ticket_hash=$1', [rotated]), 'pending');
        await b.query('select public.erase_account_data($1)', [rotated]); assert.equal(await rowCount('qg_private.legacy_session_accounts', user), 0);
    });
    await check('erasure ordered before ticket rotation commits once and rotation cannot resurrect a deleted identity', async () => {
        const user = await account(admin), hash = tokenHash(), ticket = tokenHash(), rotated = tokenHash();
        successful(await issue(a, user, hash)); await beginDeletion(a, user, ticket);
        await contend(admin, a, b, c => c.query('select public.erase_account_data($1)', [ticket]), c => beginDeletion(c, user, rotated));
        assert.equal(await rowCount('qg_private.legacy_session_accounts', user), 0); assert.deepEqual(await verify(a, hash), INVALID);
        assert.equal(await scalar(admin, 'select phase as result from public.account_deletion_jobs where ticket_hash=$1', [rotated]), 'data_deleted');
        await assert.rejects(a.query('select public.erase_account_data($1)', [ticket]), { code: '22023' });
        await a.query('select public.erase_account_data($1)', [rotated]); await a.query('select public.finish_account_deletion($1)', [rotated]);
    });
    await check('erasure rollback preserves data; a waiting ticket rotation wins and only its new ticket may erase', async () => {
        const user = await account(admin), ticket = tokenHash(), rotated = tokenHash(); await beginDeletion(a, user, ticket);
        await contend(admin, a, b, c => c.query('select public.erase_account_data($1)', [ticket]), c => beginDeletion(c, user, rotated), true);
        assert.equal(await rowCount('qg_private.legacy_session_accounts', user), 1);
        assert.equal(await scalar(admin, 'select phase as result from public.account_deletion_jobs where ticket_hash=$1', [rotated]), 'pending');
        await assert.rejects(a.query('select public.erase_account_data($1)', [ticket]), { code: '22023' });
        await a.query('select public.erase_account_data($1)', [rotated]); await a.query('select public.finish_account_deletion($1)', [rotated]);
        assert.equal(await rowCount('qg_private.legacy_session_accounts', user), 0);
    });
    await check('delete/recreate with same ID and password changes incarnation and cannot revive queued old issuance', async () => {
        const user = await account(admin), oldHash = tokenHash(), pendingHash = tokenHash(); successful(await issue(a, user, oldHash));
        const before = await epoch(admin, user); await admin.query('begin'); await admin.query('select id from public.profiles where id=$1 for update', [user]);
        const pending = issue(b, user, pendingHash); await waitBlocked(await open(), admin, b);
        await admin.query('delete from public.profiles where id=$1', [user]); await account(admin, user); await admin.query('commit');
        const rejected = await pending; assert.equal(rejected.ok, false); assert.ok(['INVALID_CREDENTIALS','STALE_AUTHENTICATION'].includes(rejected.error));
        assert.notEqual((await epoch(admin, user)).incarnation, before.incarnation);
        assert.deepEqual(await verify(a, oldHash), INVALID); assert.deepEqual(await verify(a, pendingHash), INVALID); successful(await issue(b, user));
    });
    await check('expired proof is distinct from explicit revocation, with no expiry extension or ordinary-valid result', async () => {
        const user = await account(admin), hash = tokenHash(); successful(await issue(a, user, hash));
        await admin.query(`with stamp as (select clock_timestamp()-interval '2 hours' as t)
            update qg_private.legacy_sessions set issued_at=t,expires_at=t+interval '1 hour' from stamp where token_hash=$1`, [hash]);
        const expired = await verify(a, hash); assert.equal(expired.status, 'expired'); assert.equal(expired.userId, user);
        assert.deepEqual(await verify(b, hash), expired); await revoke(b, hash); assert.deepEqual(await verify(a, hash), REVOKED);
    });
    await check('concurrent same hash admits once and never replaces an existing owner or expiry', async () => {
        const left = await account(admin), right = await account(admin), hash = tokenHash();
        const r = await contend(admin, a, b, c => issue(c, left, hash), c => issue(c, right, hash));
        successful(r[0]); assert.deepEqual(r[1], FAIL('TOKEN_CONFLICT')); assert.equal((await verify(b, hash)).userId, left);
        assert.equal(await rowCount('qg_private.legacy_sessions', right), 0);
    });
    await check('session insert failure rolls back bcrypt attempt and inserted state in the same transaction', async () => {
        const user = await account(admin), hash = tokenHash();
        await admin.query(`create function qg_private.synthetic_session_insert_failure() returns trigger language plpgsql as $$
            begin raise exception 'Synthetic insertion fault'; end $$;
            create trigger synthetic_session_insert_failure after insert on qg_private.legacy_sessions
            for each row execute function qg_private.synthetic_session_insert_failure()`);
        try {
            await assert.rejects(issue(a, user, hash), { code: 'P0001' }); assert.equal(await rowCount('qg_private.legacy_sessions', user), 0);
            assert.equal(await scalar(admin, "select count(*)::integer as result from qg_private.password_attempt_budgets where account_key=sha256(convert_to($1,'UTF8'))", [user]), 0);
        } finally { await admin.query('drop trigger synthetic_session_insert_failure on qg_private.legacy_sessions; drop function qg_private.synthetic_session_insert_failure()'); }
        successful(await issue(a, user, hash));
    });
    await check('connection loss before commit rolls back; withholding the SQL response over TCP preserves one committed session without retry', async () => {
        const user = await account(admin), rolledBack = tokenHash(), committed = tokenHash();
        const lost = await open('service_role'); await lost.query('begin'); successful(await issue(lost, user, rolledBack));
        await scalar(admin, 'select pg_terminate_backend($1) as result', [lost.fixturePid]); assert.deepEqual(await verify(a, rolledBack), INVALID);
        // Exercise a real native TCP boundary, not a disconnect after receiving
        // the result. The pinned pg client parses incoming socket data. Pause
        // that readable side BEFORE writing issuance so no SQL response can
        // reach the Promise; the separate admin backend observes actual commit.
        const unacknowledged = await open('service_role');
        const stream = unacknowledged.connection.stream;
        assert.equal(stream.remoteAddress, '127.0.0.1');
        assert.notEqual(unacknowledged.fixturePid, admin.fixturePid);
        stream.pause(); assert.equal(stream.isPaused(), true);
        let settled = false;
        const pending = issue(unacknowledged, user, committed).then(
            value => { settled = true; return { value }; },
            error => { settled = true; return { error }; },
        );
        let observedCommit = false;
        try {
            const deadline = Date.now() + 5_000;
            while (Date.now() < deadline) {
                const count = await scalar(admin, 'select count(*)::integer as result from qg_private.legacy_sessions where token_hash=$1', [committed]);
                if (count === 1) { observedCommit = true; break; }
                await delay(10);
            }
            assert.equal(observedCommit, true, 'Independent backend did not observe committed issuance');
            assert.equal(stream.isPaused(), true, 'Incoming acknowledgement was not withheld');
            assert.equal(settled, false, 'Issuance result arrived before connection destruction');
        } finally {
            // Closing while still paused discards the unread response and
            // rejects the outstanding query. Never resume or retry issuance.
            stream.destroy();
        }
        const discarded = await pending;
        assert.ok(discarded.error instanceof Error, 'The unacknowledged query must reject');
        assert.equal(Object.hasOwn(discarded, 'value'), false);
        const replacement = await open('service_role');
        assert.notEqual(replacement.fixturePid, unacknowledged.fixturePid);
        assert.equal((await verify(replacement, committed)).status, 'valid');
        assert.equal(await rowCount('qg_private.legacy_sessions', user), 1);
        assert.equal(await scalar(admin, "select attempts as result from qg_private.password_attempt_budgets where account_key=sha256(convert_to($1,'UTF8'))", [user]), 1);
    });
    await check('generation overflow rejects logout/reset/deletion atomically and malformed rows violate constraints', async () => {
        const user = await account(admin), identity = await recovery(admin, user), hash = tokenHash();
        await admin.query('update qg_private.legacy_session_accounts set generation=9223372036854775807 where user_id=$1', [user]);
        assert.equal(successful(await issue(a, user, hash)).generation, '9223372036854775807');
        await assert.rejects(revokeUser(a, user), { code: '22003' }); await assert.rejects(reset(a, identity), { code: '22003' });
        await assert.rejects(beginDeletion(a, user), { code: '22003' }); assert.equal((await verify(a, hash)).status, 'valid');
        assert.equal(await rowCount('public.account_deletion_jobs', user), 0);
        assert.equal(await scalar(a, 'select public.login_user($1,$2) as result', [user, PASSWORD]), true);
        await assert.rejects(admin.query('update qg_private.legacy_session_accounts set generation=-1 where user_id=$1', [user]), { code: '23514' });
        await assert.rejects(admin.query("update qg_private.legacy_sessions set expires_at=expires_at+interval '1 second' where token_hash=$1", [hash]), { code: '23514' });
        await assert.rejects(admin.query("update qg_private.legacy_sessions set token_hash='plaintext-token' where token_hash=$1", [hash]), { code: '23514' });
    });
    await check('global 10,000 active capacity is atomic across two accounts with no eviction', async () => {
        await admin.query('truncate qg_private.legacy_sessions');
        const population = await account(admin), left = await account(admin), right = await account(admin);
        await admin.query(`with stamp as (select clock_timestamp() as t)
            insert into qg_private.legacy_sessions(token_hash,user_id,incarnation,generation,persistent,issued_at,expires_at)
            select encode(sha256(convert_to('capacity-'||g::text,'UTF8')),'hex'),a.user_id,a.incarnation,0,false,t,t+interval '1 hour'
            from qg_private.legacy_session_accounts a cross join stamp cross join generate_series(1,9999) g where a.user_id=$1`, [population]);
        const leftHash = tokenHash(), rightHash = tokenHash();
        const r = await contend(admin, a, b, c => issue(c, left, leftHash), c => issue(c, right, rightHash));
        successful(r[0]); assert.deepEqual(r[1], FAIL('CAPACITY'));
        assert.equal(await scalar(admin, 'select count(*)::integer as result from qg_private.legacy_sessions'), 10000);
        assert.equal(await rowCount('qg_private.legacy_sessions', population), 9999);
        await revoke(a, leftHash); successful(await issue(b, right, rightHash)); assert.deepEqual(await verify(a, leftHash), REVOKED);
    });
    await check('absolute expiry frees capacity without deleting or revoking the expired proof', async () => {
        const old = await scalar(admin, 'select token_hash as result from qg_private.legacy_sessions where revoked_at is null limit 1');
        await admin.query(`with stamp as (select clock_timestamp()-interval '2 hours' as t)
            update qg_private.legacy_sessions set issued_at=t,expires_at=t+interval '1 hour' from stamp where token_hash=$1`, [old]);
        assert.equal((await verify(a, old)).status, 'expired'); successful(await issue(b, await account(admin)));
        assert.equal((await verify(a, old)).status, 'expired');
    });
    await check('cleanup is bounded, indexed and skips locked tombstones without evicting active or recent expired sessions', async () => {
        const user = await account(admin), e = await epoch(admin, user);
        for (let i = 0; i < 3; i++) await admin.query(`with stamp as (select clock_timestamp()-interval '49 hours' as t)
            insert into qg_private.legacy_sessions(token_hash,user_id,incarnation,generation,persistent,issued_at,expires_at)
            select $1,$2,$3,0,false,t,t+interval '1 hour' from stamp`, [String(i).repeat(64),user,e.incarnation]);
        await a.query('begin'); await a.query('select token_hash from qg_private.legacy_sessions where token_hash=$1 for update', ['0'.repeat(64)]);
        assert.deepEqual(await scalar(b, 'select public.cleanup_legacy_sessions(1) as result'), { deleted: 1 });
        assert.deepEqual(await scalar(b, 'select public.cleanup_legacy_sessions(1000) as result'), { deleted: 1 });
        await a.query('commit'); assert.deepEqual(await scalar(b, 'select public.cleanup_legacy_sessions(1000) as result'), { deleted: 1 });
        assert.equal(await scalar(admin, 'select count(*)::integer as result from qg_private.legacy_sessions where revoked_at is null and expires_at>clock_timestamp()'), 10000);
        for (const bad of [null, 0, 1001]) await assert.rejects(scalar(b, 'select public.cleanup_legacy_sessions($1) as result', [bad]), { code: '22023' });
        await admin.query('set enable_seqscan=off');
        const plan = (await admin.query(`explain select token_hash from qg_private.legacy_sessions
            where coalesce(revoked_at,expires_at)<clock_timestamp()-interval '24 hours'
            order by coalesce(revoked_at,expires_at),token_hash limit 100`)).rows.map(r => r['QUERY PLAN']).join('\n');
        assert.match(plan, /legacy_sessions_retention/); await admin.query('reset enable_seqscan');
    });
    await check('authenticated profile signup and service registration provision state without exposing private writes', async () => {
        const id = randomUUID(); await admin.query('insert into auth.users(id) values($1)', [id]); const client = await open('authenticated');
        await client.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
        await client.query('insert into public.profiles(id,name) values($1,$2)', [id, 'Synthetic Auth signup']);
        assert.equal(await rowCount('qg_private.legacy_session_accounts', id), 1);
        assert.equal(await scalar(a, 'select public.register_account_secure($1,$2) as result', ['SecureQA01', PASSWORD]), true);
        assert.equal(await rowCount('qg_private.legacy_session_accounts', 'SecureQA01'), 1);
        for (const query of ['select * from qg_private.legacy_session_accounts',
            "insert into qg_private.legacy_session_accounts(user_id) values('Attack')", 'select qg_private.provision_legacy_session_account()'])
            await assert.rejects(client.query(query), { code: '42501' });
        await assert.rejects(a.query('select qg_private.provision_legacy_session_account()'), { code: '42501' });
        await assert.rejects(a.query('update qg_private.legacy_session_accounts set incarnation=gen_random_uuid() where user_id=$1', [id]), { code: '42501' });
        await assert.rejects(a.query("update qg_private.legacy_sessions set expires_at=expires_at+interval '1 hour'"), { code: '42501' });
    });
    await check('anon/authenticated cannot enumerate, issue, verify, revoke or clean; guard survives accidental EXECUTE grant', async () => {
        for (const role of ['anon','authenticated']) {
            const c = await open(role);
            for (const query of ['select public.legacy_session_protocol_version()',
                "select public.issue_legacy_session('Synthetic','wrong',repeat('a',64),false)",
                "select public.verify_legacy_session(repeat('a',64))", "select public.revoke_legacy_session(repeat('a',64))",
                "select public.revoke_user_legacy_sessions('Synthetic')", 'select public.cleanup_legacy_sessions()',
                'select * from qg_private.legacy_sessions', 'select * from qg_private.legacy_session_accounts'])
                await assert.rejects(c.query(query), { code: '42501' });
            assert.equal(await scalar(admin, `select count(*)::integer as result from pg_proc where pronamespace='public'::regnamespace
                and proname=any($1) and has_function_privilege($2,oid,'EXECUTE')`, [rpcNames, role]), 0);
            await admin.query(`grant execute on function public.issue_legacy_session(text,text,text,boolean) to ${role}`);
            await assert.rejects(issue(c, preexisting), { code: '42501' });
            await admin.query(`revoke execute on function public.issue_legacy_session(text,text,text,boolean) from ${role}`);
        }
    });
    await check('RLS is effective with SELECT grants; new RPCs are pinned INVOKER with exactly one controlled private DEFINER exception', async () => {
        await admin.query('create role qg_session_rls_probe; grant usage on schema qg_private to qg_session_rls_probe'); const probe = await open('qg_session_rls_probe');
        for (const table of ['legacy_session_accounts','legacy_sessions']) {
            await admin.query(`grant select on qg_private.${table} to qg_session_rls_probe`);
            assert.equal(await scalar(probe, `select count(*)::integer as result from qg_private.${table}`), 0);
            assert.deepEqual((await admin.query('select relrowsecurity,relforcerowsecurity from pg_class where oid=$1::regclass', [`qg_private.${table}`])).rows[0],
                { relrowsecurity: true, relforcerowsecurity: true });
        }
        const functions = (await admin.query(`select n.nspname,p.proname,p.prosecdef,p.proconfig,r.rolname as owner from pg_proc p
            join pg_namespace n on n.oid=p.pronamespace join pg_roles r on r.oid=p.proowner
            where (n.nspname='public' and p.proname=any($1)) or
                (n.nspname='qg_private' and p.proname in ('provision_legacy_session_account','invalidate_legacy_session_account',
                'invalidate_legacy_session_password','invalidate_legacy_session_deletion'))`, [rpcNames])).rows;
        assert.equal(functions.length, 10);
        for (const f of functions) {
            assert.deepEqual(f.proconfig, ['search_path=""']); assert.equal(f.owner, 'postgres');
            assert.equal(f.prosecdef, f.proname === 'provision_legacy_session_account');
        }
    });

    // Tie every recovery run to these actual source bytes, not an older report.
    const sourceSha256 = {};
    for (const name of [`supabase/migrations/${durableSessionMigration}`, 'scripts/qa/fixtures/session-postgres-baseline.mjs',
        ...['test','support','reuse','local'].map(n => `scripts/qa/session-postgres-${n}.mjs`)]) {
        // The test itself uses the conventional .test.mjs filename.
        const source = name.replace('session-postgres-test.mjs', 'session-postgres.test.mjs');
        sourceSha256[source] = createHash('sha256').update(await readFile(new URL(`../../${source}`, import.meta.url))).digest('hex');
    }
    const report = { completed: failures === 0 && results.length === EXPECTED_CHECKS, verifiedAt: new Date().toISOString(),
        nativePostgreSQL: true, nativeVersion, independentBackends: true, nativePgcrypto: true, productionData: false,
        applicationActivation: false, socketTransportVerified: false, baseline: sessionBaselineEvidence, sourceSha256,
        passed: results.length, failed: failures, tests: results };
    await writeFile(join(tmpdir(), 'session-postgres-results.json'), JSON.stringify(report, null, 2) + '\n'); console.log(JSON.stringify(report));
    assert.equal(failures, 0, 'Native session verification has failures');
    assert.equal(results.length, EXPECTED_CHECKS, 'Native session verification has missing checks');
});
