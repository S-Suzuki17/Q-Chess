import assert from 'node:assert/strict';
// Native, parameterized RPC bridge. Exercises the actual TypeScript adapter and
// repository SQL, not PostgREST/HTTP/Supabase JWT or provider credentials.
const calls = {
    legacy_session_runtime_version: [],
    issue_legacy_session: ['p_user_id','p_password','p_token_hash','p_persistent'],
    inspect_legacy_session: ['p_token_hash','p_expected_user_id'],
    inspect_live_legacy_sessions: ['p_sessions'],
    revoke_legacy_session: ['p_token_hash'],
    revoke_user_legacy_sessions: ['p_user_id'],
};
export function nativeSessionRpc(client) {
    return async (name, parameters, signal) => {
        assert.ok(Object.hasOwn(calls,name));
        assert.deepEqual(Object.keys(parameters).sort(),[...calls[name]].sort());
        if(signal.aborted)throw Error('Aborted native test request');
        const values=calls[name].map(key=>key==='p_sessions'?JSON.stringify(parameters[key]):parameters[key]);
        try {
            const result=await client.query(`select public.${name}(${values.map((_,i)=>'$'+(i+1)).join(',')}) as result`,values);
            return {data:result.rows[0].result,error:null};
        }catch{return {data:null,error:{code:'NATIVE_RPC_FAILED'}};}
    };
}
