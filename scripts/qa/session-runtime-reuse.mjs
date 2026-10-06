import { createRequire } from 'node:module';
import { connectSession } from './session-postgres-support.mjs';
import { nativeSessionRpc } from './session-runtime-rpc.mjs';
const require=createRequire(import.meta.url);
const { DurableRankedAuth }=require('../../server/dist/services/DurableRankedAuth.js');
const [token,userId]=process.argv.slice(2),client=await connectSession('service_role');
try {
    const proof=await new DurableRankedAuth(nativeSessionRpc(client)).verifySession(token,userId);
    process.stdout.write(JSON.stringify({userId:proof?.userId,pid:client.fixturePid}));
}finally{await client.end();}
