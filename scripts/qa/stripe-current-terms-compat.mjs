// Apply T3's immutable migration only to the successful disposable sandbox DB.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile,writeFile,realpath,statfs} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url)),task=path.resolve(root,'../..');
const evidence=JSON.parse(await readFile(path.join(task,'outputs/stripe-checkout-e2e-current.json'),'utf8'));
const spent=JSON.parse(await readFile(path.join(task,'outputs/stripe-sandbox-consumption-'+evidence.run+'.json'),'utf8'));
assert.equal(spent.completed,true);assert.equal(spent.run,evidence.run);assert.equal(evidence.livemode,false);assert.equal(evidence.database.host,'127.0.0.1');
const capacity=await statfs(task);assert(capacity.bavail*capacity.bsize>=300*1024*1024);
const cluster=await realpath(evidence.database.cluster),parent=await realpath(path.join(task,'work/e2e-root-e77e298/scratch/stripe-postgres'));
assert(cluster.startsWith(parent+path.sep));assert(/^qa_[a-z]{8}$/.test(evidence.database.name));
const source='9c0aec70b7f17cec2f9f1a765d39f810c4294ae9',migration='20261003042315_approved_current_terms_consent.sql';
const {stdout:sql}=await promisify(execFile)('git',['show',source+':supabase/migrations/'+migration],{cwd:root,encoding:'utf8',windowsHide:true,maxBuffer:1024*1024,timeout:10000});
const report={run:evidence.run,sourceCommit:source,migration,sha256:createHash('sha256').update(sql).digest('hex'),completed:false,checks:[],scope:'Native disposable sandbox SQL upgrade; publication date and consent are dummy fixtures. No production date or user consent is modified.'};
const output=path.join(task,'outputs/stripe-current-terms-compat-'+evidence.run+'.json');
const require=createRequire(path.join(root,'scratch/stripe-postgres/package.json'));const {Client}=require('pg');
const settings={host:'127.0.0.1',port:evidence.database.port,user:'fixtureadmin',database:evidence.database.name};
const admin=new Client(settings),service=new Client(settings);
const row=async(sql,args=[]) => (await service.query(sql,args)).rows[0].result;
const grant=()=>row('select public.claim_stripe_member_daily_grant_with_schedule($1) as result',[evidence.user]);
const status=()=>row('select public.stripe_member_status_with_schedule($1) as result',[evidence.user]);
const consent=()=>row("select public.accept_current_account_terms($1,'2026-10-03.1') as result",[evidence.user]);
const denied=operation=>assert.rejects(operation,error=>error.code==='42501');
try{
 await admin.connect();await service.connect();await service.query('set role service_role');
 const directory=(await admin.query("select current_setting('data_directory') as directory")).rows[0].directory;assert.equal(await realpath(directory),cluster);
 assert.equal((await admin.query('select count(*)::integer as n from public.stripe_checkout_intents where livemode')).rows[0].n,0);
 const before=await status();assert.equal(before.active,true);assert.deepEqual(before.tickets,{ranked:2,hint:2});
 // Bring only the minimal QA consent table up to the real migration's column contract.
 // Existing legacy dummy consent is preserved; its user/version are never changed.
 await admin.query('alter table public.account_terms_consents add column accepted_at timestamptz not null default clock_timestamp(); alter table public.account_terms_consents add primary key(user_id,version)');
 await admin.query(sql);
 await denied(consent);await denied(grant);
 await denied(()=>row('select public.stripe_checkout_preflight($1) as result',[evidence.user]));
 assert.equal((await status()).active,true);
 report.checks.push('unpublished terms block new checkout/grant/acceptance while existing membership remains visible');
 await admin.query("update public.current_terms_policy set effective_date=(clock_timestamp() at time zone 'Asia/Tokyo')::date");
 await denied(grant);await denied(()=>row('select public.stripe_checkout_preflight($1) as result',[evidence.user]));
 report.checks.push('legacy consent alone still cannot claim or start checkout after fixture publication');
 const accepted=await consent(),repeat=await consent();assert(accepted.effective);assert.equal(accepted.consent.acceptedAt,repeat.consent.acceptedAt);
 const claimed=await grant();assert.equal(claimed.claimed,false);assert.deepEqual(claimed.credited,{ranked:0,hint:0});assert.deepEqual(claimed.tickets,{ranked:2,hint:2});
 const preflight=await row('select public.stripe_checkout_preflight($1) as result',[evidence.user]);assert.equal(preflight.eligible,false);assert.equal(preflight.reason,'subscription_unresolved');
 report.checks.push('current consent is idempotent, already claimed day grants zero, existing subscription blocks duplicate checkout');
 await denied(()=>service.query('update public.current_terms_policy set effective_date=current_date'));
 report.checks.push('service role cannot activate publication policy');
 report.completed=true;report.resultingTickets=claimed.tickets;report.completedAt=new Date().toISOString();
 console.log(JSON.stringify(report));
}catch(error){report.error={code:error.code??null,reason:'CURRENT_TERMS_COMPATIBILITY_FAILED'};console.error(JSON.stringify(report.error));process.exitCode=1;}
finally{await writeFile(output,JSON.stringify(report,null,2)+'\n');await service.end();await admin.end();}
