// Import only explicitly allowed public settings; never copy secrets into a release.
const { loadEnvConfig } = require('@next/env');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const {readFileSync}=require('node:fs');
const target=process.argv[3]??'android';
if(!['android','web'].includes(target))throw new Error('Invalid build target');
const webMetricsEnabled = target === 'web' && process.env.QG_ENABLE_WEB_ENGAGEMENT_METRICS === '1';
const androidBuild=target==='android'?/\bversionCode\s+(\d+)/.exec(readFileSync('android/app/build.gradle','utf8'))?.[1]:'0';
if(!androidBuild)throw new Error('Android versionCode is required');

const sourceRoot = process.argv[2];
if (!sourceRoot) throw new Error('Usage: node scripts/release/build-android-web.cjs <configured-project-directory>');
const originalEnv = { ...process.env };
const bundler = originalEnv.QG_BUILD_BUNDLER ?? 'turbopack';
if (!['turbopack', 'webpack'].includes(bundler)) throw new Error('Invalid release build bundler');
const { combinedEnv: configured } = loadEnvConfig(path.resolve(sourceRoot), false);
const url = configured.NEXT_PUBLIC_SUPABASE_URL;
const key = configured.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !/^https:\/\/[a-z0-9]+\.supabase\.co\/?$/.test(url) || url.includes('placeholder')) {
    throw new Error('A real production Supabase URL is required');
}
let anon = false;
try { anon = JSON.parse(Buffer.from(key.split('.')[1], 'base64url')).role === 'anon'; } catch {}
if (!key || (!key.startsWith('sb_publishable_') && !anon)) {
    throw new Error('Only a public publishable/anon key may enter the Android bundle');
}
const server = configured.NEXT_PUBLIC_SERVER_URL || 'https://q-chess.onrender.com';
if (new URL(server).protocol !== 'https:') throw new Error('Release game server must use HTTPS');
// Only these eight public release switches may be imported from a configured
// project. Shell values override that project's values, including explicit false.
const publicReleaseFlags = {
    NEXT_PUBLIC_QG_DAILY_LOGIN_REWARDS_ENABLED: 'usage',
    NEXT_PUBLIC_QG_STRIPE_WEB_MEMBERSHIP_ENABLED: 'web',
    NEXT_PUBLIC_QG_STRIPE_WEB_CHECKOUT_ENABLED: 'web',
    NEXT_PUBLIC_QG_STRIPE_WEB_PORTAL_ENABLED: 'web',
    NEXT_PUBLIC_QG_MEMBER_TICKET_USAGE_ENABLED: 'usage',
    NEXT_PUBLIC_QG_CPU_HINT_TICKETS_ENABLED: 'usage',
    NEXT_PUBLIC_QG_RANKED_REFUND_BALANCE_ENABLED: 'usage',
    NEXT_PUBLIC_QG_WEB_COMMERCE_SALES_RELEASE_READY: 'web',
};
const releaseEnv = {};
for (const [name, scope] of Object.entries(publicReleaseFlags)) {
    const value = originalEnv[name] ?? configured[name];
    if (value !== undefined && value !== 'true' && value !== 'false') {
        throw new Error(`Release flag must be true or false: ${name}`);
    }
    releaseEnv[name] = String(value === 'true' && (scope !== 'web' || target === 'web'));
}
// Unknown public QG names must not piggyback on the shell environment either.
const inheritedEnv = Object.fromEntries(Object.entries(originalEnv).filter(([name]) => !name.startsWith('NEXT_PUBLIC_QG_')));
const result = spawnSync(process.execPath, [require.resolve('next/dist/bin/next'), 'build',
    ...(bundler === 'webpack' ? ['--webpack'] : [])], {
    cwd: process.cwd(), stdio: 'inherit',
    env: {
        ...inheritedEnv, ...releaseEnv, NODE_ENV: 'production', QG_RELEASE_BUILD: '1',
        NEXT_PUBLIC_APP_TARGET: target,
        NEXT_PUBLIC_ANDROID_VERSION_CODE: androidBuild,
        NEXT_PUBLIC_FOUNDERS_REWARDS_ENABLED: 'false',
        NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_ANON_KEY: key,
        NEXT_PUBLIC_SERVER_URL: server,
        NEXT_PUBLIC_ADMOB_LIVE: 'false', NEXT_PUBLIC_NATIVE_REWARDS_ENABLED: 'false',
        NEXT_PUBLIC_NATIVE_INTERSTITIAL_ENABLED: 'false',
        NEXT_PUBLIC_ENGAGEMENT_METRICS_ENABLED: String(webMetricsEnabled),
    },
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
