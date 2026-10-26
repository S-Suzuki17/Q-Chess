// Local-only Socket.IO transport comparison using the actual public board format.
// Run free-runtime-latency.mjs prepare after first. No real users or server credentials.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { io as connect } from 'socket.io-client';
const require = createRequire(import.meta.url);
const { Server } = require(require.resolve('socket.io', { paths: [path.resolve('server')] }));
const { GameEngine, createInitialBoard } = require(path.resolve('build/free-runtime-latency/after/server.cjs'));
const state = new GameEngine('local-probe', 'white', 'black', createInitialBoard(), 600).getPublicState('white');
const wireState = JSON.parse(JSON.stringify(state));
const compression = { threshold: 2048, concurrencyLimit: 2, serverNoContextTakeover: true,
    clientNoContextTakeover: true, serverMaxWindowBits: 12, zlibDeflateOptions: { level: 3, memLevel: 5 } };

async function trial(enabled, clientCompression = true, transport = 'websocket', count = 16, frames = 40) {
    const http = createServer();
    const io = new Server(http, { perMessageDeflate: enabled ? compression : false });
    await new Promise(resolve => http.listen(0, '127.0.0.1', resolve));
    const clients = [];
    try {
        for (let i = 0; i < count; i++) {
            const client = connect(`http://127.0.0.1:${http.address().port}`, {
                transports: [transport], reconnection: false, forceNew: true, perMessageDeflate: clientCompression,
            });
            clients.push(client);
            await Promise.race([once(client, 'connect'), once(client, 'connect_error').then(([error]) => { throw error; })]);
        }
        const bytes = () => clients.reduce((sum, client) => sum + (client.io.engine.transport.ws?._socket.bytesRead ?? 0), 0);
        const startBytes = bytes();
        const cpu = process.cpuUsage();
        const started = performance.now();
        const latencies = [];
        for (let i = 0; i < frames; i++) {
            const received = clients.map(client => once(client, 'sync_state'));
            const sentAt = performance.now();
            io.emit('sync_state', state);
            const states = await Promise.all(received);
            latencies.push(performance.now() - sentAt);
            for (const [actual] of states) assert.deepEqual(actual, wireState);
        }
        const cpuUsed = process.cpuUsage(cpu);
        const elapsedMs = performance.now() - started;
        latencies.sort((a, b) => a - b);
        return { enabled, clientCompression, transport, clients: count, framesPerClient: frames,
            bytesReceived: bytes() - startBytes, bytesPerBoard: (bytes() - startBytes) / count / frames,
            elapsedMs, cpuMs: (cpuUsed.user + cpuUsed.system) / 1000,
            broadcastMedianMs: latencies[Math.floor(latencies.length / 2)], broadcastP95Ms: latencies[Math.ceil(latencies.length * .95) - 1],
            negotiated: clients[0].io.engine.transport.ws?.extensions ?? 'polling', identicalBoards: true };
    } finally { for (const client of clients) client.disconnect(); await new Promise(resolve => io.close(resolve)); }
}
const results = [];
for (const enabled of [false, true, true, false]) results.push(await trial(enabled));
results.push(await trial(true, false, 'websocket', 1, 2));
results.push(await trial(true, true, 'polling', 1, 2));
const report = { measuredAt: new Date().toISOString(), environment: 'Local Node server and clients; excludes Internet latency',
    serializedBoardBytes: Buffer.byteLength(JSON.stringify(state)), compression, results };
await writeFile('build/free-runtime-latency/socket-compression.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
