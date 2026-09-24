// Import only explicitly allowed public settings; never copy secrets into a release.
const { loadEnvConfig } = require('@next/env');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const {readFileSync}=require('node:fs');
const target=process.argv[3]??'android';
if(!['android','web'].includes(target))throw new Error('Invalid build target');
const androidBuild=target==='android'?/\bversionCode\s+(\d+)/.exec(readFileSync('android/app/build.gradle','utf8'))?.[1]:'0';
if(!androidBuild)throw new Error('Android versionCode is required');

const sourceRoot = process.argv[2];
if (!sourceRoot) throw new Error('Usage: node scripts/release/build-android-web.cjs <configured-project-directory>');
const originalEnv = { ...process.env };
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
const result = spawnSync(process.execPath, [require.resolve('next/dist/bin/next'), 'build'], {
    cwd: process.cwd(), stdio: 'inherit',
    env: {
        ...originalEnv, NODE_ENV: 'production', QG_RELEASE_BUILD: '1',
        NEXT_PUBLIC_APP_TARGET: target,
        NEXT_PUBLIC_ANDROID_VERSION_CODE: androidBuild,
        NEXT_PUBLIC_FOUNDERS_REWARDS_ENABLED: 'false',
        NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_ANON_KEY: key,
        NEXT_PUBLIC_SERVER_URL: server,
        NEXT_PUBLIC_ADMOB_LIVE: 'false', NEXT_PUBLIC_NATIVE_REWARDS_ENABLED: 'false',
        NEXT_PUBLIC_NATIVE_INTERSTITIAL_ENABLED: 'false',
    },
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
