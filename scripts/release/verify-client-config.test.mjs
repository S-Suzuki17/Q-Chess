import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import config from './verify-client-config.cjs';
const expected={NEXT_PUBLIC_SUPABASE_URL:'https://fixture.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'sb_publishable_fixture',NEXT_PUBLIC_SERVER_URL:'https://fixture.invalid'};
test('detects unresolved Webpack aliases and computed public reads without matching quoted documentation',()=>{
 for(const code of ['x.env.NEXT_PUBLIC_SUPABASE_URL','process.env.NEXT_PUBLIC_QG_DAILY_LOGIN_REWARDS_ENABLED','x["env"]["NEXT_PUBLIC_APP_TARGET"]'])
  assert.equal(config.inspectJavaScript(code).unresolved.length,1);
 assert.deepEqual(config.inspectJavaScript('const docs="process.env.NEXT_PUBLIC_EXAMPLE";').unresolved,[]);
});
function fixture(source) {
 const root=mkdtempSync(path.join(tmpdir(),'qg-client-config-'));
 mkdirSync(path.join(root,'_next/static/chunks'),{recursive:true});
 writeFileSync(path.join(root,'_next/static/chunks/client.js'),source);
 return root;
}
test('refuses a successful export whose browser still reads an empty process shim',()=>{
 const root=fixture('const endpoint=e.env.NEXT_PUBLIC_SUPABASE_URL||"https://placeholder.supabase.co";');
 assert.throws(()=>config.verifyClientBuild(root,expected),/Unresolved public configuration/);
});
test('requires the expected configured project, public key and game server in real exported literals',()=>{
 const root=fixture('const config='+JSON.stringify(Object.values(expected))+';');
 assert.equal(config.verifyClientBuild(root,expected).unresolvedPublicReads,0);
 assert.throws(()=>config.verifyClientBuild(root,{...expected,NEXT_PUBLIC_SUPABASE_URL:'https://wrong.supabase.co'}),/Expected public setting is absent/);
});
test('does not expose expected credentials through errors',()=>{
 const root=fixture('const endpoint="https://placeholder.supabase.co";');
 try{config.verifyClientBuild(root,expected);assert.fail('Expected rejection');}catch(error){assert(!error.message.includes(expected.NEXT_PUBLIC_SUPABASE_ANON_KEY));}
});
