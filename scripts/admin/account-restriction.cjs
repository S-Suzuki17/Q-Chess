// Operator-only CLI. Never import into Web/Android and never pass credentials as command arguments.
const path=require('node:path');
require('../../server/node_modules/dotenv').config({path:path.resolve(__dirname,'../../server/.env'),quiet:true});
const {createClient}=require('../../server/node_modules/@supabase/supabase-js');
const [action,id,confirmation]=process.argv.slice(2);
if(!['block','unblock'].includes(action)||!id||id.length>256||confirmation!==`--confirm=${id}`){
    console.error('Usage: node scripts/admin/account-restriction.cjs <block|unblock> <exact-account-id> --confirm=<same-id>');process.exit(1);
}
const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!url||new URL(url).protocol!=='https:'||!key){console.error('Server-only HTTPS credentials required.');process.exit(1);}
const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(10000)})}});
(async()=>{
    const {error}=await client.rpc('set_account_restriction',{p_user_id:id,p_blocked:action==='block'});
    if(error){console.error('Restriction update failed; no private server details printed.');process.exitCode=1;return;}
    console.log('Restriction and minimal audit record saved. Active connections are checked within 30 seconds. Self-deletion and recovery remain available.');
})().catch(()=>{console.error('Restriction service unavailable.');process.exitCode=1;});
