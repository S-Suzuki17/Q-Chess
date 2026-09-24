import { readFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
import { parse } from 'dotenv';

// Read-only transport diagnostic. Never log credentials or row payloads.
const env = parse(await readFile(new URL('../.vercel/.env.production.local', import.meta.url)));
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url?.startsWith('https://') || !key) throw new Error('Missing public connection settings');
const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
const channels = [];
const clean = value => typeof value === 'string' ? value.replace(/[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]+/g, '[token]').slice(0, 500) : undefined;
for (const table of ['game_records', 'profiles']) {
    for (const projection of [true, false]) {
        const channel = client.channel(`readonly-diagnostic:${crypto.randomUUID()}`);
        const filter = { event: '*', schema: 'public', table, ...(projection ? { select: ['id'] } : {}) };
        channel.on('system', {}, value => console.log(JSON.stringify({table,projection,systemStatus:clean(value?.status),message:clean(value?.message)})));
        channel.on('postgres_changes', filter, () => {}).subscribe((status, error) => {
            console.log(JSON.stringify({table,projection,status,message:clean(error?.message)}));
        });
        channels.push(channel);
    }
}
await new Promise(resolve => setTimeout(resolve, 45000));
console.log('45-second read-only observation completed; closing diagnostic channels.');
await client.removeAllChannels();
client.realtime.disconnect();
