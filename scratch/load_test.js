import { io } from 'socket.io-client';

const SERVER_URL = 'http://localhost:3001';
const CONCURRENT_USERS = parseInt(process.argv[2]) || 10;

console.log(`Starting load test with ${CONCURRENT_USERS} concurrent users...`);

let connectedCount = 0;
let matchedCount = 0;
const sockets = [];
const latencies = [];

for (let i = 0; i < CONCURRENT_USERS; i++) {
    const socket = io(SERVER_URL, { auth: { token: `anon_load_${i}` } });
    sockets.push(socket);

    let actionStartTime = 0;

    socket.on('connect', () => {
        connectedCount++;
        socket.emit('join_queue', { timeControl: 10 });
    });

    socket.on('match_found', (data) => {
        matchedCount++;
        socket.emit('connect_match', { matchId: data.matchId });
    });

    socket.on('match_start', (state) => {
        setTimeout(() => {
            actionStartTime = Date.now();
            socket.emit('player_action', {
                actionId: `resign_${i}`,
                version: state.version,
                action: { type: 'RESIGN', payload: {} }
            });
        }, 1000 + Math.random() * 2000);
    });

    socket.on('sync_state', (state) => {
        if (actionStartTime > 0) {
            latencies.push(Date.now() - actionStartTime);
            actionStartTime = 0; // Reset
        }
        if (state.gameOver) {
            socket.disconnect();
        }
    });

    socket.on('disconnect', () => {
        connectedCount--;
    });
}

const interval = setInterval(() => {
    // console.log(`Connected: ${connectedCount}, Matched: ${matchedCount}`);
    if (connectedCount === 0 && matchedCount === CONCURRENT_USERS) {
        clearInterval(interval);
        
        if (latencies.length > 0) {
            latencies.sort((a, b) => a - b);
            const p50 = latencies[Math.floor(latencies.length * 0.5)];
            const p95 = latencies[Math.floor(latencies.length * 0.95)];
            const p99 = latencies[Math.floor(latencies.length * 0.99)];
            const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;
            
            console.log(`\nLoad test completed successfully for ${CONCURRENT_USERS} users.`);
            console.log(`- Actions sent: ${latencies.length}`);
            console.log(`- Average Latency: ${avg.toFixed(2)} ms`);
            console.log(`- p50 Latency: ${p50} ms`);
            console.log(`- p95 Latency: ${p95} ms`);
            console.log(`- p99 Latency: ${p99} ms`);
            console.log(`- Peak Memory: ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB`);
        }
        
        process.exit(0);
    }
}, 1000);

setTimeout(() => {
    console.log(`Load test timeout. Connected: ${connectedCount}, Matched: ${matchedCount}`);
    process.exit(1);
}, 15000);
