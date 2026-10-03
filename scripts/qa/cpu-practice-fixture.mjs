// Embedded PostgreSQL only. No project URL, credentials or external DB connection.
// Setup: npm install --prefix scratch/ticket-sql --save-exact @electric-sql/pglite@0.5.8 --ignore-scripts
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
const require = createRequire(new URL('../../scratch/ticket-sql/package.json',import.meta.url));
const { PGlite } = require('@electric-sql/pglite');
export async function createCpuPracticeFixture() {
    const db = await PGlite.create();
    await db.exec(`
        create role anon; create role authenticated; create role service_role bypassrls;
        create table public.profiles(id text primary key);
        create table public.account_deletion_jobs(user_id text,phase text);
        create table public.account_restrictions(user_id text,blocked boolean);
        create table public.account_terms_consents(user_id text,version text);
        create table public.ticket_wallets(user_id text primary key references public.profiles(id) on delete cascade,
            ranked_tickets integer not null default 0 check(ranked_tickets between 0 and 20),
            hint_tickets integer not null default 0 check(hint_tickets between 0 and 20),
            member_ranked_tickets integer not null default 0 check(member_ranked_tickets between 0 and 20),
            member_hint_tickets integer not null default 0 check(member_hint_tickets between 0 and 20),
            member_ticket_subscription_id text,test_member_ranked_tickets integer not null default 0,
            test_member_hint_tickets integer not null default 0);
        create table public.stripe_checkout_intents(checkout_id text primary key,user_id text,price_id text,livemode boolean);
        create table public.stripe_customer_links(customer_id text primary key,user_id text);
        create table public.stripe_memberships(subscription_id text primary key,checkout_id text,customer_id text,
            user_id text,status text,period_end timestamptz,refund_blocked_until timestamptz,current_price_id text);
        grant usage on schema public to anon,authenticated,service_role;
        grant all on all tables in schema public to service_role;
        insert into public.profiles values('Alice'),('Bob'),('Carol');
        insert into public.account_terms_consents values('Alice','2026-09-25.1'),('Bob','2026-09-25.1'),('Carol','2026-09-25.1');
        insert into public.ticket_wallets(user_id,hint_tickets) values('Alice',20),('Bob',0),('Carol',20);
    `);
    for (const file of ['20260930133414_atomic_ticket_spending.sql','20261001000000_cpu_hint_receipts.sql']) {
        await db.exec(await readFile(new URL('../../supabase/migrations/'+file,import.meta.url),'utf8'));
    }
    const call = async (name, parameters) => db.transaction(async tx => {
        await tx.exec('set local role service_role');
        const entries = Object.entries(parameters);
        const result = await tx.query(`select public.${name}(${entries.map(([key],i)=>`${key} => $${i+1}`).join(',')}) as result`,
            entries.map(([,value])=>value && typeof value==='object'?JSON.stringify(value):value));
        return result.rows[0].result;
    });
    const client = {rpc(name,parameters){return {async abortSignal(){
        try{return {data:await call(name,parameters),error:null};}
        catch(error){return {data:null,error:{message:error.message,code:error.code}};}
    }}}};
    const wallet = async userId => (await db.query('select * from public.ticket_wallets where user_id=$1',[userId])).rows[0];
    return { db,client,call,wallet };
}
