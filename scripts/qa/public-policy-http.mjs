// Public, unauthenticated HTTP only. Never sends cookies, credentials or mutation requests.
import {writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const googlePlayOnly=process.argv.includes('--google-play-only');
const agents=googlePlayOnly?{googlePlay:'GooglePlayConsole'}:{browser:'Mozilla/5.0',googlebot:'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',plain:'QG-PublicPolicyCheck/1.0'};
const urls=googlePlayOnly?['https://q-gambit.com/privacy','https://q-gambit.com/privacy/']:['https://q-gambit.com/privacy','https://www.q-gambit.com/privacy','https://q-gambit.com/account-deletion','https://q-gambit-web.pages.dev/privacy'];
const methods=googlePlayOnly?['GET','HEAD']:['GET'];
const results=await Promise.all(urls.flatMap(url=>Object.entries(agents).flatMap(([agent,userAgent])=>methods.map(async method=>{
 try{const res=await fetch(url,{method,headers:{'User-Agent':userAgent},redirect:'follow',signal:AbortSignal.timeout(20000)}),body=await res.text();return{url,agent,method,status:res.status,finalUrl:res.url,contentType:res.headers.get('content-type'),server:res.headers.get('server'),cfMitigated:res.headers.get('cf-mitigated'),bytes:Buffer.byteLength(body),sha256:createHash('sha256').update(body).digest('hex'),challenge:/Just a moment|Attention Required|cf-chl-/i.test(body),hasDeletionGuidance:method==='GET'?/アカウント.{0,10}削除|account.{0,10}delet/i.test(body):null};}catch(e){return{url,agent,method,error:e.code??e.name};}
}))));
await writeFile(process.argv[2]??'scratch/public-policy-http.json',JSON.stringify({verifiedAt:new Date().toISOString(),results,limits:'Current direct HTTP from this PC; does not prove Google Play server access or Cloudflare WAF configuration.'},null,2)+'\n');
for(const r of results)console.log(JSON.stringify(r));
