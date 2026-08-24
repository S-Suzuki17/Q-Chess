require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase1 = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const supabase2 = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function testMatchmaking() {
    console.log("=== QA Test: Matchmaking Exact ===");
    
    const myId1 = 'USER1_' + Date.now();
    const myId2 = 'USER2_' + (Date.now() + 100);
    
    const channel1 = supabase1.channel('matchmaking_test_exact', {
        config: { presence: { key: myId1 } }
    });
    
    const channel2 = supabase2.channel('matchmaking_test_exact', {
        config: { presence: { key: myId2 } }
    });

    let matched1 = false;
    let matched2 = false;

    const onPresenceSync = (channel, myId, isC1) => {
        const state = channel.presenceState();
        const keys = Object.keys(state);
        
        if (keys.length >= 2) {
            const sorted = keys.sort((a, b) => {
                const tsA = parseInt(a.split('_')[1] || '0');
                const tsB = parseInt(b.split('_')[1] || '0');
                return tsB - tsA;
            });
            
            console.log(isC1 ? "C1" : "C2", "Sorted keys:", sorted);
            
            for (let i = 0; i < sorted.length - 1; i += 2) {
                const hostKey = sorted[i];
                const joinerKey = sorted[i + 1];
                
                if (hostKey === myId) {
                    console.log((isC1 ? "C1" : "C2") + " is HOST! Sending match_ready");
                    channel.send({
                        type: 'broadcast',
                        event: 'match_ready',
                        payload: { roomId: 'ROOM', hostKey: myId, joinerKey, mode: 'ranked' }
                    });
                    if (isC1) matched1 = true; else matched2 = true;
                    return;
                }
            }
        }
    };

    const onMatchReady = (payload, myId, isC1) => {
        if (payload.joinerKey === myId) {
            console.log((isC1 ? "C1" : "C2") + " is JOINER! Matched!");
            if (isC1) matched1 = true; else matched2 = true;
        }
    };

    channel1.on('presence', { event: 'sync' }, () => onPresenceSync(channel1, myId1, true));
    channel2.on('presence', { event: 'sync' }, () => onPresenceSync(channel2, myId2, false));

    channel1.on('broadcast', { event: 'match_ready' }, ({ payload }) => onMatchReady(payload, myId1, true));
    channel2.on('broadcast', { event: 'match_ready' }, ({ payload }) => onMatchReady(payload, myId2, false));

    channel1.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') await channel1.track({ test: 1 });
    });
    channel2.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') await channel2.track({ test: 2 });
    });

    await new Promise(r => setTimeout(r, 2000));
    
    console.log("Matched 1:", matched1);
    console.log("Matched 2:", matched2);
    
    supabase1.removeChannel(channel1);
    supabase2.removeChannel(channel2);
}

testMatchmaking();
