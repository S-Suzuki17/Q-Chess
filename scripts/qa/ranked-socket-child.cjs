// Disposable child runs the actual compiled server. Only release gates and
// listen address are overridden; identity, handlers, stores and rules are real.
const assert=require('node:assert/strict'),path=require('node:path'),http=require('node:http');
console.log('Local game-server bootstrap started');
assert.equal(process.env.QG_LOCAL_FIXTURE,'1');
const origin=new URL(process.env.SUPABASE_URL).origin;
assert.equal(new URL(origin).hostname,'127.0.0.1');
const nativeFetch=globalThis.fetch;
globalThis.fetch=(input,init)=>{
    const url=new URL(typeof input==='string'||input instanceof URL?input:input.url);
    assert.equal(url.origin,origin,'External service forbidden');
    return nativeFetch(input,{...init,redirect:'error'});
};
const root=path.resolve(__dirname,'../..');
const gates=require(path.join(root,'server/dist/services/TicketFeatureGates.js'));
gates.rankedTicketAdmissionEnabled=()=>true;
gates.rankedAdmissionRecoveryEnabled=()=>true;
// Billing, hints, ads, Play verification and source release gates stay OFF.
const listen=http.Server.prototype.listen;
http.Server.prototype.listen=function(...args){
    const callback=typeof args.at(-1)==='function'?args.at(-1):undefined;
    return listen.call(this,0,'127.0.0.1',()=>{
        callback?.();process.send?.({ready:true,port:this.address().port});
    });
};
require(path.join(root,'server/dist/index.js'));
console.log('Local game-server modules loaded');
