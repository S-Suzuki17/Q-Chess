import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import type {PGlite} from '@electric-sql/pglite';
import {historicalCommerceDatabase,applyMigrations,releaseCommerceMigrations} from './fixtures/commerceDatabaseFixture';
import {learningWeek,generateWeeklyProblems} from '../learning/weeklyProblems';
import {tutorialCourse} from '../learning/tutorialCourse';
let db:PGlite;
const scalar=async(sql:string,values:unknown[]=[]) => (await db.query<{result:any}>(sql,values)).rows[0]?.result;
const claim=(id:string,lesson:string)=>scalar('select public.complete_learning($1,\'tutorial\',$2,null,null) as result',[id,lesson]);
const weekly=(id:string,week:string,n:number)=>scalar('select public.complete_learning($1,\'weekly\',null,$2,$3) as result',[id,week,n]);
const owner=async(sql:string,values:unknown[]=[])=>{
    await db.exec('reset role');
    try{return await db.query(sql,values);}finally{await db.exec('set role service_role');}
};
describe('atomic learning SQL on the public commerce migration chain',()=>{
 beforeAll(async()=>{
    db=await historicalCommerceDatabase();
    await applyMigrations(db,[...releaseCommerceMigrations,'20261008054904_match_hint_tickets_and_free_practice.sql',
        '20261020111637_learning_rewards_and_weekly_problems.sql']);
    await db.exec(`insert into public.profiles(id,name) values('LearnAlice','Alice'),('LearnBob','Bob'),('LearnOverflow','Overflow');
      insert into public.account_terms_consents(user_id,version)
       select id,version from public.profiles cross join public.current_terms_policy where singleton;
      set role service_role;`);
 },30000);
 afterAll(async()=>{await db?.close();});
 it('alternates first clears across lessons and never changes balances on replay',async()=>{
    const first=await claim('LearnAlice','pawn-step'),again=await claim('LearnAlice','pawn-step');
    expect(first).toMatchObject({firstClear:true,reward:'ranked',tickets:{ranked:1,hint:0}});
    expect(again).toMatchObject({firstClear:false,reward:null,tickets:first.tickets});
    expect(await claim('LearnAlice','rook')).toMatchObject({reward:'hint',tickets:{ranked:1,hint:1}});
    expect(await claim('LearnAlice','bishop')).toMatchObject({reward:'ranked',tickets:{ranked:2,hint:1}});
    for(const lesson of tutorialCourse.filter(l=>!['pawn-step','rook','bishop'].includes(l.id)))await claim('LearnAlice',lesson.id);
    expect(await claim('LearnAlice','pawn-step')).toMatchObject({tickets:{ranked:13,hint:12}});
    expect(await claim('LearnBob','pawn-step')).toMatchObject({reward:'ranked',tickets:{ranked:1,hint:0}});
 });
 it('rejects unknown lessons, unauthenticated users, old terms and deleting accounts',async()=>{
    await expect(claim('LearnBob','invented')).rejects.toThrow();
    await expect(claim('GUEST-x','pawn-step')).rejects.toThrow();
    await owner("insert into public.account_deletion_jobs(user_id,phase) values('LearnBob','pending')");
    await expect(claim('LearnBob','rook')).rejects.toThrow('ACCOUNT_UNAVAILABLE');
    await owner("insert into public.profiles(id,name) values('NoTerms','NoTerms')");
    await expect(claim('NoTerms','rook')).rejects.toThrow('CURRENT_TICKET_TERMS_REQUIRED');
 });
 it('publishes ten atomically, preserves an existing set and gates sequential clears/ads/final reward',async()=>{
    const now=Date.now(),period=learningWeek(now);
    const set=await generateWeeklyProblems(Date.parse(period.opensAt));
    const publish=(week:string,problems:unknown)=>scalar('select public.publish_learning_week($1,$2) as result',[week,JSON.stringify(problems)]);
    expect(await publish(period.week,set.problems)).toBe(true);
    expect(await publish(period.week,set.problems)).toBe(false);
    await expect(publish(learningWeek(now+7*86400000).week,set.problems)).rejects.toThrow();
    expect(await scalar('select count(*)::integer as result from public.learning_weeks')).toBe(1);
    await expect(weekly('LearnAlice',period.week,2)).rejects.toThrow('COMPLETE_PREVIOUS_PROBLEM');
    for(let n=1;n<=10;n++){
        const receipt=await weekly('LearnAlice',period.week,n);
        expect(receipt.adCheckpoint).toBe(n===5||n===10?n:0);
        expect(receipt.reward).toBe(n===10?'ranked':null);
        expect(receipt.weekly).toEqual(Array.from({length:n},(_,i)=>i+1));
        const duplicate=await weekly('LearnAlice',period.week,n);
        expect(duplicate).toMatchObject({firstClear:false,reward:null,adCheckpoint:0,tickets:receipt.tickets});
    }
    expect(await weekly('LearnAlice',period.week,10)).toMatchObject({weeklyRewarded:true,tickets:{ranked:14,hint:12}});
    const future=await generateWeeklyProblems(Date.parse(period.opensAt)+7*86400000,new Set(set.problems.map(p=>p.positionKey)));
    await publish(future.week,future.problems);
    await expect(weekly('LearnAlice',future.week,1)).rejects.toThrow('WEEK_EXPIRED');
 },15000);
 it('rolls back the receipt when the wallet cannot accept a reward',async()=>{
    await owner('insert into public.ticket_wallets(user_id,ranked_tickets) values($1,9007199254740991)',['LearnOverflow']);
    await expect(claim('LearnOverflow','pawn-step')).rejects.toThrow('TICKET_BALANCE_OVERFLOW');
    expect(await scalar("select count(*)::integer as result from public.tutorial_completions where user_id='LearnOverflow'")).toBe(0);
 });
 it('denies browser roles both direct tables and every reward/publication RPC',async()=>{
    await db.exec('reset role');
    for(const role of ['anon','authenticated']){
        await db.exec(`set role ${role}`);
        for(const table of ['learning_weeks','learning_problems','tutorial_completions','weekly_problem_completions']){
            await expect(db.query(`select * from public.${table}`)).rejects.toThrow();
        }
        await expect(claim('LearnAlice','pawn-step')).rejects.toThrow();
        await expect(db.query("select public.learning_progress('LearnAlice',null)")).rejects.toThrow();
        await expect(db.query("select public.publish_learning_week('2026-10-20','[]')")).rejects.toThrow();
        await db.exec('reset role');
    }
    const tables=await db.query<{relrowsecurity:boolean}>(`select relrowsecurity from pg_class where relname in
      ('learning_weeks','learning_problems','tutorial_completions','weekly_problem_completions')`);
    expect(tables.rows).toHaveLength(4);expect(tables.rows.every(t=>t.relrowsecurity)).toBe(true);
    await db.exec('set role service_role');
 });
});
