// Parent-owned loopback fixture only. No Stripe/Supabase URL or key is accepted.
import { createRequire } from 'node:module';
import storeModule from '../../server/dist/services/StripeMembershipStore.js';
const require=createRequire(new URL('../../scratch/stripe-postgres/package.json',import.meta.url));
const {Client}=require('pg');
const [portText,user,subscription,checkout,event,status,createdText,end,phase]=process.argv.slice(2);
const port=Number(portText);
if(!process.send||!Number.isInteger(port)||port<1024||!['leased','committed'].includes(phase))throw new Error('Fixture-only child');
const client=new Client({host:'127.0.0.1',port,user:'fixtureadmin',database:'postgres'});
await client.connect();await client.query('set role service_role');
let lastResult,lastSqlCode;
// Actual application Store + real SQL. Only the PostgREST transport is replaced
// by a loopback Client so no hosted Supabase credentials are needed.
const allowed=new Set(['acquire_stripe_reconciliation','release_stripe_reconciliation','apply_stripe_canonical_membership_snapshot']);
const rpc=(name,args)=>({abortSignal:async()=>{
    if(!allowed.has(name)||Object.keys(args).some(key=>!/^p_[a-z_]+$/.test(key)))throw new Error('Fixture RPC guard');
    const fields=Object.keys(args);
    try {
        const data=(await client.query(`select public.${name}(${fields.map((key,i)=>key+' => $'+(i+1)).join(',')}) as result`,fields.map(key=>args[key]))).rows[0].result;
        lastResult=data;return {data,error:null};
    } catch(error){lastSqlCode=error.code;return {data:null,error:{code:error.code}};}
}});
const store=storeModule.createStripeMembershipStore({rpc},async()=>null,async()=>false);
let lease;
try{lease=await store.acquireReconciliation(subscription,false);}
catch(error){if(error.message!=='RECONCILIATION_BUSY')throw error;lease={token:null,retired:false};}
process.send({phase:'leased',...lease});
if(!lease.token){await client.end();process.exit(0);}
await new Promise(resolve=>process.once('message',resolve));
try {
    await store.applySnapshot({eventId:event,eventPayloadHash:'a'.repeat(64),eventType:'invoice.paid',eventCreated:Number(createdText),
        observedAt:new Date().toISOString(),subscriptionId:subscription,checkoutId:checkout,customerId:'cus_'+user,
        userId:user,priceId:'price_ABCDEFGH',status,periodEnd:end,paidNewPeriod:true,cancelAtPeriodEnd:false,
        livemode:false,reconciliationToken:lease.token});
    process.send({phase:'committed',result:lastResult});
    if(phase==='committed')await new Promise(()=>{}); // DB committed, acknowledgement intentionally lost
} catch(error) {process.send({phase:'rejected',code:lastSqlCode??error.code});}
await client.end();
