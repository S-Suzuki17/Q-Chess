import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('./build-android-web.cjs', import.meta.url), 'utf8');
const publicKey = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role: 'anon' })).toString('base64url')}.signature`;

function run(env = {}, target = 'web', publicSettings = {}) {
    let call;
    const processStub = { argv: ['node', 'build', '/public-settings', target], env, execPath: 'node',
        cwd: () => '/isolated-release', exit: code => { assert.equal(code, 0); } };
    const requireStub = Object.assign(name => {
        if (name === '@next/env') return { loadEnvConfig: () => ({ combinedEnv: {
            NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
            NEXT_PUBLIC_SUPABASE_ANON_KEY: publicKey,
            ...publicSettings,
            STRIPE_SECRET_KEY: 'must-never-copy-from-config',
            SUPABASE_SERVICE_ROLE_KEY: 'must-never-copy-from-config',
        } }) };
        if (name === 'node:child_process') return { spawnSync: (...args) => { call = args; return { status: 0 }; } };
        if (name === 'node:path') return { resolve: value => value };
        if (name === 'node:fs') return { readFileSync: () => 'versionCode 20' };
        throw new Error(`Unexpected build dependency: ${name}`);
    }, { resolve: () => '/next-cli' });
    vm.runInNewContext(source, { process: processStub, require: requireStub, Buffer, URL });
    return call;
}

test('keeps the default bundler and supports explicit webpack for shared dependencies', () => {
    assert.deepEqual(Array.from(run()[1]), ['/next-cli', 'build']);
    assert.deepEqual(Array.from(run({ QG_BUILD_BUNDLER: 'webpack' })[1]), ['/next-cli', 'build', '--webpack']);
    assert.throws(() => run({ QG_BUILD_BUNDLER: 'other' }), /Invalid release build bundler/);
});

test('configured secrets do not enter the release and advertising remains off', () => {
    const config = run()[2].env;
    assert.equal(config.STRIPE_SECRET_KEY, undefined);
    assert.equal(config.SUPABASE_SERVICE_ROLE_KEY, undefined);
    assert.equal(config.NEXT_PUBLIC_SUPABASE_ANON_KEY, publicKey);
    for (const key of ['NEXT_PUBLIC_ADMOB_LIVE', 'NEXT_PUBLIC_NATIVE_REWARDS_ENABLED',
        'NEXT_PUBLIC_NATIVE_INTERSTITIAL_ENABLED', 'NEXT_PUBLIC_FOUNDERS_REWARDS_ENABLED']) {
        assert.equal(config[key], 'false');
    }
});

test('optional metrics never enter Android and remain opt-in for Web', () => {
    assert.equal(run()[2].env.NEXT_PUBLIC_ENGAGEMENT_METRICS_ENABLED, 'false');
    assert.equal(run({ QG_ENABLE_WEB_ENGAGEMENT_METRICS: '1' })[2].env.NEXT_PUBLIC_ENGAGEMENT_METRICS_ENABLED, 'true');
    const android = run({ QG_ENABLE_WEB_ENGAGEMENT_METRICS: '1' }, 'android')[2].env;
    assert.equal(android.NEXT_PUBLIC_ENGAGEMENT_METRICS_ENABLED, 'false');
    assert.equal(android.NEXT_PUBLIC_APP_TARGET, 'android');
    assert.equal(android.NEXT_PUBLIC_ANDROID_VERSION_CODE, '20');
});

const releaseNames = [
    'NEXT_PUBLIC_QG_DAILY_LOGIN_REWARDS_ENABLED',
    'NEXT_PUBLIC_QG_STRIPE_WEB_MEMBERSHIP_ENABLED',
    'NEXT_PUBLIC_QG_STRIPE_WEB_CHECKOUT_ENABLED',
    'NEXT_PUBLIC_QG_STRIPE_WEB_PORTAL_ENABLED',
    'NEXT_PUBLIC_QG_MEMBER_TICKET_USAGE_ENABLED',
    'NEXT_PUBLIC_QG_CPU_HINT_TICKETS_ENABLED',
    'NEXT_PUBLIC_QG_RANKED_REFUND_BALANCE_ENABLED',
    'NEXT_PUBLIC_QG_WEB_COMMERCE_SALES_RELEASE_READY',
];
const webOnly = releaseNames.filter(name => name.includes('STRIPE_WEB_') || name.includes('WEB_COMMERCE_'));
const allOn = Object.fromEntries(releaseNames.map(name => [name,'true']));
test('all public ticket and sales flags default OFF, including inherited unknown names',()=>{
    const result=run({ NEXT_PUBLIC_QG_UNKNOWN:'true' })[2].env;
    for(const name of releaseNames) assert.equal(result[name],'false');
    assert.equal(result.NEXT_PUBLIC_QG_UNKNOWN,undefined);
});
test('imports exactly the allowlisted release flags for Web, honoring explicit shell false',()=>{
    const enabled=run({},'web',{...allOn,NEXT_PUBLIC_QG_UNKNOWN:'true'})[2].env;
    for(const name of releaseNames) assert.equal(enabled[name],'true');
    assert.equal(enabled.NEXT_PUBLIC_QG_UNKNOWN,undefined);
    const stopped=run({NEXT_PUBLIC_QG_STRIPE_WEB_CHECKOUT_ENABLED:'false'},'web',allOn)[2].env;
    assert.equal(stopped.NEXT_PUBLIC_QG_STRIPE_WEB_CHECKOUT_ENABLED,'false');
    for(const name of ['NEXT_PUBLIC_QG_STRIPE_WEB_PORTAL_ENABLED','NEXT_PUBLIC_QG_MEMBER_TICKET_USAGE_ENABLED']) assert.equal(stopped[name],'true');
});
test('forces Android commercial switches OFF while keeping independently approved ticket use',()=>{
    const android=run(allOn,'android',allOn)[2].env;
    for(const name of releaseNames) assert.equal(android[name],webOnly.includes(name)?'false':'true');
    for(const name of ['NEXT_PUBLIC_ADMOB_LIVE','NEXT_PUBLIC_NATIVE_REWARDS_ENABLED','NEXT_PUBLIC_NATIVE_INTERSTITIAL_ENABLED']) assert.equal(android[name],'false');
});
test('rejects malformed switch values rather than silently enabling a partial release',()=>{
    for(const value of ['1','TRUE','yes',' true','',null]) assert.throws(()=>run({},'web',{NEXT_PUBLIC_QG_STRIPE_WEB_CHECKOUT_ENABLED:value}),/true or false/);
});
