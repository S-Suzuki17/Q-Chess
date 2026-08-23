import { io } from 'socket.io-client';
import assert from 'assert';

const SERVER_URL = 'http://localhost:3001';

async function runTests() {
    console.log("Starting Node 6 Security & Auth Tests...");
    let passed = 0;
    let failed = 0;

    function check(name, testFn) {
        return new Promise(async (resolve) => {
            try {
                await testFn();
                console.log(`[PASS] ${name}`);
                passed++;
                resolve();
            } catch (e) {
                console.error(`[FAIL] ${name}`);
                console.error(e.message);
                failed++;
                resolve();
            }
        });
    }

    await check("1. Missing Token -> Rejected", () => {
        return new Promise((resolve, reject) => {
            const socket = io(SERVER_URL, { auth: {} });
            socket.on('connect_error', (err) => {
                if (err.message.includes('No token provided')) resolve();
                else reject(new Error('Wrong error: ' + err.message));
            });
            socket.on('connect', () => reject(new Error('Should not connect')));
        });
    });

    await check("2. Invalid Token -> Rejected", () => {
        return new Promise((resolve, reject) => {
            const socket = io(SERVER_URL, { auth: { token: 'invalid_jwt_format' } });
            socket.on('connect_error', (err) => {
                if (err.message.includes('Invalid token')) resolve();
                else reject(new Error('Wrong error: ' + err.message));
            });
            socket.on('connect', () => reject(new Error('Should not connect')));
        });
    });

    await check("3. A's Token for B's MatchId -> Rejected", () => {
        return new Promise((resolve, reject) => {
            // A creates match, B tries to sync A's match
            const sA = io(SERVER_URL, { auth: { token: 'anon_A' } });
            const sB = io(SERVER_URL, { auth: { token: 'anon_B' } });
            
            sA.on('connect', () => sA.emit('join_queue', { timeControl: 10 }));
            sB.on('connect', () => sB.emit('join_queue', { timeControl: 10 }));

            sA.on('match_found', (data) => sA.emit('connect_match', { matchId: data.matchId }));
            sB.on('match_found', (data) => sB.emit('connect_match', { matchId: data.matchId }));

            let matchId;
            sA.on('match_start', (state) => {
                matchId = state.matchId;
                
                // C (unrelated) tries to sync A & B's match
                const sC = io(SERVER_URL, { auth: { token: 'anon_C' } });
                sC.on('connect', () => {
                    sC.emit('request_sync', { matchId });
                });
                
                sC.on('error', (err) => {
                    if (err.message.includes('Unauthorized')) {
                        sA.disconnect(); sB.disconnect(); sC.disconnect();
                        resolve();
                    } else reject(new Error('Wrong error: ' + err.message));
                });
            });
        });
    });

    await check("4. A's Token spoofing B's playerId -> Rejected", () => {
        return new Promise((resolve, reject) => {
            const sA = io(SERVER_URL, { auth: { token: 'anon_A2' } });
            const sB = io(SERVER_URL, { auth: { token: 'anon_B2' } });
            
            sA.on('connect', () => sA.emit('join_queue', { timeControl: 600 }));
            sB.on('connect', () => sB.emit('join_queue', { timeControl: 600 }));

            sA.on('match_found', (data) => sA.emit('connect_match', { matchId: data.matchId }));
            sB.on('match_found', (data) => sB.emit('connect_match', { matchId: data.matchId }));

            sA.on('match_start', (state) => {
                // A tries to send move as B
                sA.emit('player_action', {
                    actionId: 'fake_action',
                    version: state.version,
                    playerId: 'anon_B2', // Spoofing!
                    action: { type: 'MOVE', payload: {} }
                });
            });

            sA.on('action_error', (err) => {
                if (err.message.includes('Unauthorized')) {
                    sA.disconnect(); sB.disconnect();
                    resolve();
                } else reject(new Error('Wrong error: ' + err.message));
            });
        });
    });

    console.log(`\nTests completed: ${passed} passed, ${failed} failed`);
    if (failed > 0) process.exit(1);
}

runTests();
