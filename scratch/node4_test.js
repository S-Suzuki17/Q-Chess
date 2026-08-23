import { io } from 'socket.io-client';
import assert from 'assert';

const SERVER_URL = 'http://localhost:3001';

async function runTests() {
    console.log("Starting Node 4 Client-Server Integration Tests...");
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

    await check("1. 通常対局 (Matchmaking -> Play -> Sync)", () => {
        return new Promise((resolve, reject) => {
            const s1 = io(SERVER_URL, { auth: { token: 'userA' } });
            const s2 = io(SERVER_URL, { auth: { token: 'userB' } });

            let s1State = null;
            let s2State = null;
            let matchStartCount = 0;
            let matchFoundCount = 0;
            let matchId = null;

            s1.on('connect', () => { s1.emit('join_queue', { timeControl: 600 }); });
            s2.on('connect', () => { s2.emit('join_queue', { timeControl: 600 }); });

            s1.on('match_found', (data) => {
                matchId = data.matchId;
                matchFoundCount++;
                s1.emit('connect_match', { matchId });
            });
            s2.on('match_found', (data) => {
                matchFoundCount++;
                s2.emit('connect_match', { matchId: data.matchId });
            });

            const handleMatchStart = (state) => {
                matchStartCount++;
                if (matchStartCount === 2) {
                    const hostSocket = state.players.host === 'userA' ? s1 : s2;
                    const piece = state.pieces.find(p => p.x === 0 && p.y === 1);
                    hostSocket.emit('player_action', {
                        actionId: 'move1',
                        version: state.version,
                        action: { type: 'MOVE', payload: { pieceId: piece.id, toX: 0, toY: 2 } }
                    });
                }
            };

            s1.on('match_start', handleMatchStart);
            s2.on('match_start', handleMatchStart);

            s1.on('action_error', (data) => console.log('S1 Error:', data));
            s2.on('action_error', (data) => console.log('S2 Error:', data));
            
            let syncCount = 0;
            s1.on('sync_state', (state) => {
                if (syncCount === 0) {
                    syncCount++;
                    assert(state.version === 1, "Version incremented");
                    assert(state.turn === 1, "Turn changed to black");
                    s1.disconnect();
                    s2.disconnect();
                    resolve();
                }
            });
            
            setTimeout(() => reject(new Error('Test timed out')), 5000);
        });
    });

    await check("2. 不正操作 (Invalid action from client rejected by server)", () => {
        return new Promise((resolve, reject) => {
            const s1 = io(SERVER_URL, { auth: { token: 'userC' } });
            const s2 = io(SERVER_URL, { auth: { token: 'userD' } });
            let matchId = null;
            let matchStartCount = 0;

            s1.on('connect', () => { s1.emit('join_queue', { timeControl: 600 }); });
            s2.on('connect', () => { s2.emit('join_queue', { timeControl: 600 }); });

            s1.on('match_found', (data) => {
                matchId = data.matchId;
                s1.emit('connect_match', { matchId });
            });
            s2.on('match_found', (data) => {
                s2.emit('connect_match', { matchId: data.matchId });
            });

            const handleMatchStart2 = (state) => {
                matchStartCount++;
                if (matchStartCount === 2) {
                    const hostSocket = state.players.host === 'userC' ? s1 : s2;
                    const piece = state.pieces.find(p => p.x === 0 && p.y === 1);
                    hostSocket.emit('player_action', {
                        actionId: 'bad_move',
                        version: state.version,
                        action: { type: 'MOVE', payload: { pieceId: piece.id, toX: 3, toY: 5 } }
                    });
                }
            };

            s1.on('match_start', handleMatchStart2);
            s2.on('match_start', handleMatchStart2);

            s1.on('action_error', (data) => {
                assert(data.message.includes('Invalid'), "Should return invalid action error");
                s1.disconnect();
                s2.disconnect();
                resolve();
            });
            s2.on('action_error', (data) => {
                assert(data.message.includes('Invalid'), "Should return invalid action error");
                s1.disconnect();
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
