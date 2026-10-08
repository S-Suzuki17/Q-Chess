import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';

// Deliberately ignores remote URLs, service secrets and PGHOST/PGPASSWORD.
export const sessionConnection = Object.freeze({
    host: '127.0.0.1', port: Number(process.env.QG_SESSION_TEST_PG_PORT ?? 5432),
    database: 'legacy_session_upgrade', user: 'postgres', password: 'qgambit-ephemeral-only',
    ssl: false, connectionTimeoutMillis: 5_000, query_timeout: 20_000,
});
assert.ok(Number.isSafeInteger(sessionConnection.port) && sessionConnection.port > 0 && sessionConnection.port <= 65535);
export const PASSWORD = 'synthetic-session-password';
export const NEW_PASSWORD = 'synthetic-replacement-password';
export const tokenHash = () => randomBytes(32).toString('hex');
export const scalar = async (client, sql, values = []) => (await client.query(sql, values)).rows[0]?.result;
export async function connectSession(role = null) {
    const client = new pg.Client({ ...sessionConnection, application_name: `qg-session-native-${randomUUID()}` });
    client.on('error', error => { client.fixtureDisconnect = error; });
    await client.connect();
    await client.query("set statement_timeout='15s'; set lock_timeout='10s'; set idle_in_transaction_session_timeout='20s'; set timezone='UTC'");
    if (role) {
        assert.ok(['service_role', 'anon', 'authenticated', 'qg_session_rls_probe'].includes(role));
        await client.query(`set role ${role}`);
    }
    client.fixturePid = await scalar(client, 'select pg_backend_pid() as result');
    return client;
}
let sequence = 0;
export async function account(client, name = `SessionQA${++sequence}`) {
    await client.query(`insert into public.profiles(id,name,password_hash)
        values($1,$1,extensions.crypt($2,extensions.gen_salt('bf',4)))`, [name, PASSWORD]);
    return name;
}
export const issue = (client, user, hash = tokenHash(), persistent = false, password = PASSWORD) =>
    scalar(client, 'select public.issue_legacy_session($1,$2,$3,$4) as result', [user, password, hash, persistent]);
export const verify = (client, hash, expected = null) =>
    scalar(client, 'select public.verify_legacy_session($1,$2) as result', [hash, expected]);
export const revoke = (client, hash) => scalar(client, 'select public.revoke_legacy_session($1) as result', [hash]);
export const revokeUser = (client, user) => scalar(client, 'select public.revoke_user_legacy_sessions($1) as result', [user]);
export const epoch = (client, user) => scalar(client,
    'select jsonb_build_object(\'incarnation\',incarnation,\'generation\',generation::text) as result from qg_private.legacy_session_accounts where user_id=$1', [user]);
export async function recovery(client, user) {
    const auth = randomUUID(), email = `${auth}@example.test`;
    await client.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,clock_timestamp())', [auth, email]);
    await client.query("insert into auth.identities(user_id,provider) values($1,'email')", [auth]);
    await client.query('insert into public.account_recovery_emails(user_id,email,auth_user_id) values($1,$2,$3)', [user, email, auth]);
    return { user, auth, email };
}
export const reset = (client, identity, password = NEW_PASSWORD) => client.query(
    'select public.reset_legacy_account_password($1,$2,$3,$4)', [identity.user, identity.email, identity.auth, password]);
export const beginDeletion = (client, user, ticket = tokenHash()) => client.query(
    'select public.begin_account_deletion($1,$2,null)', [user, ticket]);
export async function waitBlocked(admin, blocker, waiter) {
    assert.notEqual(blocker.fixturePid, waiter.fixturePid);
    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline) {
        const row = (await admin.query(`select wait_event_type,pg_blocking_pids(pid) as blockers
            from pg_stat_activity where pid=$1`, [waiter.fixturePid])).rows[0];
        if (row?.wait_event_type === 'Lock' && row.blockers.includes(blocker.fixturePid)) return;
        await delay(10);
    }
    throw new Error(`Backend ${waiter.fixturePid} did not contend with ${blocker.fixturePid}`);
}
export async function contend(admin, a, b, operationA, operationB, rollback = false) {
    await a.query('begin');
    let pending;
    try {
        const left = await operationA(a);
        pending = operationB(b).then(value => ({ value }), error => ({ error }));
        await waitBlocked(admin, a, b);
        await a.query(rollback ? 'rollback' : 'commit');
        const right = await pending;
        if (right.error) throw right.error;
        return [left, right.value];
    } finally {
        await a.query('rollback');
        if (pending) await pending;
    }
}
