import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {resolve} from 'node:path';

/** Synthetic session for an actual exported Supabase client, including the
 * unconfigured CI export. Callers must intercept every external HTTP request. */
export async function exportedGoogleSession(root,user) {
 const projects=new Set();
 for(const file of await readdir(resolve(root,'_next/static'),{recursive:true})){
  if(!file.endsWith('.js'))continue;
  const source=await readFile(resolve(root,'_next/static',file),'utf8');
  for(const match of source.matchAll(/["']https:\/\/([a-z0-9]+)\.supabase\.co\/?["']/g))projects.add(match[1]);
 }
 const configured=[...projects].filter(project=>project!=='placeholder');
 assert(configured.length===1||(configured.length===0&&projects.has('placeholder')),'Expected one exported Auth project');
 const sessionKey=`sb-${configured[0]??'placeholder'}-auth-token`;
 const authId='11111111-1111-4111-8111-111111111111',expiresAt=Math.floor(Date.now()/1000)+3600;
 const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
 const token=encode({alg:'HS256',typ:'JWT'})+'.'+encode({sub:authId,session_id:authId,exp:expiresAt,amr:[{method:'oauth',timestamp:expiresAt-3600}]})+'.synthetic';
 const authUser={id:authId,aud:'authenticated',role:'authenticated',email:'fixture@example.invalid',is_anonymous:false,app_metadata:{provider:'google',providers:['google']},user_metadata:{},identities:[{provider:'google'}],created_at:'2026-10-20T00:00:00Z'};
 return {sessionKey,authUser,session:{access_token:token,refresh_token:'synthetic-refresh',expires_at:expiresAt,expires_in:3600,token_type:'bearer',user:authUser},
  account:{authId,userId:user.id,username:user.id,name:user.name},proof:{userId:user.id,token,expiresAt:expiresAt*1000}};
}
