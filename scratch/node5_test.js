import { io } from 'socket.io-client';
import assert from 'assert';

const SERVER_URL = 'http://localhost:3001';

async function runTests() {
    console.log("Starting Node 5 Integration & Edge Cases Tests...");
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

    await check("1. Reconnection & Sync (Wait for opponent reconnect)", () => {
        return new Promise((resolve, reject) => {
            let s1 = io(SERVER_URL, { auth: { token: 'anon_A1' } });
            let s2 = io(SERVER_URL, { auth: { token: 'anon_B1' } });
            let matchId = null;

            s1.on('connect', () => { s1.emit('join_queue', { timeControl: 600 }); });
            s2.on('connect', () => { s2.emit('join_queue', { timeControl: 600 }); });

            s1.on('match_found', (data) => {
                matchId = data.matchId;
                s1.emit('connect_match', { matchId });
            });
            s2.on('match_found', (data) => {
                s2.emit('connect_match', { matchId: data.matchId });
            });

            s1.on('match_start', () => {
                // S1 connects, then suddenly disconnects
                s1.disconnect();
                
                // Reconnect S1
                setTimeout(() => {
                    s1 = io(SERVER_URL, { auth: { token: 'anon_A1' } });
                    s1.on('connect', () => {
                        // Request sync
                        s1.emit('request_sync', { matchId });
                    });

                    s1.on('sync_state', (state) => {
                        assert(state.matchId === matchId, "Should sync the same match");
                        s1.disconnect();
                        s2.disconnect();
                        resolve();
                    });
                }, 100);
            });

            setTimeout(() => reject(new Error('Test timed out')), 5000);
        });
    });

    await check("2. Disconnect Grace Period Forfeit (Simulated short timeout)", () => {
        return new Promise((resolve, reject) => {
            let s1 = io(SERVER_URL, { auth: { token: 'anon_A2' } });
            let s2 = io(SERVER_URL, { auth: { token: 'anon_B2' } });
            let matchId = null;

            s1.on('connect', () => { s1.emit('join_queue', { timeControl: 600 }); });
            s2.on('connect', () => { s2.emit('join_queue', { timeControl: 600 }); });

            s1.on('match_found', (data) => {
                matchId = data.matchId;
                s1.emit('connect_match', { matchId });
            });
            s2.on('match_found', (data) => {
                s2.emit('connect_match', { matchId: data.matchId });
            });

            s1.on('match_start', () => {
                s1.disconnect();
            });

            s2.on('opponent_disconnected', (data) => {
                assert(data.gracePeriodSeconds === 120, "Should broadcast 120s grace period");
                // We won't wait 120s in the test, so we just verify the event fired.
                s2.disconnect();
                resolve();
            });

            setTimeout(() => reject(new Error('Test timed out')), 5000);
        });
    });

    console.log(`\nTests completed: ${passed} passed, ${failed} failed`);
    if (failed > 0) process.exit(1);
}

runTests();
