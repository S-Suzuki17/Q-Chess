import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';

// This is a blocker-detection test, NOT evidence that fresh install is ready.
// Never silently exclude the obsolete draft or rewrite SQL to hide the failure.
describe('fresh full-history migration readiness blockers', () => {
    it('executes sorted raw history and detects the duplicated historical settlement draft', async () => {
        const db = await PGlite.create();
        try {
            await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
                create table public.profiles(id text primary key,name text,password_hash text,
                    rating integer default 1000,rating_10s integer default 1000,rating_3m integer default 1000,rating_10m integer default 1000);
                create table public.game_records(id uuid primary key,created_at timestamptz default now(),
                    white_player text,black_player text,winner text,mode text,cpu_level integer,moves jsonb,total_moves integer,
                    white_id text,black_id text,time_control text);
                grant usage on schema public to anon,authenticated,service_role;
                grant all on all tables in schema public to service_role;`);
            const directory = resolve(process.cwd(), 'supabase/migrations');
            const all = (await readdir(directory)).filter(f => f.endsWith('.sql')).sort();
            const applied: string[] = [];
            let failedFile: string | null = null;
            let failure: unknown;
            for (const file of all) {
                try { await db.exec(await readFile(resolve(directory, file), 'utf8')); applied.push(file); }
                catch (error) { failedFile = file; failure = error; break; }
            }
            expect(all).toHaveLength(39);
            expect(all.at(-1)).toBe('20261006154443_dormant_legacy_session_runtime.sql');
            expect(applied).toEqual(['20260918062045_ranked_server_settlement.sql']);
            expect(failedFile).toBe('20260918072145_ranked_server_settlement.sql');
            expect(String(failure)).toMatch(/relation "ranked_match_settlements" already exists/);
        } finally { await db.close(); }
    }, 30_000);
    it('verifies pg_cron is unavailable in PGlite rather than substituting a fake scheduler', async () => {
        const db = await PGlite.create();
        try {
            const path = resolve(process.cwd(), 'supabase/migrations/20260924170450_account_audit_retention_schedule.sql');
            await expect(db.exec(await readFile(path, 'utf8'))).rejects.toThrow(/pg_cron.*not available|extension.*pg_cron/i);
        } finally { await db.close(); }
    }, 30_000);
});
