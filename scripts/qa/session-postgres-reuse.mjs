// Separate process/client: no local bearer-session map can be inherited.
import assert from 'node:assert/strict';
import { connectSession, verify } from './session-postgres-support.mjs';
const [hash, user] = process.argv.slice(2);
assert.match(hash, /^[a-f0-9]{64}$/);
const client = await connectSession('service_role');
try {
    const result = await verify(client, hash, user);
    assert.equal(result.status, 'valid');
    console.log(JSON.stringify({ status: result.status, userId: result.userId, backendPid: client.fixturePid }));
} finally { await client.end(); }
