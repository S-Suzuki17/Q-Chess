require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase1 = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const supabase2 = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function testMatchmaking() {
    console.log("=== QA Test: Matchmaking ===");
    
    const myId1 = 'USER1_' + Date.now();
    const myId2 = 'USER2_' + (Date.now() + 100);
    
    const channel1 = supabase1.channel('matchmaking_test_10m', {
        config: { presence: { key: myId1 } }
    });
    
    const channel2 = supabase2.channel('matchmaking_test_10m', {
        config: { presence: { key: myId2 } }
    });

    let matched1 = false;
    let matched2 = false;

    channel1.on('presence', { event: 'sync' }, () => {
        const state = channel1.presenceState();
        const keys = Object.keys(state).sort();
        console.log("C1 Presence Sync:", keys);
        if (keys.length >= 2 && keys[0] === myId1) {
            console.log("C1 is HOST! Sending match_ready");
            channel1.send({
                type: 'broadcast',
                event: 'match_ready',
                payload: { roomId: 'TEST_ROOM', hostKey: myId1, joinerKey: keys[1], mode: 'ranked' }
            });
            matched1 = true;
        }
    });

    channel2.on('broadcast', { event: 'match_ready' }, ({ payload }) => {
        console.log("C2 Received match_ready:", payload);
        if (payload.joinerKey === myId2) {
            matched2 = true;
            console.log("C2 Matched!");
        }
    });

    await new Promise(r => {
        channel1.subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
                console.log("C1 Subscribed, tracking...");
                await channel1.track({ test: 1 });
                r();
            }
        });
    });

    await new Promise(r => {
        channel2.subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
                console.log("C2 Subscribed, tracking...");
                await channel2.track({ test: 2 });
                r();
            }
        });
    });

    await new Promise(r => setTimeout(r, 2000));
    
    console.log("Matched 1:", matched1);
    console.log("Matched 2:", matched2);
    
    supabase1.removeChannel(channel1);
    supabase2.removeChannel(channel2);
}

testMatchmaking();
